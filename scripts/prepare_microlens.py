#!/usr/bin/env python3
"""
MicroLens Dataset Preparation Script

Merges metadata from multiple source files and creates a CSV for Open Rec UI.
Also copies video/thumbnail files to the target directory.

Source files:
- MicroLens-100k_duration.txt: video_id, duration
- MicroLens-100k_likes_and_views.txt: video_id, likes, views
- MicroLens-100k_title_en.csv: video_id, title

Output:
- CSV file ready for upload to Open Rec UI
- Copied videos to data/MicroLens/videos/
- Copied thumbnails to data/MicroLens/thumbnails/
"""

import os
import csv
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Paths
DATASET_DIR = Path("/home/legenduck/MicroLens-100k-Dataset")
OUTPUT_DIR = Path("/home/legenduck/open-rec-ui/data/MicroLens")
VIDEOS_SRC = DATASET_DIR / "MicroLens-100k_videos"
THUMBNAILS_SRC = DATASET_DIR / "MicroLens-100k_covers"
VIDEOS_DST = OUTPUT_DIR / "videos"
THUMBNAILS_DST = OUTPUT_DIR / "thumbnails"

# Output CSV
OUTPUT_CSV = OUTPUT_DIR / "microlens_videos.csv"


def load_duration():
    """Load duration data: video_id -> duration (seconds)"""
    data = {}
    path = DATASET_DIR / "MicroLens-100k_duration.txt"
    with open(path, "r") as f:
        for line in f:
            parts = line.strip().split(",")
            if len(parts) >= 2:
                video_id = parts[0].strip()
                duration = int(parts[1].strip())
                data[video_id] = duration
    print(f"Loaded {len(data)} duration entries")
    return data


def load_likes_views():
    """Load likes and views: video_id -> (likes, views)"""
    data = {}
    path = DATASET_DIR / "MicroLens-100k_likes_and_views.txt"
    with open(path, "r") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 3:
                video_id = parts[0].strip()
                likes = int(parts[1].strip())
                views = int(parts[2].strip())
                data[video_id] = (likes, views)
    print(f"Loaded {len(data)} likes/views entries")
    return data


def load_titles():
    """Load titles: video_id -> title"""
    data = {}
    path = DATASET_DIR / "MicroLens-100k_title_en.csv"
    with open(path, "r") as f:
        for line in f:
            # Format: "video_id, title" (comma after first number)
            idx = line.find(",")
            if idx > 0:
                video_id = line[:idx].strip()
                title = line[idx+1:].strip()
                # Escape quotes in title
                title = title.replace('"', '""')
                data[video_id] = title
    print(f"Loaded {len(data)} title entries")
    return data


def get_existing_videos():
    """Get set of video IDs that have actual video files (from destination)"""
    video_ids = set()
    scan_dir = VIDEOS_DST if VIDEOS_DST.exists() else VIDEOS_SRC
    if not scan_dir.exists():
        print(f"Warning: No video directory found")
        return video_ids
    for f in scan_dir.iterdir():
        if f.suffix == ".mp4":
            # Handle both "123.mp4" and "123.1.mp4" formats
            name = f.stem
            if "." in name:
                name = name.split(".")[0]
            video_ids.add(name)
    print(f"Found {len(video_ids)} unique video files in {scan_dir}")
    return video_ids


def get_existing_thumbnails():
    """Get set of video IDs that have thumbnail files (from destination)"""
    thumb_ids = set()
    scan_dir = THUMBNAILS_DST if THUMBNAILS_DST.exists() else THUMBNAILS_SRC
    if not scan_dir.exists():
        print(f"Warning: No thumbnail directory found")
        return thumb_ids
    for f in scan_dir.iterdir():
        if f.suffix in (".jpg", ".jpeg", ".png"):
            thumb_ids.add(f.stem)
    print(f"Found {len(thumb_ids)} thumbnail files in {scan_dir}")
    return thumb_ids


def copy_file(src, dst):
    """Copy a single file"""
    try:
        shutil.copy2(src, dst)
        return True
    except Exception as e:
        return False


