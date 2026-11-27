-- ============================================================
--  Smart Parking - Reservation System Extension (Feature 3)
--  Author: Tamanna Akter Mou (ID: 2211951042)
--  Database: MySQL / MariaDB (XAMPP)
--
--  The backend creates all of this by itself when it starts
--  (auth.py, reservation_backend.py, notifications.py,
--  penalties.py, waitlist.py). Import this file only if you want
--  to create the tables by hand, AFTER smart_parking.sql.
--  It can be imported again without errors.
-- ============================================================

USE smart_parking;

-- ------------------------------------------------------------
-- 1. Extend table 'slots' with Slot Type, Tariff & Reserved Status
-- ------------------------------------------------------------
ALTER TABLE slots
  ADD COLUMN IF NOT EXISTS slot_type ENUM('standard', 'ev_charging', 'handicapped') NOT NULL DEFAULT 'standard' AFTER points,
  ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(5,2) NOT NULL DEFAULT 2.50 AFTER slot_type;

-- Allow 'reserved' status in slots table
ALTER TABLE slots
  MODIFY COLUMN status ENUM('free', 'occupied', 'reserved') NOT NULL DEFAULT 'free';

-- ------------------------------------------------------------
-- 2. Table: users (accounts - same as backend/auth.py)
-- Every booking belongs to one account.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  password_hash  VARCHAR(200) NOT NULL,
  role           ENUM('driver', 'operator') NOT NULL DEFAULT 'driver',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 3. Table: reservations
-- Tracks driver booking lifecycle, 15-minute grace period, and pin verification
--   pending -> active (checked in) -> completed (checked out / car left)
--   pending -> cancelled (by the driver, free) | expired (no-show)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  reservation_code    VARCHAR(16)  NOT NULL UNIQUE,
  slot_id             INT          NOT NULL,
  user_id             INT          NULL,      -- account that booked
  driver_name         VARCHAR(100) NOT NULL,
  driver_email        VARCHAR(120) NOT NULL,
  license_plate       VARCHAR(30)  NOT NULL,
  start_time          DATETIME     NOT NULL,
  end_time            DATETIME     NOT NULL,  -- moved to check-in time + duration
  duration_hours      INT          NOT NULL DEFAULT 1,
  total_price         DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  penalty_fee         DECIMAL(6,2) NOT NULL DEFAULT 0.00,  -- no-show fee for this booking
  penalty_paid_by     INT          NULL,      -- later booking whose ticket collected it
  fees_included       DECIMAL(6,2) NOT NULL DEFAULT 0.00,  -- old fees added to this total
  status              ENUM('pending', 'active', 'completed', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  grace_deadline      DATETIME     NOT NULL,
  checkin_pin         VARCHAR(6)   NOT NULL,
  checked_in_at       DATETIME     NULL,
  checked_out_at      DATETIME     NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reservations_user (user_id),
  CONSTRAINT fk_res_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- reservations tables made by an older version get the new columns
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS user_id         INT          NULL AFTER slot_id,
  ADD COLUMN IF NOT EXISTS penalty_fee     DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER total_price,
  ADD COLUMN IF NOT EXISTS penalty_paid_by INT          NULL AFTER penalty_fee,
  ADD COLUMN IF NOT EXISTS fees_included   DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER penalty_paid_by,
  ADD COLUMN IF NOT EXISTS checked_out_at  DATETIME     NULL AFTER checked_in_at;

-- Index for fast lookup of pending/active bookings
-- (IF NOT EXISTS so the file can be imported again without errors)
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_grace ON reservations(grace_deadline, status);

-- ------------------------------------------------------------
-- 4. Table: waitlist (queue for a full car park - waitlist.py)
-- The first driver waiting for a type gets the next free space
-- of that type booked automatically.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waitlist (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  driver_name     VARCHAR(100) NOT NULL,
  driver_email    VARCHAR(120) NOT NULL,
  license_plate   VARCHAR(30)  NOT NULL,
  slot_type       ENUM('standard', 'ev_charging', 'handicapped') NOT NULL DEFAULT 'standard',
  duration_hours  INT          NOT NULL DEFAULT 1,
  status          ENUM('waiting', 'assigned', 'left', 'timed_out') NOT NULL DEFAULT 'waiting',
  reservation_id  INT          NULL,      -- the booking made for this driver
  created_at      DATETIME     NOT NULL,
  expires_at      DATETIME     NOT NULL,  -- leaves the queue after this
  assigned_at     DATETIME     NULL,
  INDEX idx_waitlist_queue (status, slot_type, created_at),
  CONSTRAINT fk_waitlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 5. Table: notifications (messages under the bell - notifications.py)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  kind        VARCHAR(30)  NOT NULL,   -- booking_expired, waitlist_assigned, ...
  title       VARCHAR(120) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user (user_id, id),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
