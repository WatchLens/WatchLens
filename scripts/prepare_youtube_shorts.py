#!/usr/bin/env python3
"""
YouTube Shorts Dataset Preparation Script

Reads collected YouTube Shorts data and produces:
1. A video metadata CSV ready for upload to WatchLens.
2. A comments CSV for bulk import via import_comments.py.

Source files (inside SOURCE_DIR):
- shorts_meta_all.csv: video metadata
- shorts_export_all.json: full export with descriptions, thumbnail URLs, comments

Output (inside OUTPUT_DIR — typically the platform's data/ directory):
- youtube_shorts_videos.csv   (for the admin CSV upload)
- youtube_shorts_comments.csv (for import_comments.py)

Override paths via env vars:
- YT_SHORTS_SOURCE_DIR  raw collection directory
- YT_SHORTS_OUTPUT_DIR  destination inside the platform's data/ directory
"""

import csv
import io
import json
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Paths (overridable via env)
SOURCE_DIR = Path(os.environ.get("YT_SHORTS_SOURCE_DIR", str(REPO_ROOT / "youtube_shorts_raw")))
OUTPUT_DIR = Path(os.environ.get("YT_SHORTS_OUTPUT_DIR", str(REPO_ROOT / "data" / "youtube_shorts")))
VIDEOS_DIR = OUTPUT_DIR / "videos"

META_CSV = SOURCE_DIR / "shorts_meta_all.csv"
EXPORT_JSON = SOURCE_DIR / "shorts_export_all.json"

OUTPUT_CSV = OUTPUT_DIR / "youtube_shorts_videos.csv"
OUTPUT_COMMENTS_CSV = OUTPUT_DIR / "youtube_shorts_comments.csv"


def main():
    # 1. Load JSON for descriptions and thumbnail URLs
    print("Loading export JSON...")
    with open(EXPORT_JSON, "r", encoding="utf-8") as f:
        export_data = json.load(f)

    json_lookup = {}
    for v in export_data["videos"]:
        json_lookup[v["video_id"]] = {
            "description": v.get("description", ""),
            "thumbnail_url": v.get("thumbnail_url", ""),
        }
    print(f"  Loaded {len(json_lookup)} videos from JSON")

    # 2. Read metadata CSV
    print("Reading metadata CSV...")
    videos = []
    with open(META_CSV, "r", encoding="utf-8-sig") as f:
        # Strip BOM from all field names (file has double BOM)
        text = f.read().lstrip('\ufeff')
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            vid = row["video_id"].strip()

            # Check if video file exists locally
            video_file = VIDEOS_DIR / f"{vid}.mp4"
            if not video_file.exists():
                continue

            # Get description and thumbnail_url from JSON
            json_info = json_lookup.get(vid, {})

            # Parse tags: CSV has comma-separated, wrap in quotes for output
            tags = row.get("tags", "").strip()

            videos.append({
                "video_id": vid,
                "url": f"youtube_shorts/videos/{vid}.mp4",
                "duration": row.get("duration_seconds", "0"),
                "title": row.get("title", ""),
                "thumbnail": f"youtube_shorts/thumbnails/{vid}",  # No extension (platform convention)
                "thumbnail_url": json_info.get("thumbnail_url", ""),
                "category": row.get("category", ""),
                "tags": tags,
                "description": json_info.get("description", ""),
                "like_count": row.get("like_count", "0"),
                "comment_count": row.get("comment_count", "0"),
                "view_count": row.get("view_count", "0"),
                "channel_name": row.get("channel_name", ""),
                "channel_id": row.get("channel_id", ""),
                "published_at": row.get("published_at", ""),
            })

    print(f"  Found {len(videos)} videos with local files")

    # 3. Write platform CSV
    print(f"Writing video CSV to {OUTPUT_CSV}...")
    fieldnames = [
        "video_id", "url", "duration", "title", "thumbnail", "thumbnail_url",
        "category", "tags", "description", "like_count", "comment_count",
        "view_count", "channel_name", "channel_id", "published_at",
    ]
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for v in videos:
            writer.writerow(v)

    print(f"  Wrote {len(videos)} videos")

    # 4. Extract comments from JSON and write comments CSV
    print("Extracting comments...")
    comment_count = 0
    comment_fieldnames = [
        "video_id", "comment_id", "parent_id", "author_name",
        "author_channel_id", "text", "like_count", "published_at", "reply_count",
    ]

    # Collect video_ids that we have locally
    local_video_ids = {v["video_id"] for v in videos}

    with open(OUTPUT_COMMENTS_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=comment_fieldnames)
        writer.writeheader()

        for video_data in export_data["videos"]:
            vid = video_data["video_id"]
            if vid not in local_video_ids:
                continue

            for comment in video_data.get("comments", []):
                writer.writerow({
                    "video_id": vid,
                    "comment_id": comment["comment_id"],
                    "parent_id": "",
                    "author_name": comment.get("author", ""),
                    "author_channel_id": comment.get("author_channel_id", ""),
                    "text": comment.get("text", ""),
                    "like_count": comment.get("likes", 0),
                    "published_at": comment.get("published_at", ""),
                    "reply_count": comment.get("reply_count", 0),
                })
                comment_count += 1

                # Write replies
                for reply in comment.get("replies", []):
                    writer.writerow({
                        "video_id": vid,
                        "comment_id": reply["comment_id"],
                        "parent_id": comment["comment_id"],
                        "author_name": reply.get("author", ""),
                        "author_channel_id": reply.get("author_channel_id", ""),
                        "text": reply.get("text", ""),
                        "like_count": reply.get("likes", 0),
                        "published_at": reply.get("published_at", ""),
                        "reply_count": 0,
                    })
                    comment_count += 1

    print(f"  Wrote {comment_count} comments (top-level + replies)")
    print("\nDone! Files created:")
    print(f"  {OUTPUT_CSV}")
    print(f"  {OUTPUT_COMMENTS_CSV}")
    print(f"\nNext steps:")
    print(f"  1. Upload {OUTPUT_CSV} via Admin > Videos > CSV Upload")
    print(f"  2. Import comments: docker compose exec backend python -m scripts.import_comments --experiment-id <UUID>")


if __name__ == "__main__":
    main()
