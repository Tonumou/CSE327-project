-- ============================================================
--  Smart Parking
--  Feature 1: Live Free-Slot Counting from Camera Feed
--  Database: MySQL (XAMPP)
--  Import this file in phpMyAdmin  (http://localhost/phpmyadmin)
-- ============================================================

CREATE DATABASE IF NOT EXISTS smart_parking
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE smart_parking;

-- ------------------------------------------------------------
-- Table: slots
-- One row per parking space. x1,y1 = top-left corner and
-- x2,y2 = bottom-right corner of the slot in the camera image
-- (pixel coordinates). For a tilted slot, "points" holds its
-- 4 corners as text, e.g. [[10,20],[90,5],[110,200],[30,215]],
-- and x1..y2 is the box around them. The AI updates "status".
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slots (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  slot_code   VARCHAR(20)  NOT NULL UNIQUE,
  x1          INT          NOT NULL,
  y1          INT          NOT NULL,
  x2          INT          NOT NULL,
  y2          INT          NOT NULL,
  points      TEXT         NULL,
  status      ENUM('free','occupied') NOT NULL DEFAULT 'free',
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- Table: detection_logs
-- A snapshot of the lot saved every few seconds by the AI.
-- cars_outside_slots = vehicles that are not inside any slot
-- (e.g. parked in the driveway) -> a simple anomaly signal.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_logs (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  total_slots         INT NOT NULL,
  free_slots          INT NOT NULL,
  occupied_slots      INT NOT NULL,
  cars_detected       INT NOT NULL,
  cars_outside_slots  INT NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
