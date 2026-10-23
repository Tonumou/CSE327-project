# ------------------------------------------------------------
# reservation_backend.py
# Feature 3: Driver Slot Reservation Engine & Grace Period Worker
# Author: Tamanna Akter Mou (ID: 2211951042)
# ------------------------------------------------------------
import datetime
import random
import string
import threading
import time
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pymysql

# Import database settings from main backend
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
import config
import database

router = APIRouter(prefix="/api/reservations", tags=["Reservations"])

GRACE_PERIOD_MINUTES = 15

# ---------- Pydantic Request Models ----------

class ReservationCreate(BaseModel):
    slot_id: int
    driver_name: str
    driver_email: str
    license_plate: str
    duration_hours: int = 1
    slot_type: Optional[str] = "standard"


class CheckinRequest(BaseModel):
    checkin_pin: str


# ---------- Database Helpers ----------

def generate_reservation_code() -> str:
    letters = "".join(random.choices(string.ascii_uppercase, k=3))
    digits = "".join(random.choices(string.digits, k=4))
    return f"RES-{letters}{digits}"


def generate_pin() -> str:
    return "".join(random.choices(string.digits, k=4))


def ensure_reservation_tables():
    """Ensure the reservations table and slot columns exist in MySQL."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        # Check if slot_type exists in slots
        cur.execute("SHOW COLUMNS FROM slots LIKE 'slot_type'")
        if not cur.fetchone():
            try:
                cur.execute("""
                    ALTER TABLE slots
                    ADD COLUMN slot_type ENUM('standard', 'ev_charging', 'handicapped') NOT NULL DEFAULT 'standard' AFTER points,
                    ADD COLUMN hourly_rate DECIMAL(5,2) NOT NULL DEFAULT 2.50 AFTER slot_type
                """)
            except Exception:
                pass

        # Check and expand status ENUM if needed
        try:
            cur.execute("ALTER TABLE slots MODIFY COLUMN status ENUM('free','occupied','reserved') NOT NULL DEFAULT 'free'")
        except Exception:
            pass

        # Create reservations table if not exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS reservations (
              id INT AUTO_INCREMENT PRIMARY KEY,
              reservation_code VARCHAR(16) NOT NULL UNIQUE,
              slot_id INT NOT NULL,
              driver_name VARCHAR(100) NOT NULL,
              driver_email VARCHAR(120) NOT NULL,
              license_plate VARCHAR(30) NOT NULL,
              start_time DATETIME NOT NULL,
              end_time DATETIME NOT NULL,
              duration_hours INT NOT NULL DEFAULT 1,
              total_price DECIMAL(6,2) NOT NULL DEFAULT 0.00,
              status ENUM('pending', 'active', 'completed', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
              grace_deadline DATETIME NOT NULL,
              checkin_pin VARCHAR(6) NOT NULL,
              checked_in_at DATETIME NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT fk_res_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
            )
        """)
    conn.close()


# ---------- REST API Endpoints ----------

