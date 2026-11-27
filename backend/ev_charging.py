# ------------------------------------------------------------
# ev_charging.py - Feature 4: EV charging slot coordination & turnover
#
# Pricing: an EV charger is booked for a CHARGING TIME (30 min ... 4 h)
# and paid per minute of that time at the EV tariff ($5.00 / hour),
# not by whole parking hours. Charging time starts at check-in.
#
# Turnover: a car that is already full must not block the charger for
# the next EV driver. The grace worker runs ev_turnover_check() every
# round and tells the driver:
#   - SOON_MINUTES before the end:  "charging ends at 14:30"
#   - when the charging time ends:  "move within IDLE_GRACE_MINUTES minutes"
#   - after that grace time:        an idle fee of IDLE_FEE_PER_MINUTE
#                                   per started minute (max IDLE_FEE_CAP)
#                                   starts; the operator is told too.
# The idle fee is added to the bill at check-out (or when the camera
# sees the car leave). GET /api/ev/chargers shows incoming EV drivers
# when each charger is expected to be free.
# ------------------------------------------------------------
import datetime
import math

from fastapi import APIRouter, Depends

import database
from auth import require_user
from notifications import notify, notify_operators

router = APIRouter(prefix="/api/ev", tags=["EV charging"])

EV_RATE_PER_HOUR = 5.00         # same as SLOT_TYPE_RATES["ev_charging"]
CHARGE_OPTIONS_MINUTES = [30, 60, 90, 120, 180, 240]
SOON_MINUTES = 10               # "charging ends soon" warning
IDLE_GRACE_MINUTES = 10         # time to move the car after charging ends
IDLE_FEE_PER_MINUTE = 0.50
IDLE_FEE_CAP = 30.00

# turnover stages stored in reservations.turnover_stage
CHARGING, ENDING_SOON, CHARGED, IDLE = 0, 1, 2, 3


def ensure_ev_columns():
    """idle_fee       - fee for blocking the charger after charging (set at check-out)
       turnover_stage - which turnover message the driver has had (0-3, see above)"""
    conn = database.get_connection()
    with conn.cursor() as cur:
        database.add_column(cur, "reservations", "idle_fee", "DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER fees_included")
        database.add_column(cur, "reservations", "turnover_stage", "TINYINT NOT NULL DEFAULT 0 AFTER idle_fee")
    conn.close()


def rules():
    return {
        "rate_per_hour": EV_RATE_PER_HOUR,
        "charge_options": CHARGE_OPTIONS_MINUTES,
        "soon_minutes": SOON_MINUTES,
        "idle_grace_minutes": IDLE_GRACE_MINUTES,
        "idle_fee_per_minute": IDLE_FEE_PER_MINUTE,
        "idle_fee_cap": IDLE_FEE_CAP,
    }


def turnover_stage(end_time, now):
    """Where a checked-in EV session is, compared with the end of its charging time."""
    if now >= end_time + datetime.timedelta(minutes=IDLE_GRACE_MINUTES):
        return IDLE
    if now >= end_time:
        return CHARGED
    if now >= end_time - datetime.timedelta(minutes=SOON_MINUTES):
        return ENDING_SOON
    return CHARGING


def idle_minutes(end_time, now):
    """Started minutes a fully charged car has stayed after the grace time."""
    over = (now - end_time).total_seconds() / 60 - IDLE_GRACE_MINUTES
    return max(0, math.ceil(over))


def idle_fee(end_time, now):
    return round(min(IDLE_FEE_CAP, idle_minutes(end_time, now) * IDLE_FEE_PER_MINUTE), 2)


