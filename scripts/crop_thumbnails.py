#!/usr/bin/env python3
"""
Crop YouTube Shorts thumbnails (1280x720 with gaussian blur sides)
to center 9:16 content area.

1280x720 → center 405x720 (9:16)

Override the target directory via the YT_SHORTS_THUMBS_DIR env var.

Usage:
  python3 scripts/crop_thumbnails.py
"""

import os
import sys
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
THUMBS_DIR = Path(os.environ.get(
    "YT_SHORTS_THUMBS_DIR",
    str(REPO_ROOT / "data" / "youtube_shorts" / "thumbnails"),
))


def crop_to_9_16(img: Image.Image) -> Image.Image:
    w, h = img.size
    target_w = h * 9 // 16  # 720 * 9/16 = 405
    left = (w - target_w) // 2
    return img.crop((left, 0, left + target_w, h))


def main():
    files = sorted(THUMBS_DIR.glob("*.jpg")) + sorted(THUMBS_DIR.glob("*.png")) + sorted(THUMBS_DIR.glob("*.webp"))
    print(f"Found {len(files)} thumbnails")

    if not files:
        sys.exit(1)

    sample = Image.open(files[0])
    cropped = crop_to_9_16(sample)
    print(f"Sample: {sample.size[0]}x{sample.size[1]} → {cropped.size[0]}x{cropped.size[1]}")

    count = 0
    for f in files:
        try:
            img = Image.open(f)
            cropped = crop_to_9_16(img)
            cropped.save(f, quality=90)
            count += 1
        except Exception as e:
            print(f"  Error: {f.name} — {e}")

    print(f"Done! Cropped {count} thumbnails to 9:16")


if __name__ == "__main__":
    main()
