=====================================================================
  SMART PARKING - Live Free-Slot Counting from Camera Feed
  CSE327 Project - Installation guide (A to Z) for a new Windows PC
=====================================================================

WHAT THIS PROJECT IS
--------------------
A website that shows which parking spaces are free or occupied. A
camera picture (webcam, CCTV, or an uploaded photo/video) is analysed
by a YOLO AI model; every parking space is marked free (green) or
occupied (red) in a MySQL database and on the website.

  Frontend : React + TypeScript + Tailwind CSS   (served by XAMPP Apache)
  Backend  : Python FastAPI + YOLOv8 + OpenCV     (runs on port 8000)
  Database : MySQL                                (XAMPP)

Full explanation of every file and every line of code:
  docs\Smart_Parking_Documentation.pdf


WHAT YOU NEED
-------------
  - Windows 10 or 11, 64-bit
  - About 5 GB free disk space (the AI libraries are large)
  - Internet connection (only for installing)


=====================================================================
STEP 1 - INSTALL THE PROGRAMS (only once per PC)
=====================================================================

1.1  XAMPP  (Apache web server + MySQL database)
     - Download: https://www.apachefriends.org/download.html
     - Run the installer, keep the default folder  C:\xampp
     - You only need the components "Apache", "MySQL", "PHP" and
       "phpMyAdmin".

1.2  Python 3.12
     - Download: https://www.python.org/downloads/release/python-3129/
       (scroll down, click "Windows installer (64-bit)")
     - Run the installer.
     - IMPORTANT: on the first screen tick
           [x] Add python.exe to PATH
       then click "Install Now".
     - Use 3.12, not the newest version: the AI libraries support
       3.12 best.

1.3  Git  (to download the project)
     - Download: https://git-scm.com/download/win
     - Run the installer, click "Next" on every screen.

1.4  Node.js  (OPTIONAL - only needed if you change the website code)
     - Download the LTS version: https://nodejs.org

1.5  Check that everything works.
     Press the Windows key, type  cmd , press Enter, and type:

         python --version
         git --version

     You should see "Python 3.12.x" and "git version ...".
     If you see "not recognized": close cmd, open it again and retry.
     Still not working: reinstall that program (for Python, make sure
     "Add python.exe to PATH" is ticked).


=====================================================================
STEP 2 - DOWNLOAD THE PROJECT INTO XAMPP
=====================================================================

The project MUST be inside C:\xampp\htdocs and the folder MUST be
called  smart-parking .

In cmd type:

    cd C:\xampp\htdocs
    git clone https://github.com/Tonumou/CSE327-project.git smart-parking

(No Git? On the GitHub page click the green "Code" button ->
"Download ZIP", unzip it, and rename the folder to  smart-parking  so
that you have  C:\xampp\htdocs\smart-parking\backend  etc.)


=====================================================================
STEP 3 - START APACHE AND MYSQL
=====================================================================

1. Open the "XAMPP Control Panel" (Start menu -> XAMPP).
2. Click "Start" next to Apache.   It turns green.
3. Click "Start" next to MySQL.    It turns green.

Apache does not start ("port 80 in use")?
   - Click "Config" next to Apache -> "httpd.conf"
   - Change the line   Listen 80   to   Listen 8080   and save.
   - Start Apache again.
   - From now on use  http://localhost:8080/...  instead of
     http://localhost/...


=====================================================================
STEP 4 - CREATE THE DATABASE  (optional, it is also automatic)
=====================================================================

The backend creates the database and tables by itself when it starts.
If you want to create them by hand:

Option A - phpMyAdmin
   1. Open  http://localhost/phpmyadmin
   2. Click the "Import" tab
   3. Choose the file  C:\xampp\htdocs\smart-parking\database\smart_parking.sql
   4. Click "Import" (bottom of the page)

Option B - command line
   C:\xampp\mysql\bin\mysql.exe -u root < C:\xampp\htdocs\smart-parking\database\smart_parking.sql

You will get the database  smart_parking  with the tables
slots  and  detection_logs.

MySQL has a password on this PC?  Open  backend\config.py  and put it
in  DB_PASSWORD = "your password".


=====================================================================
STEP 5 - INSTALL THE PYTHON LIBRARIES (only once)
=====================================================================

In cmd type these lines ONE BY ONE (press Enter after each):

    cd C:\xampp\htdocs\smart-parking\backend
    python -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt

 - "python -m venv venv" makes a private library folder for the project.
 - After "activate" the line starts with  (venv) .
 - "pip install" downloads FastAPI, OpenCV, YOLO and PyTorch.
   It is about 1-2 GB and takes 5-15 minutes. Wait until the prompt
   comes back without red errors.


