# ------------------------------------------------------------
# notifications.py - personal messages for one account
#
# The booking system tells a driver about things that happen while
# they are not looking at the page: a booking expired, a space from
# the waitlist was booked for them, their EV finished charging, ...
# The bell in the website's top bar polls GET /api/notifications.
# ------------------------------------------------------------
import datetime

from fastapi import APIRouter, Depends

import database
from auth import require_user

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def ensure_notification_table():
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              kind VARCHAR(30) NOT NULL,
              title VARCHAR(120) NOT NULL,
              message VARCHAR(500) NOT NULL,
              is_read TINYINT(1) NOT NULL DEFAULT 0,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_notifications_user (user_id, id),
              CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )""")
    conn.close()


def notify(cur, user_id, kind, title, message):
    """Leave a message for one account (bookings made before accounts existed have no user)."""
    if user_id is None:
        return
    cur.execute("INSERT INTO notifications (user_id, kind, title, message) VALUES (%s, %s, %s, %s)",
                (user_id, kind, title[:120], message[:500]))


def notify_operators(cur, kind, title, message):
    """Leave the same message for every operator (admin) account."""
    cur.execute("""
        INSERT INTO notifications (user_id, kind, title, message)
        SELECT id, %s, %s, %s FROM users WHERE role = 'operator'""", (kind, title[:120], message[:500]))


@router.get("")
def my_notifications(limit: int = 30, user=Depends(require_user)):
    """The newest messages for the logged-in account."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, kind, title, message, is_read, created_at FROM notifications
            WHERE user_id = %s ORDER BY id DESC LIMIT %s""", (user["id"], max(1, min(limit, 100))))
        rows = cur.fetchall()
    conn.close()
    for row in rows:
        row["is_read"] = bool(row["is_read"])
        if isinstance(row["created_at"], datetime.datetime):
            row["created_at"] = row["created_at"].isoformat(timespec="seconds")
    return rows


@router.post("/read")
def mark_all_read(user=Depends(require_user)):
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("UPDATE notifications SET is_read = 1 WHERE user_id = %s AND is_read = 0", (user["id"],))
    conn.close()
    return {"message": "All notifications marked as read"}
