# ------------------------------------------------------------
# penalties.py - Feature 3: no-show penalty policy
#
# A "no-show" is a booking whose 15-minute grace period ran out without
# a check-in (the grace worker marks it 'expired' and frees the space).
#
#   1. Fee: every no-show costs NO_SHOW_FEE_HOURS hour(s) of that space's
#      tariff. There is no online payment in this project, so the fee is
#      added to the driver's NEXT booking and shown on that ticket.
#   2. Repeat no-shows: NO_SHOW_LIMIT no-shows within NO_SHOW_WINDOW_DAYS
#      days pause booking (and joining the waitlist) for
#      BOOKING_BLOCK_HOURS hours after the latest one.
#
# Cancelling before the grace period ends is always free.
# ------------------------------------------------------------
import datetime

from fastapi import APIRouter, Depends, HTTPException

import database
from auth import require_user

router = APIRouter(prefix="/api/penalties", tags=["Penalties"])

NO_SHOW_FEE_HOURS = 1
NO_SHOW_LIMIT = 3
NO_SHOW_WINDOW_DAYS = 30
BOOKING_BLOCK_HOURS = 24


def ensure_penalty_columns():
    """penalty_fee     - fee charged for this booking because it was a no-show
       penalty_paid_by - id of the later booking whose ticket collected that fee
       fees_included   - old no-show fees added to this booking's total"""
    conn = database.get_connection()
    with conn.cursor() as cur:
        database.add_column(cur, "reservations", "penalty_fee", "DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER total_price")
        database.add_column(cur, "reservations", "penalty_paid_by", "INT NULL AFTER penalty_fee")
        database.add_column(cur, "reservations", "fees_included", "DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER penalty_paid_by")
    conn.close()


def _time(value):
    return value.strftime("%d %b %H:%M")


def penalty_status(cur, user_id):
    """No-shows in the window, unpaid fees and (if any) until when booking is paused."""
    now = datetime.datetime.now()
    cur.execute("""
        SELECT COUNT(*) AS n, MAX(grace_deadline) AS last_no_show FROM reservations
        WHERE user_id = %s AND status = 'expired' AND grace_deadline >= %s""",
                (user_id, now - datetime.timedelta(days=NO_SHOW_WINDOW_DAYS)))
    row = cur.fetchone()
    cur.execute("""
        SELECT COALESCE(SUM(penalty_fee), 0) AS fees FROM reservations
        WHERE user_id = %s AND penalty_fee > 0 AND penalty_paid_by IS NULL""", (user_id,))
    unpaid = round(float(cur.fetchone()["fees"]), 2)

    blocked_until = None
    if row["n"] >= NO_SHOW_LIMIT:
        until = row["last_no_show"] + datetime.timedelta(hours=BOOKING_BLOCK_HOURS)
        if until > now:
            blocked_until = until
    return {
        "no_shows": int(row["n"]),
        "unpaid_fees": unpaid,
        "blocked_until": blocked_until.isoformat(timespec="seconds") if blocked_until else None,
        "rules": {
            "fee_hours": NO_SHOW_FEE_HOURS,
            "limit": NO_SHOW_LIMIT,
            "window_days": NO_SHOW_WINDOW_DAYS,
            "block_hours": BOOKING_BLOCK_HOURS,
        },
    }


def check_can_book(cur, user_id):
    """Stops a driver whose booking is paused because of repeated no-shows."""
    status = penalty_status(cur, user_id)
    if status["blocked_until"]:
        until = datetime.datetime.fromisoformat(status["blocked_until"])
        raise HTTPException(403, f"Booking is paused until {_time(until)} because of {status['no_shows']} "
                                 f"no-shows in the last {NO_SHOW_WINDOW_DAYS} days.")


def apply_no_show(cur, res):
    """Charge the no-show fee on an expired booking. Returns a sentence for the driver."""
    fee = round(float(res.get("hourly_rate") or 2.50) * NO_SHOW_FEE_HOURS, 2)
    cur.execute("UPDATE reservations SET penalty_fee = %s WHERE id = %s", (fee, res["id"]))
    text = f" A no-show fee of ${fee:.2f} will be added to your next booking."
    if res.get("user_id") is not None:
        status = penalty_status(cur, res["user_id"])
        if status["blocked_until"]:
            until = datetime.datetime.fromisoformat(status["blocked_until"])
            text += (f" That is {status['no_shows']} no-shows in {NO_SHOW_WINDOW_DAYS} days, "
                     f"so booking is paused until {_time(until)}.")
    return text


def collect_unpaid_fees(cur, user_id, new_res_id):
    """Move the driver's unpaid no-show fees onto their new booking. Returns the amount."""
    cur.execute("""
        SELECT COALESCE(SUM(penalty_fee), 0) AS fees FROM reservations
        WHERE user_id = %s AND penalty_fee > 0 AND penalty_paid_by IS NULL AND id <> %s""",
                (user_id, new_res_id))
    fees = round(float(cur.fetchone()["fees"]), 2)
    if fees:
        cur.execute("""
            UPDATE reservations SET penalty_paid_by = %s
            WHERE user_id = %s AND penalty_fee > 0 AND penalty_paid_by IS NULL AND id <> %s""",
                    (new_res_id, user_id, new_res_id))
    return fees


def return_unpaid_fees(cur, res_id):
    """The booking that carried old fees was cancelled or missed: those fees are
    still owed, so they go back to 'unpaid' and move to the next booking."""
    cur.execute("UPDATE reservations SET penalty_paid_by = NULL WHERE penalty_paid_by = %s", (res_id,))


@router.get("/me")
def my_penalties(user=Depends(require_user)):
    """The logged-in driver's no-show record (shown on the Reserve a Spot page)."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        status = penalty_status(cur, user["id"])
    conn.close()
    return status