=====================================================================
STEP 6 - START THE BACKEND (the AI)
=====================================================================

In cmd:

    cd C:\xampp\htdocs\smart-parking\backend
    venv\Scripts\activate
    uvicorn main:app --reload --port 8000

Wait for:
    [AI] model ready, watching camera source: 0

 - The first start downloads the AI model  yolov8n-obb.pt  (6 MB).
 - If the PC has no webcam you will see "Camera index out of range".
   That is fine - upload a photo on the website instead (step 8).
 - KEEP THIS WINDOW OPEN. Closing it stops the AI.
   To stop it on purpose press  Ctrl + C.

Test: open  http://localhost:8000/docs  in the browser - you should
see the list of API functions.


=====================================================================
STEP 7 - OPEN THE WEBSITE
=====================================================================

    http://localhost/smart-parking/

(or http://localhost:8080/smart-parking/ if you changed the port)

The ready-built website is already in the  app  folder, so Node.js is
NOT needed to run it.


=====================================================================
STEP 8 - USE IT
=====================================================================

1. Live Dashboard -> "Camera Source" box -> green button
   "Upload Photo / Video". Choose a parking-lot photo taken from above
   (drone / high CCTV view works best; free photos: pexels.com, search
   "parking lot aerial").
2. The AI finds the cars and the parking spaces by itself:
     green = free,  red = occupied,  orange = car seen by YOLO
3. Slot Setup page:
     - "Auto-detect parking spaces" searches again
     - "Rectangle (drag)" or "4 corners (click)" to draw a missing
       space by hand
     - "Delete" to remove a wrong slot
4. For a live webcam: type 0 in the Camera Source box and click "Use".
   For a CCTV camera: type its rtsp://... address and click "Use".


=====================================================================
EVERY DAY AFTER INSTALLATION
=====================================================================

1. XAMPP Control Panel -> Start Apache and MySQL
2. cmd:
       cd C:\xampp\htdocs\smart-parking\backend
       venv\Scripts\activate
       uvicorn main:app --reload --port 8000
3. Browser: http://localhost/smart-parking/


=====================================================================
ONLY IF YOU CHANGE THE WEBSITE CODE (frontend\src)
=====================================================================

Needs Node.js (step 1.4). In cmd:

    cd C:\xampp\htdocs\smart-parking\frontend
    npm install          (first time only)
    npm run build        (rebuilds the "app" folder)

Then press Ctrl + F5 in the browser.

Python code changes (backend\*.py) are picked up automatically because
of  --reload .


=====================================================================
SEE THE DATABASE
=====================================================================

  phpMyAdmin:  http://localhost/phpmyadmin  -> smart_parking -> slots

  or cmd:
    C:\xampp\mysql\bin\mysql.exe -u root -e "SELECT * FROM smart_parking.slots;"


=====================================================================
PROBLEMS AND FIXES
=====================================================================

'python' is not recognized
    Reinstall Python 3.12 with "Add python.exe to PATH" ticked, then
    open a NEW cmd window.

pip install fails / very slow
    Check the internet connection and run it again. Antivirus software
    (e.g. ESET) can block downloads - allow them or pause it briefly.

Can't connect to MySQL
    MySQL is not started in XAMPP, or it has a password -> put it in
    backend\config.py  (DB_PASSWORD).

Website shows a red box "Cannot reach the backend"
    Step 6 is not running. Start it and keep the window open.

Website is blank / "Not Found"
    Apache is not started, or the folder is not exactly
    C:\xampp\htdocs\smart-parking

phpMyAdmin shows a "Fatal error" page
    Antivirus has blocked a phpMyAdmin file. Add C:\xampp to the
    antivirus exclusions and restart Apache. (The project itself works
    without phpMyAdmin - use the cmd command above to see the data.)

No cars detected
    Use a clearer picture taken from above. Settings are in
    backend\config.py (CONFIDENCE, YOLO_MODEL - see the PDF, section 8).

A space is missing or wrong
    Draw it / delete it on the Slot Setup page. Automatic detection
    needs clearly visible white lines to find free spaces.


=====================================================================
FOLDER OVERVIEW
=====================================================================

smart-parking\
  index.html        -> opens the website in app\
  app\              -> built website (served by Apache)
  backend\          -> Python: main.py (API), detector.py (AI),
                       auto_slots.py (finds spaces), database.py (SQL),
                       config.py (all settings), requirements.txt
  database\         -> smart_parking.sql
  docs\             -> Smart_Parking_Documentation.pdf (full explanation)
  frontend\         -> React + TypeScript source code of the website
