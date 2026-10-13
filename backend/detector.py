# ------------------------------------------------------------
# detector.py - the AI agent (YOLO + OpenCV)
#
# Runs forever in a background thread:
#   1. read a frame from the camera / video / image
#   2. YOLO finds every vehicle in the frame
#   3. each vehicle shape is compared with every slot shape
#   4. slot status (free / occupied) is written to MySQL
#   5. an annotated picture is kept in memory for the website
# ------------------------------------------------------------
import os
import threading
import time

import cv2
import numpy as np
from ultralytics import YOLO

import config
import database
from auto_slots import find_car_spaces, find_painted_spaces, merge_spaces, sort_spaces

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


def rect_polygon(x1, y1, x2, y2):
    """The 4 corners of an upright rectangle."""
    return np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.float32)


def slot_polygon(slot):
    """A slot is either 4 clicked corners (tilted) or a dragged rectangle."""
    if slot.get("points"):
        return np.array(slot["points"], dtype=np.float32)
    return rect_polygon(slot["x1"], slot["y1"], slot["x2"], slot["y2"])


def overlap_ratio(slot_poly, car_poly):
    """How much of the slot area is covered by the vehicle (0..1)."""
    slot_area = cv2.contourArea(slot_poly)
    if slot_area <= 0:
        return 0.0
    intersection, _ = cv2.intersectConvexConvex(slot_poly, car_poly)
    return intersection / slot_area


def slot_contrast(gray, poly):
    """How 'busy' the inside of a slot looks. Bare ground is even (low value);
    a car has a dark body, windows and shadows (high value).
    Only the inner 70 % is used, so painted lines and kerbs at the edge don't count."""
    centre = poly.mean(axis=0)
    inner = (centre + (poly - centre) * 0.7).astype(np.int32)
    x, y, w, h = cv2.boundingRect(inner)
    x, y = max(x, 0), max(y, 0)
    roi = gray[y:y + h, x:x + w]
    if roi.size == 0:
        return 0.0
    mask = np.zeros(roi.shape, np.uint8)
    cv2.fillPoly(mask, [inner - [x, y]], 255)
    # blur away fine texture (bricks, asphalt grain) before measuring
    smooth = cv2.GaussianBlur(roi, (0, 0), max(2, min(w, h) / 40))
    return float(smooth[mask > 0].std())


