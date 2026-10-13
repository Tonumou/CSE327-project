# ------------------------------------------------------------
# database.py - every MySQL query used by the project
# ------------------------------------------------------------
import json

import pymysql
import config


def get_connection(use_db=True):
    """Open a new connection to the XAMPP MySQL server."""
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME if use_db else None,
        cursorclass=pymysql.cursors.DictCursor,  # rows come back as dicts
        autocommit=True,
    )


def init_database():
    """Create the database and tables if they do not exist yet."""
    conn = get_connection(use_db=False)
    with conn.cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS {config.DB_NAME}")
    conn.close()

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS slots (
              id INT AUTO_INCREMENT PRIMARY KEY,
              slot_code VARCHAR(20) NOT NULL UNIQUE,
              x1 INT NOT NULL, y1 INT NOT NULL,
              x2 INT NOT NULL, y2 INT NOT NULL,
              points TEXT NULL,
              status ENUM('free','occupied') NOT NULL DEFAULT 'free',
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP
            )""")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS detection_logs (
              id INT AUTO_INCREMENT PRIMARY KEY,
              total_slots INT NOT NULL,
              free_slots INT NOT NULL,
              occupied_slots INT NOT NULL,
              cars_detected INT NOT NULL,
              cars_outside_slots INT NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
        # databases created by the first version have no "points" column -> add it
        cur.execute("SHOW COLUMNS FROM slots LIKE 'points'")
        if not cur.fetchone():
            cur.execute("ALTER TABLE slots ADD COLUMN points TEXT NULL AFTER y2")
    conn.close()


# ---------------- slots ----------------

def get_slots():
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM slots ORDER BY slot_code")
        rows = cur.fetchall()
    conn.close()
    for row in rows:
        row["updated_at"] = str(row["updated_at"])  # make the timestamp JSON friendly
        # points are stored as text '[[x,y],[x,y],[x,y],[x,y]]' -> Python list
        row["points"] = json.loads(row["points"]) if row["points"] else None
    return rows


def add_slot(slot_code, x1, y1, x2, y2, points=None):
    """points = 4 corners [[x,y],...] for a tilted slot, or None for a rectangle."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO slots (slot_code, x1, y1, x2, y2, points) VALUES (%s,%s,%s,%s,%s,%s)",
            (slot_code, x1, y1, x2, y2, json.dumps(points) if points else None),
        )
        new_id = cur.lastrowid
    conn.close()
    return new_id


def delete_slot(slot_id):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM slots WHERE id = %s", (slot_id,))
    conn.close()


def delete_all_slots():
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM slots")
    conn.close()


def update_slot_status(slot_id, status):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("UPDATE slots SET status = %s WHERE id = %s", (status, slot_id))
    conn.close()


# ---------------- detection logs ----------------

def add_log(total, free, occupied, cars, outside):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO detection_logs
               (total_slots, free_slots, occupied_slots, cars_detected, cars_outside_slots)
               VALUES (%s,%s,%s,%s,%s)""",
            (total, free, occupied, cars, outside),
        )
    conn.close()


def get_logs(limit=20):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM detection_logs ORDER BY id DESC LIMIT %s", (limit,))
        rows = cur.fetchall()
    conn.close()
    for row in rows:
        row["created_at"] = str(row["created_at"])
    return rows
