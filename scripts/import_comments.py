#!/usr/bin/env python3
"""
Import comments from a CSV file into the WatchLens database.

Usage:
  docker compose exec backend python -m scripts.import_comments \
    --experiment-id <UUID> \
    --csv /app/data/youtube_shorts/youtube_shorts_comments.csv

The CSV must have columns:
  video_id, comment_id, parent_id, author_name, author_channel_id, text, like_count, published_at, reply_count
"""

import argparse
import csv
import io
import sys
from datetime import datetime
from uuid import UUID

# Add backend app to path
sys.path.insert(0, "/app")

from app.database import SessionLocal
from app.models.video import Video
from app.models.comment import Comment


def parse_datetime(s: str):
    if not s:
        return None
    try:
        # Handle ISO format with timezone
        from dateutil.parser import parse
        return parse(s)
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Import comments into Open Rec UI")
    parser.add_argument("--experiment-id", required=True, help="Experiment UUID")
    parser.add_argument("--csv", required=True, help="Path to comments CSV file")
    parser.add_argument("--batch-size", type=int, default=1000, help="Batch size for DB inserts")
    args = parser.parse_args()

    experiment_id = UUID(args.experiment_id)

    db = SessionLocal()
    try:
        # Build video_id -> UUID lookup for this experiment
        print("Building video lookup...")
        videos = db.query(Video).filter(Video.experiment_id == experiment_id).all()
        video_lookup = {v.video_id: v.id for v in videos}
        print(f"  Found {len(video_lookup)} videos in experiment")

        if not video_lookup:
            print("ERROR: No videos found in experiment. Upload videos first.")
            sys.exit(1)

        # Read and import comments
        print(f"Reading comments from {args.csv}...")
        with open(args.csv, "r", encoding="utf-8-sig") as f:
            text = f.read().lstrip('\ufeff')
            reader = csv.DictReader(io.StringIO(text))

            batch = []
            total = 0
            skipped = 0

            for row in reader:
                ext_video_id = row["video_id"].strip()
                video_uuid = video_lookup.get(ext_video_id)

                if not video_uuid:
                    skipped += 1
                    continue

                comment = Comment(
                    video_id=video_uuid,
                    comment_id=row["comment_id"].strip(),
                    parent_id=row["parent_id"].strip() if row.get("parent_id", "").strip() else None,
                    author_name=row.get("author_name", "Anonymous"),
                    author_channel_id=row.get("author_channel_id", ""),
                    text=row.get("text", ""),
                    like_count=int(row.get("like_count", 0) or 0),
                    published_at=parse_datetime(row.get("published_at", "")),
                    reply_count=int(row.get("reply_count", 0) or 0),
                )
                batch.append(comment)
                total += 1

                if len(batch) >= args.batch_size:
                    db.bulk_save_objects(batch)
                    db.commit()
                    batch = []
                    print(f"  Imported {total} comments...", end="\r")

            # Final batch
            if batch:
                db.bulk_save_objects(batch)
                db.commit()

        print(f"\nDone! Imported {total} comments, skipped {skipped} (video not found)")

    finally:
        db.close()


if __name__ == "__main__":
    main()