class SlotDetector:
    def __init__(self):
        self.model = None
        self.vehicle_ids = []
        self.image_size = None      # chosen automatically for each new source
        self.source = config.CAMERA_SOURCE
        self.capture = None
        self.lock = threading.Lock()
        self.model_lock = threading.Lock()  # YOLO must not run in 2 threads at once
        self.running = False
        self.error = ""
        self.raw_jpeg = None        # last frame without drawings
        self.annotated_jpeg = None  # last frame with boxes drawn
        self.frame_width = 0
        self.frame_height = 0
        self.stats = {
            "total_slots": 0, "free_slots": 0, "occupied_slots": 0,
            "cars_detected": 0, "cars_outside_slots": 0, "last_update": None,
        }
        self.last_log_time = 0

    # ---------- camera handling ----------

    def set_source(self, source):
        """Switch to another camera / video / image."""
        with self.lock:
            self.source = str(source)
            if self.capture is not None:
                self.capture.release()
                self.capture = None
            self.image_size = None  # new picture -> choose the best size again
            self.error = ""

    def is_image_source(self):
        return self.source.lower().endswith(IMAGE_EXTENSIONS)

    def read_frame(self):
        """Return one frame (numpy image) or None."""
        with self.lock:
            if self.is_image_source():
                frame = cv2.imread(self.source)
                if frame is None:
                    self.error = f"Cannot open image: {self.source}"
                return frame

            if self.capture is None:
                # "0", "1" ... means a webcam index, anything else is a path / URL
                src = int(self.source) if self.source.isdigit() else self.source
                self.capture = cv2.VideoCapture(src)

            ok, frame = self.capture.read()
            if not ok and os.path.isfile(self.source):
                # video file finished -> start again from the first frame
                self.capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self.capture.read()
            if not ok:
                self.error = f"Cannot read from camera source: {self.source}"
                return None
            self.error = ""
            return frame

    # ---------- AI part ----------

    def detect_vehicles(self, frame, size):
        """Run YOLO and return a list of (4-corner polygon, confidence)."""
        with self.model_lock:
            result = self.model(frame, classes=self.vehicle_ids, imgsz=size,
                                conf=config.CONFIDENCE, verbose=False)[0]
        if result.obb is not None:
            # aerial model: rotated boxes, already 4 corners each
            polygons = result.obb.xyxyxyxy.tolist()
            confs = result.obb.conf.tolist()
        else:
            # normal model: upright boxes -> turn into 4 corners
            polygons = [rect_polygon(*box) for box in result.boxes.xyxy.tolist()]
            confs = result.boxes.conf.tolist()
        return [(np.array(p, dtype=np.float32), c) for p, c in zip(polygons, confs)]

    def choose_image_size(self, frame):
        """Cars look big or small depending on how high the camera is.
        Try every size in IMAGE_SIZES once and keep the one that finds most vehicles."""
        counts = {size: len(self.detect_vehicles(frame, size)) for size in config.IMAGE_SIZES}
        self.image_size = max(counts, key=counts.get)
        print(f"[AI] vehicles found per size {counts} -> using {self.image_size}")

    def auto_create_slots(self):
        """Find the parking spaces in the current picture and save them as slots
        (replaces all existing slots). Returns what was found."""
        if self.model is None:
            raise RuntimeError("The AI model is still loading - try again in a few seconds")
        frame = self.read_frame()
        if frame is None:
            raise RuntimeError(self.error or "No camera picture yet")
        if self.image_size is None:
            self.choose_image_size(frame)
        cars = [poly for poly, _ in self.detect_vehicles(frame, self.image_size)]
        # method B: one space per parked car (+ line direction and spacing hints)
        car_spaces, hints = find_car_spaces(cars)
        # method A: white painted lines, searched in the directions the cars point
        line_spaces = find_painted_spaces(frame, hints, cars)
        spaces = merge_spaces(line_spaces, car_spaces)

        height, width = frame.shape[:2]
        database.delete_all_slots()
        for number, poly in enumerate(sort_spaces(spaces), start=1):
            # keep corners inside the picture
            pts = np.clip(poly, [0, 0], [width - 1, height - 1]).round().astype(int).tolist()
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            database.add_slot(f"P{number}", min(xs), min(ys), max(xs), max(ys), pts)
        print(f"[AI] auto slots: {len(line_spaces)} from painted lines, "
              f"{len(spaces) - len(line_spaces)} from cars -> {len(spaces)} spaces")
        self.process_frame(frame)  # mark them free / occupied straight away
        return {"cars": len(cars), "slots": len(spaces), "free": self.stats["free_slots"]}

    def process_frame(self, frame):
        if self.image_size is None:
            self.choose_image_size(frame)
        cars = self.detect_vehicles(frame, self.image_size)
        slots = database.get_slots()
        slot_polys = [slot_polygon(s) for s in slots]

        # 1) second opinion without YOLO: compare every slot's contrast with the
        #    most even-looking slot in this picture (that one is almost surely empty)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        contrasts = [slot_contrast(gray, p) for p in slot_polys]
        reference = min(contrasts, default=0.0)
        busy_limit = max(reference * config.VISUAL_FACTOR, reference + 8)

        # 2) decide the status of every slot
        free = 0
        for slot, poly, contrast in zip(slots, slot_polys, contrasts):
            best = max((overlap_ratio(poly, car) for car, _ in cars), default=0.0)
            seen_by_yolo = best >= config.OCCUPIED_OVERLAP
            looks_busy = config.VISUAL_CHECK and len(slots) > 1 and contrast > busy_limit
            new_status = "occupied" if seen_by_yolo or looks_busy else "free"
            if new_status == "free":
                free += 1
            if new_status != slot["status"]:          # only write changes
                database.update_slot_status(slot["id"], new_status)
            slot["status"] = new_status

        # 3) vehicles that are not inside any slot = anomaly
        outside = 0
        for car, _ in cars:
            if all(overlap_ratio(p, car) < config.OCCUPIED_OVERLAP for p in slot_polys):
                outside += 1

        # 4) draw the result on a copy of the frame
        #    (line width and text size grow with the picture so they stay visible)
        annotated = frame.copy()
        scale = max(1, frame.shape[1] // 640)
        for car, _ in cars:
            cv2.polylines(annotated, [car.astype(np.int32)], True, (0, 165, 255), 2 * scale)
        for slot, poly in zip(slots, slot_polys):
            color = (0, 0, 255) if slot["status"] == "occupied" else (0, 200, 0)  # BGR
            cv2.polylines(annotated, [poly.astype(np.int32)], True, color, 3 * scale)
            cv2.putText(annotated, slot["slot_code"],
                        (slot["x1"] + 5 * scale, slot["y1"] + 25 * scale),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7 * scale, color, 2 * scale)

        # 5) save results in memory for the API
        total = len(slots)
        self.raw_jpeg = cv2.imencode(".jpg", frame)[1].tobytes()
        self.annotated_jpeg = cv2.imencode(".jpg", annotated)[1].tobytes()
        self.frame_height, self.frame_width = frame.shape[:2]
        self.stats = {
            "total_slots": total,
            "free_slots": free,
            "occupied_slots": total - free,
            "cars_detected": len(cars),
            "cars_outside_slots": outside,
            "last_update": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        # 6) save a history row every LOG_INTERVAL seconds
        if time.time() - self.last_log_time >= config.LOG_INTERVAL:
            database.add_log(total, free, total - free, len(cars), outside)
            self.last_log_time = time.time()

    # ---------- main loop ----------

    def run(self):
        print("[AI] loading YOLO model ...")
        self.model = YOLO(config.YOLO_MODEL)
        # class ids of this model whose name is a vehicle, e.g. {2: "car"} -> [2]
        self.vehicle_ids = [i for i, name in self.model.names.items()
                            if name in config.VEHICLE_NAMES]
        print("[AI] model ready, watching camera source:", self.source)
        self.running = True
        while self.running:
            try:
                frame = self.read_frame()
                if frame is not None:
                    self.process_frame(frame)
            except Exception as e:  # keep the agent alive whatever happens
                self.error = str(e)
                print("[AI] error:", e)
            time.sleep(config.DETECT_INTERVAL)

    def start(self):
        threading.Thread(target=self.run, daemon=True).start()

    def stop(self):
        self.running = False


# one shared detector object used by main.py
detector = SlotDetector()
