from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import shutil
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple
import uuid
import mimetypes
from datetime import datetime, timezone

import yt_dlp

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Storage directory for converted MP3s
STORAGE_DIR = Path("/tmp/conversions")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class ConvertRequest(BaseModel):
    url: str


class Conversion(BaseModel):
    id: str
    url: str
    title: str
    artist: Optional[str] = None
    duration: Optional[float] = None  # seconds
    thumbnail: Optional[str] = None
    filename: str  # safe filename like "{id}.mp3"
    size_bytes: int = 0
    created_at: str


# ---------- Helpers ----------
def _is_direct_audio_url(url: str) -> bool:
    """Detect a plain file URL by extension."""
    path = urllib.parse.urlparse(url).path.lower()
    return path.endswith((".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus", ".webm"))


def _direct_download_and_convert(url: str, conv_id: str) -> dict:
    """Fallback path: download a plain audio file then transcode to mp3."""
    parsed = urllib.parse.urlparse(url)
    base = os.path.basename(parsed.path) or "audio"
    title, _ = os.path.splitext(base)
    title = urllib.parse.unquote(title) or "Untitled"

    src = STORAGE_DIR / f"{conv_id}.src"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp, open(src, "wb") as out:
        shutil.copyfileobj(resp, out)

    dst = STORAGE_DIR / f"{conv_id}.mp3"
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-vn", "-acodec", "libmp3lame", "-b:a", "192k",
        str(dst),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    try:
        src.unlink()
    except Exception:
        pass
    if proc.returncode != 0 or not dst.exists():
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[:300]}")

    # Probe duration
    duration = None
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(dst)],
            capture_output=True, text=True,
        )
        if probe.returncode == 0:
            duration = float(probe.stdout.strip() or 0) or None
    except Exception:
        pass

    return {
        "title": title,
        "uploader": parsed.netloc,
        "duration": duration,
        "thumbnail": None,
    }


def _run_yt_dlp(url: str, conv_id: str) -> dict:
    """Synchronous yt-dlp download + mp3 conversion. Runs in a threadpool."""
    out_template = str(STORAGE_DIR / f"{conv_id}.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
    if info is None:
        raise RuntimeError("yt-dlp returned no info")
    if "entries" in info and info["entries"]:
        info = info["entries"][0]
    return info


@api_router.get("/")
async def root():
    return {"message": "Audio URL → MP3 converter", "status": "ok"}


@api_router.post("/convert", response_model=Conversion)
async def convert(req: ConvertRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid URL — must start with http(s)://")

    conv_id = str(uuid.uuid4())
    try:
        info = await asyncio.to_thread(_run_yt_dlp, url, conv_id)
    except Exception as e:
        logger.exception("Conversion failed for %s", url)
        # Clean up any partial files
        for p in STORAGE_DIR.glob(f"{conv_id}.*"):
            try:
                p.unlink()
            except Exception:
                pass
        raise HTTPException(status_code=422, detail=f"Conversion failed: {str(e)[:200]}")

    mp3_path = STORAGE_DIR / f"{conv_id}.mp3"
    if not mp3_path.exists():
        # Some sources land at different extensions if extraction fails
        candidates = list(STORAGE_DIR.glob(f"{conv_id}.*"))
        raise HTTPException(
            status_code=500,
            detail=f"MP3 not produced. Got: {[c.suffix for c in candidates]}",
        )

    title = info.get("title") or "Untitled"
    artist = info.get("uploader") or info.get("artist") or info.get("channel")
    duration = info.get("duration")
    thumbnail = info.get("thumbnail")

    record = Conversion(
        id=conv_id,
        url=url,
        title=title,
        artist=artist,
        duration=float(duration) if duration is not None else None,
        thumbnail=thumbnail,
        filename=f"{conv_id}.mp3",
        size_bytes=mp3_path.stat().st_size,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    await db.conversions.insert_one(record.model_dump())
    return record


@api_router.get("/conversions", response_model=List[Conversion])
async def list_conversions():
    docs = await db.conversions.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [Conversion(**d) for d in docs]


@api_router.get("/conversions/{conv_id}", response_model=Conversion)
async def get_conversion(conv_id: str):
    doc = await db.conversions.find_one({"id": conv_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return Conversion(**doc)


@api_router.delete("/conversions/{conv_id}")
async def delete_conversion(conv_id: str):
    doc = await db.conversions.find_one({"id": conv_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    mp3_path = STORAGE_DIR / doc["filename"]
    if mp3_path.exists():
        try:
            mp3_path.unlink()
        except Exception as e:
            logger.warning("Failed to remove file %s: %s", mp3_path, e)
    await db.conversions.delete_one({"id": conv_id})
    return {"ok": True}


@api_router.get("/file/{conv_id}")
async def get_file(conv_id: str):
    doc = await db.conversions.find_one({"id": conv_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    path = STORAGE_DIR / doc["filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    # Build a friendly filename for the client
    safe_title = "".join(c for c in (doc.get("title") or "audio") if c.isalnum() or c in " -_").strip()[:80] or "audio"
    download_name = f"{safe_title}.mp3"
    return FileResponse(
        path=str(path),
        media_type="audio/mpeg",
        filename=download_name,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
