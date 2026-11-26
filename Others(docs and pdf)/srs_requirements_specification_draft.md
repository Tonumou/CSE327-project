# Software Requirements Specification (SRS)

## Smart Parking Reservation and Coordination System (SPRCS)

**Standard:** IEEE Std 830-1998 Format  
**Course:** CSE 327 - Software Engineering (Section 7)  
**Semester:** Fall 2026  
**Document Lead Author:** Tamanna Akter Mou (ID: 2211951042)  
**Co-Authors:** Nafees Ahommed (ID: 2111934642), Shanto Miah (ID: 2132452642)  
**Status:** Working Draft for Milestone 1 (Week 6)  

---

## Table of Contents
1. **Introduction**
   - 1.1 Purpose
   - 1.2 Document Conventions
   - 1.3 Intended Audience and Reading Suggestions
   - 1.4 Project Scope
   - 1.5 References
2. **Overall Description**
   - 2.1 Product Perspective
   - 2.2 Product Functions
   - 2.3 User Classes and Characteristics
   - 2.4 Operating Environment
   - 2.5 Design and Implementation Constraints
   - 2.6 Assumptions and Dependencies
3. **External Interface Requirements**
   - 3.1 User Interfaces
   - 3.2 Hardware Interfaces
   - 3.3 Software Interfaces
   - 3.4 Communications Interfaces
4. **System Features & Functional Requirements**
   - 4.1 Feature 1: Live Free-Slot Counting from Camera Feed (AI/ML)
   - 4.2 Feature 2: Abandoned Vehicle & Overstay Anomaly Detection (AI/ML)
   - 4.3 Feature 3: Automated Grace Period & Reservation Lifecycle Engine
   - 4.4 Feature 4: EV Charging Slot Coordination & Turnover Pricing
   - 4.5 Feature 5: Federated Identity Authentication
5. **Other Non-Functional Requirements**
   - 5.1 Performance Requirements
   - 5.2 Reliability & Fault Tolerance
   - 5.3 Security & Privacy Requirements
   - 5.4 Usability & Maintainability

---

## 1. Introduction

### 1.1 Purpose
The purpose of this Software Requirements Specification (SRS) document is to provide a complete, formal specification for the **Smart Parking Reservation and Coordination System (SPRCS)**. It details functional and non-functional requirements, architectural constraints, and external interface behavior for academic evaluation, software development, and quality assurance.

### 1.2 Document Conventions
- Requirements are tagged using alphanumeric prefixes:
  - `FR-X`: Functional Requirement
  - `NFR-X`: Non-Functional Requirement
  - `SEC-X`: Security Requirement
- Priorities are marked as **[High]**, **[Medium]**, or **[Low]**.
- Terminology adheres to IEEE 830-1998 recommendations.

### 1.3 Intended Audience and Reading Suggestions
This document is prepared for:
1. **Course Instructors & Evaluators:** To verify requirement coverage, feasibility, and alignment with course project standards.
2. **Development Team (Mou, Nafees, Shanto):** As a blueprint for system implementation, data flow modeling, and module integration.
3. **QA & Testers:** For writing automated unit and integration tests.

### 1.4 Project Scope
SPRCS is an autonomous software platform designed to resolve urban parking congestion. The system integrates:
- Computer Vision (YOLOv8 + OpenCV) to ingest commodity CCTV camera streams and dynamically compute slot occupancy without expensive IoT hardware.
- A dynamic reservation engine allowing incoming drivers to view live slot heatmaps, filter EV chargers, reserve stalls, and manage arrival via an automated 15-minute grace period countdown.
- Anomaly detection utilizing statistical duration z-scores to flag abandoned or overstaying vehicles.