@router.get("/active")
def get_active_reservations():
    """Return all currently pending or active driver reservations."""
    ensure_reservation_tables()
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT r.*, s.slot_code, s.slot_type, s.hourly_rate
            FROM reservations r
            JOIN slots s ON r.slot_id = s.id
            WHERE r.status IN ('pending', 'active')
            ORDER BY r.created_at DESC
        """)
        rows = cur.fetchall()
    conn.close()

    for r in rows:
        r["start_time"] = str(r["start_time"])
        r["end_time"] = str(r["end_time"])
        r["grace_deadline"] = str(r["grace_deadline"])
        r["created_at"] = str(r["created_at"])
        if r.get("checked_in_at"):
            r["checked_in_at"] = str(r["checked_in_at"])
        if r.get("total_price") is not None:
            r["total_price"] = float(r["total_price"])
        if r.get("hourly_rate") is not None:
            r["hourly_rate"] = float(r["hourly_rate"])
    return rows


@router.post("")
def create_reservation(data: ReservationCreate):
    """Book a vacant parking slot."""
    ensure_reservation_tables()
    conn = database.get_connection()
    with conn.cursor() as cur:
        # Check slot availability
        cur.execute("SELECT * FROM slots WHERE id = %s", (data.slot_id,))
        slot = cur.fetchone()
        if not slot:
            conn.close()
            raise HTTPException(404, "Selected parking slot does not exist")

        if slot["status"] != "free":
            conn.close()
            raise HTTPException(400, f"Slot {slot['slot_code']} is currently {slot['status']}")

        # Calculate time windows
        now = datetime.datetime.now()
        start_time = now
        end_time = now + datetime.timedelta(hours=data.duration_hours)
        grace_deadline = now + datetime.timedelta(minutes=GRACE_PERIOD_MINUTES)
        hourly_rate = float(slot.get("hourly_rate") or 2.50)
        total_price = round(hourly_rate * data.duration_hours, 2)

        res_code = generate_reservation_code()
        pin = generate_pin()

        # Insert reservation
        cur.execute("""
            INSERT INTO reservations
            (reservation_code, slot_id, driver_name, driver_email, license_plate,
             start_time, end_time, duration_hours, total_price, status, grace_deadline, checkin_pin)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
        """, (
            res_code, data.slot_id, data.driver_name.strip(), data.driver_email.strip(),
            data.license_plate.strip().upper(), start_time, end_time, data.duration_hours,
            total_price, grace_deadline, pin
        ))
        res_id = cur.lastrowid

        # Update slot status to reserved
        cur.execute("UPDATE slots SET status = 'reserved' WHERE id = %s", (data.slot_id,))
    conn.close()

    return {
        "id": res_id,
        "reservation_code": res_code,
        "slot_code": slot["slot_code"],
        "checkin_pin": pin,
        "total_price": total_price,
        "grace_deadline": str(grace_deadline),
        "message": f"Slot {slot['slot_code']} reserved! Check in within 15 minutes."
    }


@router.post("/{res_id}/checkin")
def checkin_reservation(res_id: int, req: CheckinRequest):
    """Driver checks in upon arriving at the parking lot."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM reservations WHERE id = %s", (res_id,))
        res = cur.fetchone()
        if not res:
            conn.close()
            raise HTTPException(404, "Reservation not found")

        if res["status"] != "pending":
            conn.close()
            raise HTTPException(400, f"Reservation is already {res['status']}")

        if str(res["checkin_pin"]).strip() != req.checkin_pin.strip():
            conn.close()
            raise HTTPException(400, "Invalid 4-digit PIN")

        now = datetime.datetime.now()
        cur.execute("""
            UPDATE reservations
            SET status = 'active', checked_in_at = %s
            WHERE id = %s
        """, (now, res_id))

        # Mark slot occupied
        cur.execute("UPDATE slots SET status = 'occupied' WHERE id = %s", (res["slot_id"],))
    conn.close()
    return {"message": "Check-in successful! Welcome to your parking spot.", "status": "active"}


@router.post("/{res_id}/cancel")
def cancel_reservation(res_id: int):
    """Driver cancels their reservation."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM reservations WHERE id = %s", (res_id,))
        res = cur.fetchone()
        if not res:
            conn.close()
            raise HTTPException(404, "Reservation not found")

        cur.execute("UPDATE reservations SET status = 'cancelled' WHERE id = %s", (res_id,))
        # Free up slot
        cur.execute("UPDATE slots SET status = 'free' WHERE id = %s", (res["slot_id"],))
    conn.close()
    return {"message": "Reservation cancelled. Slot is now free.", "status": "cancelled"}


# ---------- Background Dynamic Grace Period Auto-Release Worker ----------

class GracePeriodWorker:
    def __init__(self, check_interval_seconds=30):
        self.interval = check_interval_seconds
        self.running = False

    def check_expired_reservations(self):
        """Find pending reservations past their 15-minute grace deadline and auto-release them."""
        try:
            conn = database.get_connection()
            with conn.cursor() as cur:
                now = datetime.datetime.now()
                # Find pending reservations that exceeded grace deadline
                cur.execute("""
                    SELECT id, slot_id, reservation_code
                    FROM reservations
                    WHERE status = 'pending' AND grace_deadline < %s
                """, (now,))
                expired = cur.fetchall()

                for row in expired:
                    print(f"[GraceWorker] Reservation {row['reservation_code']} expired! Auto-releasing slot.")
                    cur.execute("UPDATE reservations SET status = 'expired' WHERE id = %s", (row["id"],))
                    cur.execute("UPDATE slots SET status = 'free' WHERE id = %s", (row["slot_id"],))

            conn.close()
        except Exception as e:
            print("[GraceWorker] Check error:", e)

    def run(self):
        self.running = True
        print("[GraceWorker] Started 15-minute grace-period auto-release worker.")
        while self.running:
            self.check_expired_reservations()
            time.sleep(self.interval)

    def start(self):
        t = threading.Thread(target=self.run, daemon=True)
        t.start()

    def stop(self):
        self.running = False


grace_worker = GracePeriodWorker()