def copy_videos(video_ids, max_workers=8):
    """Copy video files to destination"""
    VIDEOS_DST.mkdir(parents=True, exist_ok=True)

    tasks = []
    for vid in video_ids:
        # Try both formats
        for suffix in ["", ".1"]:
            src = VIDEOS_SRC / f"{vid}{suffix}.mp4"
            if src.exists():
                dst = VIDEOS_DST / f"{vid}.mp4"
                if not dst.exists():
                    tasks.append((src, dst))
                break

    if not tasks:
        print("No new videos to copy")
        return

    print(f"Copying {len(tasks)} videos...")
    copied = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(copy_file, src, dst): (src, dst) for src, dst in tasks}
        for future in as_completed(futures):
            if future.result():
                copied += 1
            if copied % 1000 == 0:
                print(f"  Copied {copied}/{len(tasks)} videos...")

    print(f"Copied {copied} videos")


def copy_thumbnails(thumb_ids, max_workers=8):
    """Copy thumbnail files to destination"""
    THUMBNAILS_DST.mkdir(parents=True, exist_ok=True)

    tasks = []
    for vid in thumb_ids:
        src = THUMBNAILS_SRC / f"{vid}.jpg"
        if src.exists():
            dst = THUMBNAILS_DST / f"{vid}.jpg"
            if not dst.exists():
                tasks.append((src, dst))

    if not tasks:
        print("No new thumbnails to copy")
        return

    print(f"Copying {len(tasks)} thumbnails...")
    copied = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(copy_file, src, dst): (src, dst) for src, dst in tasks}
        for future in as_completed(futures):
            if future.result():
                copied += 1

    print(f"Copied {copied} thumbnails")


def create_csv(durations, likes_views, titles, video_ids, thumb_ids):
    """Create CSV file for Open Rec UI upload"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # CSV header matching Open Rec UI format
    # video_id,url,duration,title,thumbnail,category,tags,description,like_count,dislike_count,comment_count,channel_name

    rows = []
    for vid in sorted(video_ids, key=lambda x: int(x) if x.isdigit() else 0):
        if vid not in durations:
            continue

        duration = durations.get(vid, 0)
        likes, views = likes_views.get(vid, (0, 0))
        title = titles.get(vid, "")

        # URL format for local videos (full path within data directory)
        url = f"MicroLens/videos/{vid}.mp4"

        # Thumbnail (full path within data directory)
        thumbnail = ""
        if vid in thumb_ids:
            thumbnail = f"MicroLens/thumbnails/{vid}.jpg"

        rows.append({
            "video_id": vid,
            "url": url,
            "duration": duration,
            "title": title,
            "thumbnail": thumbnail,
            "category": "",
            "tags": "",
            "description": "",
            "like_count": likes,
            "dislike_count": 0,  # Not available in dataset
            "comment_count": 0,  # Not available in dataset
            "channel_name": "",
        })

    # Write CSV
    fieldnames = ["video_id", "url", "duration", "title", "thumbnail", "category",
                  "tags", "description", "like_count", "dislike_count", "comment_count", "channel_name"]

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Created CSV with {len(rows)} entries: {OUTPUT_CSV}")


def main():
    print("=== MicroLens Dataset Preparation ===\n")

    # Load metadata
    print("Loading metadata...")
    durations = load_duration()
    likes_views = load_likes_views()
    titles = load_titles()

    # Get existing files
    print("\nScanning files...")
    video_ids = get_existing_videos()
    thumb_ids = get_existing_thumbnails()

    # Find videos that have all required metadata
    valid_ids = video_ids & set(durations.keys()) & set(likes_views.keys())
    print(f"\nValid videos (have file + duration + likes/views): {len(valid_ids)}")

    # Copy files
    print("\n--- Copying Files ---")
    #copy_videos(valid_ids)
    #copy_thumbnails(thumb_ids & valid_ids)

    # Create CSV
    print("\n--- Creating CSV ---")
    create_csv(durations, likes_views, titles, valid_ids, thumb_ids)

    print("\n=== Done ===")
    print(f"CSV: {OUTPUT_CSV}")
    print(f"Videos: {VIDEOS_DST}")
    print(f"Thumbnails: {THUMBNAILS_DST}")


if __name__ == "__main__":
    main()