### 1.5 References
- IEEE Std 830-1998, *IEEE Recommended Practice for Software Requirements Specifications*.
- Ultralytics YOLOv8 Documentation (https://docs.ultralytics.com).
- FastAPI Documentation (https://fastapi.tiangolo.com).
- United Nations Sustainable Development Goal 11: *Sustainable Cities and Communities*.

---

## 2. Overall Description

### 2.1 Product Perspective
SPRCS is a self-contained, full-stack web application with background AI workers. It replaces conventional physical gate attendants and hardware stall sensors with an intelligent software coordination pipeline.

```
+--------------------+        +---------------------+        +--------------------+
| Commodity CCTV /   | -----> | FastAPI AI Worker   | -----> | MySQL Relational   |
| IP Camera Feed     |        | (YOLOv8 + OpenCV)   |        | Database (XAMPP)   |
+--------------------+        +---------------------+        +--------------------+
                                         ▲                              ▲
                                         │                              │
                                         ▼                              ▼
+--------------------+        +---------------------+        +--------------------+
| Driver Mobile/Web  | <====> | RESTful API Router  | <====> | Facility Operator  |
| Booking Portal     |        | (Reservation Engine)|        | Live Dashboard     |
+--------------------+        +---------------------+        +--------------------+
```

### 2.2 Product Functions
1. Ingest video or static photo feeds from parking facilities.
2. Detect motorized vehicles (cars, buses, trucks, vans) in real time.
3. Calculate geometric intersection between detected vehicles and predefined parking slot polygons.
4. Auto-generate slot polygons using edge/line morphology and parked car footprints.
5. Provide a responsive customer portal to search and book free slots.
6. Enforce a strict 15-minute dynamic arrival grace period with automatic release on no-show.
7. Support dedicated EV charging stalls with charging-based tariff schedules.
8. Log continuous historical occupancy snapshots every 10 seconds for analytics.

### 2.3 User Classes and Characteristics
- **Customer / Driver:** Needs a fast, frictionless experience to view available spaces, reserve a slot in under 3 clicks, and receive an arrival PIN/ticket.
- **Facility Operator / Admin:** Needs live telemetry (total, free, occupied, cars outside slots), camera calibration tools, and historical audit logs.
- **System Administrator:** Manages API tokens, database backups, and AI model parameters.

### 2.4 Operating Environment
- **Server:** Python 3.12, Uvicorn ASGI on localhost:8000.
- **Database:** MySQL 8.0+ / MariaDB via XAMPP on localhost:3306.
- **Client Browsers:** Modern evergreen browsers (Chrome, Edge, Firefox, Safari) on desktop and mobile.

---

## 3. External Interface Requirements

### 3.1 User Interfaces
- **Live Operator Dashboard:** Displays 5 real-time KPI stat cards, a live camera stream with bounding box overlays, and an interactive slot map grid.
- **Slot Setup Tool:** HTML5 Canvas allowing operators to draw 4-point quadrilateral polygons or trigger auto-detection.
- **Driver Booking Portal:** Filterable catalog (Standard vs EV charging), booking modal, dynamic arrival countdown timer, and digital ticket with 4-digit verification PIN.

### 3.2 Hardware Interfaces
- Standard USB webcams, RTSP IP surveillance cameras, or digital camera streams supporting minimum 720p resolution at 2+ FPS.

### 3.3 Software Interfaces
- **FastAPI REST API:** Communicates via standard JSON over HTTP with CORS middleware.
- **PyMySQL:** Connects Python backend directly to MySQL relational tables.
- **Google OAuth 2.0:** Federated identity authentication for driver accounts.

---

## 4. System Features & Functional Requirements

### 4.1 Feature 1: Live Free-Slot Counting from Camera Feed (AI/ML)
- **FR-1.1 [High]:** The AI agent shall continuously read frames from the designated video source.
- **FR-1.2 [High]:** Ultralytics YOLOv8 shall infer vehicle detections and extract polygon/OBB coordinates with confidence score ≥ `CONFIDENCE` (0.25).
- **FR-1.3 [High]:** OpenCV convex intersection algorithm shall compute the overlap ratio between vehicle polygons and slot polygons. If `overlap >= 0.30`, slot status is declared `occupied`; otherwise `free`.
- **FR-1.4 [Medium]:** A visual texture contrast check (`slot_contrast`) shall analyze pixel standard deviation to confirm empty asphalt versus low-contrast vehicles.

### 4.2 Feature 2: Overstay & Abandoned Vehicle Anomaly Detection (AI/ML)
- **FR-2.1 [Medium]:** The system shall compute parking duration statistics across all slots.
- **FR-2.2 [Medium]:** Scikit-learn statistical outlier algorithm shall evaluate duration z-scores against historical averages.
- **FR-2.3 [Medium]:** Vehicles parked beyond their reserved window with z-score ≥ 3.0 shall be flagged as "Overstay / Abandoned".

### 4.3 Feature 3: Automated Grace Period & Reservation Lifecycle Engine
- **FR-3.1 [High]:** Drivers shall be able to book a vacant slot by specifying vehicle license plate, driver email, and duration in hours.
- **FR-3.2 [High]:** Upon reservation, slot status shall update from `free` to `reserved` and generate a unique reservation code and 4-digit arrival PIN.
- **FR-3.3 [High]:** The system shall initialize a strict 15-minute grace period deadline (`start_time + 15 mins`).
- **FR-3.4 [High]:** An autonomous background worker (`GracePeriodWorker`) running every 30 seconds shall scan for pending reservations exceeding their grace deadline and automatically cancel the booking, freeing the slot for other drivers.
- **FR-3.5 [High]:** Upon physical arrival, entering the 4-digit PIN shall transition reservation status to `active` and slot status to `occupied`.

### 4.4 Feature 4: EV Charging Slot Coordination & Turnover Pricing
- **FR-4.1 [Medium]:** Slots shall support type classification (`standard`, `ev_charging`, `handicapped`).
- **FR-4.2 [Medium]:** EV charging stalls shall calculate billing based on charging duration tariffs ($5.00/hr) with turnover warnings.

### 4.5 Feature 5: Federated Identity Authentication
- **FR-5.1 [Medium]:** The system shall integrate Google OAuth 2.0 to authenticate customer drivers with standard Google credentials (fulfilling the 5-mark rubric requirement).

---

## 5. Other Non-Functional Requirements

### 5.1 Performance Requirements
- **NFR-1.1 [Latency]:** Total end-to-end latency from camera frame capture to slot status reflection in the frontend shall not exceed 2.0 seconds.
- **NFR-1.2 [Throughput]:** The REST API shall support concurrent polling from at least 50 simultaneous browser clients without response degradation > 150ms.

### 5.2 Reliability & Fault Tolerance
- **NFR-2.1 [Camera Reconnect]:** If a camera stream disconnects or a video loop ends, the background detector shall automatically reset or reconnect without application termination.
- **NFR-2.2 [DB Failure]:** If the MySQL server temporarily drops, FastAPI shall log an explicit error state and gracefully resume upon server recovery.

### 5.3 Security & Privacy Requirements
- **SEC-3.1:** All communication between frontend and backend shall support HTTPS and secure headers.
- **SEC-3.2:** Customer email addresses and vehicle license plates shall be sanitized against SQL injection via parameterized prepared statements.

### 5.4 Usability & Accessibility
- **NFR-4.1:** The Driver Booking Portal shall be fully responsive across mobile viewport widths (360px) and desktop screens (1920px).
- **NFR-4.2:** Reservation flow from slot discovery to confirmed booking receipt shall require no more than 3 user clicks.
