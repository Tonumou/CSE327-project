# ------------------------------------------------------------
# config.py - all settings of the backend in one place
# ------------------------------------------------------------

# MySQL settings (XAMPP default: user "root", empty password)
DB_HOST = "localhost"
DB_PORT = 3306
DB_USER = "root"
DB_PASSWORD = ""
DB_NAME = "smart_parking"

# Camera source:
#   "0"                         -> laptop / USB webcam
#   "uploads/parking.mp4"       -> a video file (loops forever)
#   "uploads/parking.jpg"       -> a single photo
#   "rtsp://user:pass@ip/..."   -> a real CCTV camera
CAMERA_SOURCE = "0"

# YOLO model (downloaded automatically the first time). Pick by camera angle:
#   "yolov8n-obb.pt" -> camera looking straight DOWN (drone / aerial photo)
#                       trained on the DOTA aerial dataset
#   "yolov8n.pt"     -> normal CCTV camera looking at the lot from an ANGLE
#                       trained on the COCO dataset
YOLO_MODEL = "yolov8n-obb.pt"

# Picture sizes YOLO may shrink the frame to. Cars look big (low camera) or
# small (high camera), so for every new source the AI tries each size once
# and keeps the one that finds the most vehicles.
IMAGE_SIZES = [160, 224, 320, 416, 640, 1024]

# Class names that count as a vehicle (covers both models above)
VEHICLE_NAMES = ["car", "motorcycle", "bus", "truck", "small vehicle", "large vehicle"]

# Minimum confidence for a detection to be accepted (0..1)
CONFIDENCE = 0.25

# A slot is "occupied" when a vehicle box covers at least this
# fraction of the slot area (0.30 = 30 %)
OCCUPIED_OVERLAP = 0.30

# Second opinion when YOLO misses a car: a slot is also "occupied" when its
# inside has much more light/dark contrast than the most even (empty) slot.
#   VISUAL_FACTOR 1.4 = at least 40 % more contrast than that empty slot
VISUAL_CHECK = True
VISUAL_FACTOR = 1.4

# How often the AI analyses a frame (seconds)
DETECT_INTERVAL = 1.0

# How often a row is saved into detection_logs (seconds)
LOG_INTERVAL = 10

# Folder where uploaded images / videos are stored
UPLOAD_DIR = "uploads"

# Websites allowed to call the API (CORS). "*" = any (fine for local XAMPP use)
ALLOWED_ORIGINS = ["*"]
