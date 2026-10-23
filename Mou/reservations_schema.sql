-- ============================================================
--  Smart Parking - Reservation System Extension (Feature 3)
--  Author: Tamanna Akter Mou (ID: 2211951042)
--  Database: MySQL (XAMPP)
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
-- 2. Table: reservations
-- Tracks driver booking lifecycle, 15-minute grace period, and pin verification
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  reservation_code    VARCHAR(16)  NOT NULL UNIQUE,
  slot_id             INT          NOT NULL,
  driver_name         VARCHAR(100) NOT NULL,
  driver_email        VARCHAR(120) NOT NULL,
  license_plate       VARCHAR(30)  NOT NULL,
  start_time          DATETIME     NOT NULL,
  end_time            DATETIME     NOT NULL,
  duration_hours      INT          NOT NULL DEFAULT 1,
  total_price         DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  status              ENUM('pending', 'active', 'completed', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  grace_deadline      DATETIME     NOT NULL,
  checkin_pin         VARCHAR(6)   NOT NULL,
  checked_in_at       DATETIME     NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
);

-- Index for fast lookup of pending/active bookings
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_grace ON reservations(grace_deadline, status);
