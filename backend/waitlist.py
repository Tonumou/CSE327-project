# ------------------------------------------------------------
# waitlist.py - Feature 3: waiting list for a full car park
#
# A driver who finds no free space of the type they need (standard,
# EV charging or accessible) joins the queue for that type. Each round
# of the grace worker - and straight away when a booking is cancelled,
# expires or is checked out - assign_waitlist() gives every free space
# to the FIRST driver waiting for that type: the space is booked for
# them automatically (normal 15-minute grace period, new PIN) and they
# get a notification. While drivers are waiting for a type, a free space
# of that type cannot be booked by someone outside the queue.
# A driver leaves the queue when they choose to, when they book a space
# directly, or when the waiting time they chose is over.
# ------------------------------------------------------------
import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import database
import penalties
import reservation_backend as rb
from auth import require_user
from notifications import notify

router = APIRouter(prefix="/api/waitlist", tags=["Waitlist"])

TYPE_NAMES = {"standard": "standard", "ev_charging": "EV charging", "handicapped": "accessible"}


class WaitlistJoin(BaseModel):
    slot_type: Literal["standard", "ev_charging", "handicapped"] = "standard"
    driver_name: str = Field(min_length=1, max_length=100)
    driver_email: str = Field(min_length=3, max_length=120)
    license_plate: str = Field(min_length=1, max_length=30)
    duration_hours: int = Field(default=1, ge=1, le=24)
    charging_minutes: Optional[int] = Field(default=None, ge=15, le=480)  # EV queue only (Feature 4)
    wait_minutes: int = Field(default=60, ge=15, le=240)  # leave the queue after this


def ensure_waitlist_table():
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS waitlist (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              driver_name VARCHAR(100) NOT NULL,
              driver_email VARCHAR(120) NOT NULL,
              license_plate VARCHAR(30) NOT NULL,
              slot_type ENUM('standard', 'ev_charging', 'handicapped') NOT NULL DEFAULT 'standard',
              duration_hours INT NOT NULL DEFAULT 1,
              charging_minutes INT NULL,
              status ENUM('waiting', 'assigned', 'left', 'timed_out') NOT NULL DEFAULT 'waiting',
              reservation_id INT NULL,
              created_at DATETIME NOT NULL,
              expires_at DATETIME NOT NULL,
              assigned_at DATETIME NULL,
              INDEX idx_waitlist_queue (status, slot_type, created_at),
              CONSTRAINT fk_waitlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )""")
        database.add_column(cur, "waitlist", "charging_minutes", "INT NULL AFTER duration_hours")
    conn.close()


def _waiting_entry(cur, user_id):
    cur.execute("SELECT * FROM waitlist WHERE user_id = %s AND status = 'waiting' LIMIT 1", (user_id,))
    return cur.fetchone()


def waitlist_status(cur, user_id):
    """The driver's place in the queue, and how many drivers wait for each type."""
    entry = _waiting_entry(cur, user_id)
    position = None
    if entry:
        cur.execute("""
            SELECT COUNT(*) AS ahead FROM waitlist
            WHERE status = 'waiting' AND slot_type = %s
              AND (created_at < %s OR (created_at = %s AND id < %s))""",
                    (entry["slot_type"], entry["created_at"], entry["created_at"], entry["id"]))
        position = cur.fetchone()["ahead"] + 1
        entry = rb._public(entry)
    cur.execute("SELECT slot_type, COUNT(*) AS n FROM waitlist WHERE status = 'waiting' GROUP BY slot_type")
    queue = {t: 0 for t in TYPE_NAMES}
    queue.update({row["slot_type"]: row["n"] for row in cur.fetchall()})
    return {"entry": entry, "position": position, "queue": queue}


