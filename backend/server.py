from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import re
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
import imageio_ffmpeg

# Self-contained ffmpeg binary so the app works without a system install (and
# survives container rebuilds where apt packages are wiped). yt-dlp is told to
# use this same binary via the `ffmpeg_location` option.
FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Storage directory for converted MP3s — configurable via env so deployments
# can mount a persistent volume. Defaults to a path under the app dir so files
# survive backend reloads (and survive container restarts when a volume is
# mounted there).
STORAGE_DIR = Path(os.environ.get("CONVERSIONS_DIR", "/app/backend/storage/conversions"))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Hard cap for the direct-download fallback path. yt-dlp is bounded by its own
# logic; the fallback path streams arbitrary URLs and needs an explicit guard.
MAX_DIRECT_DOWNLOAD_BYTES = 50 * 1024 * 1024  # 50 MB

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
    """Fallback path: download a plain audio file then transcode to mp3.
    Enforces a hard 50 MB cap on the source download."""
    parsed = urllib.parse.urlparse(url)
    base = os.path.basename(parsed.path) or "audio"
    title, _ = os.path.splitext(base)
    title = urllib.parse.unquote(title) or "Untitled"

    src = STORAGE_DIR / f"{conv_id}.src"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        # Reject up-front if the server tells us the file is too big.
        try:
            declared = int(resp.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            declared = 0
        if declared and declared > MAX_DIRECT_DOWNLOAD_BYTES:
            raise RuntimeError(
                f"File too large ({declared / 1024 / 1024:.1f} MB). "
                f"Max allowed is {MAX_DIRECT_DOWNLOAD_BYTES // (1024 * 1024)} MB."
            )

        written = 0
        chunk = 64 * 1024
        with open(src, "wb") as out:
            while True:
                buf = resp.read(chunk)
                if not buf:
                    break
                written += len(buf)
                if written > MAX_DIRECT_DOWNLOAD_BYTES:
                    out.close()
                    try:
                        src.unlink()
                    except Exception:
                        pass
                    raise RuntimeError(
                        f"File exceeded {MAX_DIRECT_DOWNLOAD_BYTES // (1024 * 1024)} MB cap."
                    )
                out.write(buf)

    dst = STORAGE_DIR / f"{conv_id}.mp3"
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(src),
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

    # Probe duration from ffmpeg's own stderr (avoids ffprobe dependency).
    duration = None
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr or "")
    if m:
        try:
            duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
        except Exception:
            duration = None

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
        "max_filesize": MAX_DIRECT_DOWNLOAD_BYTES,
        "ffmpeg_location": FFMPEG_BIN,
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
        if _is_direct_audio_url(url):
            info = await asyncio.to_thread(_direct_download_and_convert, url, conv_id)
        else:
            try:
                info = await asyncio.to_thread(_run_yt_dlp, url, conv_id)
            except Exception as yt_err:
                # Last-resort fallback: try to download as a generic file
                logger.warning("yt-dlp failed (%s), trying direct download", yt_err)
                info = await asyncio.to_thread(_direct_download_and_convert, url, conv_id)
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


@app.on_event("startup")
async def _sync_db_with_disk():
    """Drop history rows whose MP3 files no longer exist on disk.
    Keeps the UI honest when the storage volume is wiped or replaced."""
    try:
        missing = []
        async for doc in db.conversions.find({}, {"_id": 0, "id": 1, "filename": 1}):
            p = STORAGE_DIR / doc["filename"]
            if not p.exists():
                missing.append(doc["id"])
        if missing:
            await db.conversions.delete_many({"id": {"$in": missing}})
            logger.info("Pruned %d dangling conversion(s) on startup.", len(missing))
    except Exception as e:
        logger.warning("Startup sync failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
