import re
from ..config import get_settings


def resolve_video_url(url: str, thumbnail_url: str | None = None) -> dict:
    """
    Resolve CSV url field into a typed video source.

    Returns dict with:
      - type: "youtube" | "direct" | "local"
      - video_url or embed_url
      - thumbnail_url (for local videos, derived from convention if not provided)
    """
    # YouTube full URL
    if "youtube.com" in url or "youtu.be" in url:
        video_id = extract_youtube_id(url)
        if video_id:
            return {"type": "youtube", "embed_url": f"https://www.youtube.com/embed/{video_id}"}

    # YouTube video ID (11 chars, alphanumeric + _ -)
    if re.match(r"^[A-Za-z0-9_-]{11}$", url):
        return {"type": "youtube", "embed_url": f"https://www.youtube.com/embed/{url}"}

    # External URL (http/https)
    if url.startswith("http://") or url.startswith("https://"):
        return {"type": "direct", "video_url": url}

    # Local file → video-nginx serves it
    settings = get_settings()
    base = settings.DATA_BASE_URL.rstrip("/")
    path = url.lstrip("/")
    video_url = f"{base}/{path}"

    # Derive thumbnail URL (pass original CSV url, not full video_url)
    resolved_thumb = derive_thumbnail_url(url, thumbnail_url)

    return {"type": "local", "video_url": video_url, "thumbnail_url": resolved_thumb}


def derive_thumbnail_url(csv_url: str, csv_thumbnail: str | None) -> str | None:
    """
    Derive thumbnail URL using convention.

    Priority:
    1. CSV thumbnail_url (if provided)
    2. Convention: /videos/ folder → /thumbnails/ folder, extension removed

    Args:
        csv_url: Original CSV url value (e.g., "MicroLens/videos/1.mp4")
        csv_thumbnail: CSV thumbnail_url value (optional)
    """
    settings = get_settings()
    base = settings.DATA_BASE_URL.rstrip("/")

    # Use explicit value from CSV if provided
    if csv_thumbnail:
        if csv_thumbnail.startswith("http://") or csv_thumbnail.startswith("https://"):
            return csv_thumbnail
        return f"{base}/{csv_thumbnail.lstrip('/')}"

    # Convention: videos/ folder → thumbnails/ folder
    # e.g., MicroLens/videos/1.mp4 → MicroLens/thumbnails/1
    if "/videos/" in csv_url:
        thumb_path = csv_url.replace("/videos/", "/thumbnails/")
        # Strip file extension (frontend attempts with extension)
        thumb_path = thumb_path.rsplit(".", 1)[0]
        return f"{base}/{thumb_path.lstrip('/')}"

    return None


def extract_youtube_id(url: str) -> str | None:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r"(?:youtube\.com/watch\?v=)([A-Za-z0-9_-]{11})",
        r"(?:youtu\.be/)([A-Za-z0-9_-]{11})",
        r"(?:youtube\.com/embed/)([A-Za-z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None