def assign_waitlist(cur):
    """Worker job: hand free spaces to the drivers at the front of the queue."""
    with rb.BOOKING_LOCK:
        now = datetime.datetime.now()
        cur.execute("SELECT * FROM waitlist WHERE status = 'waiting' ORDER BY created_at, id")
        for entry in cur.fetchall():
            kind = TYPE_NAMES[entry["slot_type"]]
            if entry["expires_at"] < now:
                cur.execute("UPDATE waitlist SET status = 'timed_out' WHERE id = %s", (entry["id"],))
                notify(cur, entry["user_id"], "waitlist_timeout", "You left the waitlist",
                       f"No {kind} space became free within your waiting time, so you were taken off the waitlist.")
                continue
            if rb.open_booking_of(cur, entry["user_id"]):  # booked some other way meanwhile
                cur.execute("UPDATE waitlist SET status = 'left' WHERE id = %s", (entry["id"],))
                continue

            slot = rb.find_free_slot(cur, entry["slot_type"])
            if not slot or not rb.claim_slot(cur, slot["id"]):
                continue  # nothing free for this type yet: keep waiting
            try:
                ticket = rb.insert_reservation(cur, entry["user_id"], slot, entry["driver_name"],
                                               entry["driver_email"], entry["license_plate"], entry["duration_hours"],
                                               entry["charging_minutes"])
            except Exception:
                rb.release_slot(cur, slot["id"])
                raise
            cur.execute("UPDATE waitlist SET status = 'assigned', reservation_id = %s, assigned_at = %s WHERE id = %s",
                        (ticket["id"], now, entry["id"]))
            print(f"[Waitlist] {slot['slot_code']} booked for waiting driver {entry['license_plate']} "
                  f"({ticket['reservation_code']}).")
            notify(cur, entry["user_id"], "waitlist_assigned", f"Space {slot['slot_code']} is booked for you",
                   f"A {kind} space became free and we booked {slot['slot_code']} for you "
                   f"({ticket['reservation_code']}, total ${ticket['total_price']:.2f}). "
                   f"Arrive within {rb.GRACE_PERIOD_MINUTES} minutes and check in with PIN {ticket['checkin_pin']}.")


# ---------- REST API Endpoints ----------

@router.post("")
def join_waitlist(body: WaitlistJoin, user=Depends(require_user)):
    """Join the queue for the next free space of one type."""
    now = datetime.datetime.now()
    conn = database.get_connection()
    try:
        with rb.BOOKING_LOCK, conn.cursor() as cur:
            penalties.check_can_book(cur, user["id"])
            if rb.open_booking_of(cur, user["id"]):
                raise HTTPException(400, "You already have a booking, so you cannot join the waitlist.")
            if _waiting_entry(cur, user["id"]):
                raise HTTPException(400, "You are already on the waitlist.")
            cur.execute("""
                INSERT INTO waitlist (user_id, driver_name, driver_email, license_plate, slot_type,
                                      duration_hours, charging_minutes, created_at, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (user["id"], body.driver_name.strip(), body.driver_email.strip(),
                         body.license_plate.strip().upper(), body.slot_type, body.duration_hours,
                         body.charging_minutes if body.slot_type == "ev_charging" else None,
                         now, now + datetime.timedelta(minutes=body.wait_minutes)))
        with conn.cursor() as cur:
            assign_waitlist(cur)  # a matching space may be free right now
            status = waitlist_status(cur, user["id"])
    finally:
        conn.close()
    if status["entry"] is None:
        return {**status, "message": "A space was free, so it was booked for you straight away."}
    return {**status, "message": f"You are number {status['position']} on the waitlist. "
                                 "We will book the first free space for you."}


@router.get("/me")
def my_waitlist(user=Depends(require_user)):
    conn = database.get_connection()
    with conn.cursor() as cur:
        status = waitlist_status(cur, user["id"])
    conn.close()
    return status


@router.post("/leave")
def leave_waitlist(user=Depends(require_user)):
    conn = database.get_connection()
    with conn.cursor() as cur:
        left = cur.execute("UPDATE waitlist SET status = 'left' WHERE user_id = %s AND status = 'waiting'",
                           (user["id"],))
    conn.close()
    if not left:
        raise HTTPException(404, "You are not on the waitlist")
    return {"message": "You left the waitlist."}
