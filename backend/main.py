# ------------------------------------------------------------
# main.py - FastAPI web server (REST API)
# Start with:   uvicorn main:app --reload --port 8000
# API docs:     http://localhost:8000/docs
# ------------------------------------------------------------
import math
import os
import shutil
from contextlib import asynccontextmanager

import pymysql
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

import config
import database
from detector import detector


@asynccontextmanager
async def lifespan(app: FastAPI):
    # runs once when the server starts
    database.init_database()
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    detector.start()
    yield
    # runs once when the server stops
    detector.stop()


app = FastAPI(title="Smart Parking API", lifespan=lifespan)

# allow the React website (served by XAMPP Apache) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- request bodies ----------

class SlotIn(BaseModel):
    slot_code: str
    x1: int
    y1: int
    x2: int
    y2: int
    points: list[list[int]] | None = None  # 4 corners for a tilted slot


class SourceIn(BaseModel):
    source: str


# ---------- endpoints ----------

@app.get("/")
def home():
    return {"message": "Smart Parking API is running. Open /docs for details."}


@app.get("/api/status")
def get_status():
    """Live numbers shown on the dashboard."""
    return {
        **detector.stats,
        "source": detector.source,
        "ai_running": detector.running,
        "error": detector.error,
        "frame_width": detector.frame_width,
        "frame_height": detector.frame_height,
    }


@app.get("/api/slots")
def list_slots():
    return database.get_slots()


def sort_corners(points):
    """Put 4 clicked corners in order around their centre, so the shape
    never crosses itself, whatever order the user clicked them in."""
    cx = sum(p[0] for p in points) / 4
    cy = sum(p[1] for p in points) / 4
    return sorted(points, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))


@app.post("/api/slots")
def create_slot(slot: SlotIn):
    points = None
    if slot.points:
        if len(slot.points) != 4:
            raise HTTPException(400, "A tilted slot needs exactly 4 corners")
        points = sort_corners(slot.points)
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)  # box around the corners
    else:
        # make sure (x1,y1) is top-left and (x2,y2) is bottom-right
        x1, x2 = sorted([slot.x1, slot.x2])
        y1, y2 = sorted([slot.y1, slot.y2])
    if x2 - x1 < 10 or y2 - y1 < 10:
        raise HTTPException(400, "Slot is too small")
    try:
        new_id = database.add_slot(slot.slot_code.strip(), x1, y1, x2, y2, points)
    except pymysql.err.IntegrityError:
        raise HTTPException(400, f"Slot code '{slot.slot_code}' already exists")
    return {"id": new_id}


@app.post("/api/slots/auto")
def auto_slots():
    """Let the AI find all parking spaces in the current picture (replaces all slots)."""
    try:
        return detector.auto_create_slots()
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/slots/{slot_id}")
def remove_slot(slot_id: int):
    database.delete_slot(slot_id)
    return {"deleted": slot_id}


@app.delete("/api/slots")
def remove_all_slots():
    database.delete_all_slots()
    return {"deleted": "all"}


@app.get("/api/frame")
def get_frame(annotated: bool = True):
    """Latest camera picture as JPEG (annotated = with boxes drawn)."""
    data = detector.annotated_jpeg if annotated else detector.raw_jpeg
    if data is None:
        raise HTTPException(404, "No frame yet")
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "no-store"})


@app.post("/api/source")
def change_source(body: SourceIn):
    """Use a webcam index ("0"), a file path or an RTSP/HTTP camera URL."""
    detector.set_source(body.source.strip())
    return {"source": detector.source}


@app.post("/api/source/upload")
def upload_source(file: UploadFile = File(...)):
    """Upload a parking-lot photo or video and start analysing it."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".mp4", ".avi", ".mov", ".mkv"):
        raise HTTPException(400, "Please upload an image or a video file")
    path = os.path.join(config.UPLOAD_DIR, "source" + ext)
    with open(path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    detector.set_source(path)
    # a new picture means new parking spaces -> find them automatically
    try:
        found = detector.auto_create_slots()
    except RuntimeError as e:
        found = {"error": str(e)}
    return {"source": path, **found}


@app.get("/api/logs")
def list_logs(limit: int = 20):
    return database.get_logs(limit)
