# CSE327-project

## Smart Parking - Live Free-Slot Counting from Camera Feed

A website that shows which parking spaces are free or occupied. A camera picture (webcam, CCTV or an uploaded photo/video) is analysed by a YOLO AI model, and every parking space is marked **free** or **occupied** in a MySQL database and on the website.

| Part | Technology |
|---|---|
| Frontend | React, TypeScript, Tailwind CSS (served by XAMPP Apache) |
| Backend | Python FastAPI, YOLOv8, OpenCV |
| Database | MySQL (XAMPP) |
| Sign-in | Email + password, or Google (Google Identity Services + google-auth) |

### Features

| # | Feature | Where in the code |
|---|---|---|
| 1 | **Live free-slot counting** from a camera feed (YOLOv8 + OpenCV) | `backend/detector.py`, `backend/auto_slots.py` |
| 3 | **Reservations with a 15-minute grace period**: PIN check-in, check-out, auto-release of no-shows, a **waitlist** that books the next free space automatically, and a **no-show penalty** policy | `backend/reservation_backend.py`, `backend/waitlist.py`, `backend/penalties.py`, `backend/notifications.py` |
| 4 | **EV charging**: chargers booked and priced by charging time, turnover messages, idle fee for charged cars that block a charger, "next charger free" panel | `backend/ev_charging.py`, `frontend/src/components/EvChargers.tsx` |
| 5 | **Federated identity**: "Continue with Google" | `backend/auth.py`, `frontend/src/components/GoogleButton.tsx` |

- **How to install and run it on a new PC (A to Z):** [README.txt](README.txt)
- **Every file and line of code explained:** [docs/Smart_Parking_Documentation.pdf](docs/Smart_Parking_Documentation.pdf)
- **Project proposal:** [CSE327_Project_Proposal.pdf](CSE327_Project_Proposal.pdf)