def ev_turnover_check(cur):
    """Worker job: send each checked-in EV driver the next turnover message."""
    now = datetime.datetime.now()
    cur.execute("""
        SELECT r.id, r.user_id, r.license_plate, r.end_time, r.turnover_stage, s.slot_code
        FROM reservations r JOIN slots s ON s.id = r.slot_id
        WHERE r.status = 'active' AND s.slot_type = 'ev_charging'""")
    for res in cur.fetchall():
        stage = turnover_stage(res["end_time"], now)
        if stage <= res["turnover_stage"]:
            continue
        code, ends = res["slot_code"], res["end_time"].strftime("%H:%M")
        # only the newest message, even if the worker skipped a stage
        if stage == ENDING_SOON:
            notify(cur, res["user_id"], "ev_ending_soon", f"Charging at {code} ends at {ends}",
                   "Please be ready to move your car then, so the next EV driver can charge.")
        elif stage == CHARGED:
            notify(cur, res["user_id"], "ev_charged", f"Charging at {code} is complete",
                   f"Please move your car within {IDLE_GRACE_MINUTES} minutes and check out. After that an idle fee "
                   f"of ${IDLE_FEE_PER_MINUTE:.2f} per minute applies (max ${IDLE_FEE_CAP:.2f}).")
        else:
            notify(cur, res["user_id"], "ev_idle_fee", f"Idle fee started at {code}",
                   f"Your car is fully charged but still at {code}. ${IDLE_FEE_PER_MINUTE:.2f} per minute is added "
                   f"to your bill until you check out (max ${IDLE_FEE_CAP:.2f}).")
            notify_operators(cur, "ev_idle", f"Charger {code} is blocked",
                             f"{res['license_plate']} finished charging at {ends} and has not moved. "
                             "The idle fee is running.")
        print(f"[EV] {code}: turnover stage {stage} for {res['license_plate']}")
        cur.execute("UPDATE reservations SET turnover_stage = %s WHERE id = %s", (stage, res["id"]))


def _iso(value):
    return value.isoformat(timespec="seconds") if value else None


@router.get("/chargers")
def charger_status(user=Depends(require_user)):
    """Every EV charger with its state and when it is expected to be free.
    Drivers do not see other drivers' plates; the operator does."""
    now = datetime.datetime.now()
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id, slot_code, status FROM slots WHERE slot_type = 'ev_charging' ORDER BY slot_code")
        chargers = cur.fetchall()
        cur.execute("""
            SELECT r.* FROM reservations r JOIN slots s ON s.id = r.slot_id
            WHERE s.slot_type = 'ev_charging' AND r.status IN ('pending', 'active')""")
        bookings = {r["slot_id"]: r for r in cur.fetchall()}
        cur.execute("SELECT COUNT(*) AS n FROM waitlist WHERE status = 'waiting' AND slot_type = 'ev_charging'")
        queue = cur.fetchone()["n"]
    conn.close()

    out = []
    for slot in chargers:
        res = bookings.get(slot["id"])
        item = {"slot_id": slot["id"], "slot_code": slot["slot_code"], "state": slot["status"],
                "started_at": None, "ends_at": None, "free_at": None, "idle_minutes": 0, "idle_fee": 0.0}
        if res is None:
            # no booking: free, or a car the camera sees without a booking (unknown)
            item["free_at"] = _iso(now) if slot["status"] == "free" else None
        elif res["status"] == "pending":
            item["state"] = "reserved"  # latest: driver arrives at the deadline and charges fully
            minutes = res["charging_minutes"] or res["duration_hours"] * 60
            item["free_at"] = _iso(res["grace_deadline"] + datetime.timedelta(minutes=minutes))
        else:
            stage = turnover_stage(res["end_time"], now)
            item["state"] = "charged" if stage == CHARGED else "idle" if stage == IDLE else "charging"
            item["started_at"] = _iso(res["checked_in_at"])
            item["ends_at"] = _iso(res["end_time"])
            if stage == IDLE:
                item["free_at"] = None  # overdue: the driver has not moved
            elif stage == CHARGED:
                item["free_at"] = _iso(res["end_time"] + datetime.timedelta(minutes=IDLE_GRACE_MINUTES))
            else:
                item["free_at"] = _iso(res["end_time"])
            item["idle_minutes"] = idle_minutes(res["end_time"], now)
            item["idle_fee"] = idle_fee(res["end_time"], now)
        if res is not None and user["role"] == "operator":
            item["license_plate"] = res["license_plate"]
            item["driver_name"] = res["driver_name"]
        out.append(item)

    times = [c["free_at"] for c in out if c["free_at"]]
    return {"chargers": out, "next_free_at": min(times) if times else None, "queue": queue, "rules": rules()}
