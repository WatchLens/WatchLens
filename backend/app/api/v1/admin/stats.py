from uuid import UUID
from collections import defaultdict
from datetime import datetime, timedelta
from io import StringIO
from urllib.parse import quote
import csv
import json
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from ..deps import get_db, get_current_admin
from ....models.user import User
from ....models.experiment import Experiment
from ....models.user_group import UserGroup
from ....models.video import Video
from ....models.session import Session as UserSession
from ....models.event import Event


router = APIRouter(tags=["admin-stats"])


@router.get("/experiments/{experiment_id}/stats")
def get_experiment_stats(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get statistics for an experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    # Basic counts
    total_videos = len(experiment.videos)
    total_groups = len(experiment.user_groups)
    total_users = sum(len(g.users) for g in experiment.user_groups)

    # Get all user IDs in this experiment
    user_ids = []
    for group in experiment.user_groups:
        for user in group.users:
            user_ids.append(user.id)

    # Session stats
    total_sessions = 0
    if user_ids:
        total_sessions = db.query(UserSession).filter(
            UserSession.user_id.in_(user_ids)
        ).count()

    # Event stats
    event_counts = {}
    if user_ids:
        session_ids = db.query(UserSession.id).filter(
            UserSession.user_id.in_(user_ids)
        ).subquery()

        event_counts_query = db.query(
            Event.event_type,
            func.count(Event.id)
        ).filter(
            Event.session_id.in_(session_ids)
        ).group_by(Event.event_type).all()

        event_counts = {event_type: count for event_type, count in event_counts_query}

    # Average watch ratio
    avg_watch_ratio = None
    if user_ids:
        session_ids = db.query(UserSession.id).filter(
            UserSession.user_id.in_(user_ids)
        ).subquery()

        result = db.query(func.avg(Event.watch_ratio)).filter(
            Event.session_id.in_(session_ids),
            Event.event_type == "VIDEO_END",
            Event.watch_ratio.isnot(None)
        ).scalar()

        if result:
            avg_watch_ratio = round(float(result), 3)

    # Per-group stats
    group_stats = []
    for group in experiment.user_groups:
        group_user_ids = [u.id for u in group.users]

        group_sessions = 0
        group_events = 0
        group_avg_watch = None

        if group_user_ids:
            group_sessions = db.query(UserSession).filter(
                UserSession.user_id.in_(group_user_ids)
            ).count()

            group_session_ids = db.query(UserSession.id).filter(
                UserSession.user_id.in_(group_user_ids)
            ).subquery()

            group_events = db.query(Event).filter(
                Event.session_id.in_(group_session_ids)
            ).count()

            result = db.query(func.avg(Event.watch_ratio)).filter(
                Event.session_id.in_(group_session_ids),
                Event.event_type == "VIDEO_END",
                Event.watch_ratio.isnot(None)
            ).scalar()

            if result:
                group_avg_watch = round(float(result), 3)

        group_stats.append({
            "id": str(group.id),
            "name": group.name,
            "algorithm_config": group.algorithm_config,
            "ui_config": group.ui_config,
            "user_count": len(group.users),
            "session_count": group_sessions,
            "event_count": group_events,
            "avg_watch_ratio": group_avg_watch,
        })

    return {
        "experiment_id": str(experiment_id),
        "experiment_name": experiment.name,
        "status": experiment.status,
        "overview": {
            "total_videos": total_videos,
            "total_groups": total_groups,
            "total_users": total_users,
            "total_sessions": total_sessions,
            "total_events": sum(event_counts.values()),
            "avg_watch_ratio": avg_watch_ratio,
        },
        "event_counts": event_counts,
        "group_stats": group_stats,
    }


@router.get("/experiments/{experiment_id}/stats/evaluation")
def get_recommendation_evaluation(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Compute recommendation evaluation metrics per group."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    # Step 1: Build session -> (user_id, group_id, group_name, algorithm_config) mapping
    session_map = {}  # session_id -> group_id
    group_info = {}   # group_id -> {name, algorithm_config}
    for group in experiment.user_groups:
        group_info[group.id] = {
            "name": group.name,
            "algorithm_config": group.algorithm_config or {},
        }
        for user in group.users:
            sessions = db.query(UserSession).filter(UserSession.user_id == user.id).all()
            for s in sessions:
                session_map[s.id] = group.id

    if not session_map:
        return _empty_evaluation(group_info)

    # Step 2: Fetch relevant events in bulk
    session_ids = list(session_map.keys())
    rows = db.execute(
        text("""
            SELECT session_id, video_id, event_type, position_in_feed, watch_ratio
            FROM events
            WHERE session_id = ANY(:sids)
              AND event_type IN ('IMPRESSION', 'FEED_CLICK', 'VIDEO_START', 'VIDEO_END', 'LIKE')
            ORDER BY session_id, server_timestamp
        """),
        {"sids": session_ids},
    ).fetchall()

    # Step 3: Group events by session
    session_events = defaultdict(list)
    for row in rows:
        session_events[row[0]].append({
            "video_id": row[1],
            "event_type": row[2],
            "position": row[3],
            "watch_ratio": row[4],
        })

    # Step 4: Compute per-session metrics, aggregate by group
    group_metrics = defaultdict(lambda: {
        "ctrs": [],
        "watch_ratios": [], "engagement_rates": [],
        "total_impressions": 0, "total_clicks": 0,
        "sessions_evaluated": 0,
    })

    for session_id, events in session_events.items():
        group_id = session_map.get(session_id)
        if not group_id:
            continue

        impressions = [e for e in events if e["event_type"] == "IMPRESSION" and e["video_id"]]
        clicks = {e["video_id"] for e in events if e["event_type"] in ("FEED_CLICK", "VIDEO_START") and e["video_id"]}
        likes = {e["video_id"] for e in events if e["event_type"] == "LIKE" and e["video_id"]}
        watch_ratios = [e["watch_ratio"] for e in events if e["event_type"] == "VIDEO_END" and e["watch_ratio"] is not None]

        impression_videos = {e["video_id"] for e in impressions}
        if not impression_videos:
            # Still collect watch ratios even without impressions
            if watch_ratios:
                group_metrics[group_id]["watch_ratios"].extend(watch_ratios)
            continue

        gm = group_metrics[group_id]
        gm["sessions_evaluated"] += 1
        gm["total_impressions"] += len(impressions)

        # CTR
        clicked_impressions = clicks & impression_videos
        gm["total_clicks"] += len(clicked_impressions)
        ctr = len(clicked_impressions) / len(impressions) if impressions else 0
        gm["ctrs"].append(ctr)

        # Engagement Rate
        engaged = (clicks | likes) & impression_videos
        eng_rate = len(engaged) / len(impressions) if impressions else 0
        gm["engagement_rates"].append(eng_rate)

        # Watch ratios
        if watch_ratios:
            gm["watch_ratios"].extend(watch_ratios)

    # Step 5: Aggregate
    def _avg(lst):
        return round(sum(lst) / len(lst), 4) if lst else 0.0

    groups_result = []
    overall_ctrs = []
    overall_watch_ratios, overall_engagements = [], []
    overall_impressions, overall_clicks, overall_sessions = 0, 0, 0

    for gid, info in group_info.items():
        gm = group_metrics[gid]
        groups_result.append({
            "group_id": str(gid),
            "group_name": info["name"],
            "algorithm_config": info["algorithm_config"],
            "ctr": _avg(gm["ctrs"]),
            "avg_watch_ratio": _avg(gm["watch_ratios"]),
            "engagement_rate": _avg(gm["engagement_rates"]),
            "total_impressions": gm["total_impressions"],
            "total_clicks": gm["total_clicks"],
            "sessions_evaluated": gm["sessions_evaluated"],
        })

        overall_ctrs.extend(gm["ctrs"])
        overall_watch_ratios.extend(gm["watch_ratios"])
        overall_engagements.extend(gm["engagement_rates"])
        overall_impressions += gm["total_impressions"]
        overall_clicks += gm["total_clicks"]
        overall_sessions += gm["sessions_evaluated"]

    return {
        "overall": {
            "ctr": _avg(overall_ctrs),
            "avg_watch_ratio": _avg(overall_watch_ratios),
            "engagement_rate": _avg(overall_engagements),
            "total_impressions": overall_impressions,
            "total_clicks": overall_clicks,
            "total_sessions_evaluated": overall_sessions,
        },
        "groups": groups_result,
    }


def _empty_evaluation(group_info: dict) -> dict:
    """Return zero-valued evaluation when no sessions exist."""
    empty_group = lambda gid, info: {
        "group_id": str(gid), "group_name": info["name"],
        "algorithm_config": info["algorithm_config"],
        "ctr": 0,
        "avg_watch_ratio": 0, "engagement_rate": 0,
        "total_impressions": 0, "total_clicks": 0, "sessions_evaluated": 0,
    }
    return {
        "overall": {
            "ctr": 0,
            "avg_watch_ratio": 0, "engagement_rate": 0,
            "total_impressions": 0, "total_clicks": 0, "total_sessions_evaluated": 0,
        },
        "groups": [empty_group(gid, info) for gid, info in group_info.items()],
    }


@router.get("/experiments/{experiment_id}/events/csv")
def export_events_csv(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Export all events for an experiment as CSV."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    # Get all user IDs and their groups
    user_group_map = {}
    for group in experiment.user_groups:
        for user in group.users:
            user_group_map[user.id] = {
                "login_id": user.login_id,
                "group_name": group.name,
                "algorithm_config": group.algorithm_config,
                "ui_config": group.ui_config,
            }

    if not user_group_map:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No users found in experiment",
        )

    # Get all sessions for these users
    sessions = db.query(UserSession).filter(
        UserSession.user_id.in_(user_group_map.keys())
    ).all()

    session_user_map = {s.id: s.user_id for s in sessions}
    session_ids = [s.id for s in sessions]

    if not session_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sessions found in experiment",
        )

    # Get video ID mapping
    video_map = {v.id: v.video_id for v in experiment.videos}

    # Stream rows directly from DB instead of materializing all events into
    # memory (3M events × ~300B = ~1GB RSS; previously OOM'd at study scale).
    events_query = db.query(Event).filter(
        Event.session_id.in_(session_ids)
    ).order_by(Event.server_timestamp)

    def _row_bytes(values: list) -> bytes:
        buf = StringIO()
        csv.writer(buf).writerow(values)
        return buf.getvalue().encode("utf-8")

    def generate_csv():
        # BOM so Excel opens Korean correctly
        yield b"\xef\xbb\xbf"
        yield _row_bytes([
            "event_id", "user_login_id", "group_name",
            "algorithm_feed", "algorithm_watch",
            "session_id", "video_id", "event_type",
            "watch_ratio", "watch_duration", "position_in_feed",
            "client_timestamp", "server_timestamp", "payload",
        ])
        for event in events_query.yield_per(1000):
            user_id = session_user_map.get(event.session_id)
            user_info = user_group_map.get(user_id, {})
            algo_config = user_info.get("algorithm_config", {})
            external_video_id = video_map.get(event.video_id, "") if event.video_id else ""
            yield _row_bytes([
                event.id,
                user_info.get("login_id", ""),
                user_info.get("group_name", ""),
                algo_config.get("feed", "") if algo_config else "",
                algo_config.get("watch", "") if algo_config else "",
                str(event.session_id),
                external_video_id,
                event.event_type,
                event.watch_ratio if event.watch_ratio else "",
                event.watch_duration if event.watch_duration else "",
                event.position_in_feed if event.position_in_feed else "",
                event.client_timestamp.isoformat() if event.client_timestamp else "",
                event.server_timestamp.isoformat() if event.server_timestamp else "",
                json.dumps(event.payload, ensure_ascii=False) if event.payload else "",
            ])

    return StreamingResponse(
        generate_csv(),
        media_type="text/csv; charset=utf-8",
        headers={
            # RFC 5987: percent-encode the filename to (a) support Korean names
            # and (b) prevent CR/LF header injection from malicious names.
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f'events_{experiment.name}.csv', safe='')}"
        },
    )


@router.get("/experiments/{experiment_id}/stats/users")
def get_user_stats(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Per-user statistics: watch time, sessions, videos watched, event breakdown."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    users = []
    for group in experiment.user_groups:
        for user in group.users:
            # Sessions
            sessions = db.query(UserSession).filter(UserSession.user_id == user.id).all()
            session_ids = [s.id for s in sessions]

            # Events
            total_events = 0
            event_breakdown = {}
            unique_videos = set()
            if session_ids:
                rows = db.query(Event.event_type, func.count(Event.id)).filter(
                    Event.session_id.in_(session_ids)
                ).group_by(Event.event_type).all()
                event_breakdown = {t: c for t, c in rows}
                total_events = sum(event_breakdown.values())

                vid_rows = db.query(Event.video_id).filter(
                    Event.session_id.in_(session_ids),
                    Event.video_id.isnot(None),
                ).distinct().all()
                unique_videos = {r[0] for r in vid_rows}

            # First login timestamp
            first_login = db.query(func.min(UserSession.started_at)).filter(
                UserSession.user_id == user.id
            ).scalar()
            first_login_date = first_login.date() if first_login else None

            users.append({
                "login_id": user.login_id,
                "group_name": group.name,
                "first_login_date": first_login_date.isoformat() if first_login_date else None,
                "total_sessions": len(sessions),
                "total_events": total_events,
                "unique_videos_interacted": len(unique_videos),
                "event_breakdown": event_breakdown,
            })

    return {"users": users}


# Event types excluded from the trajectory view (high-frequency or mouse noise).
TRAJECTORY_IGNORED_EVENTS = {
    "MOUSE_MOVEMENT",
    "SCROLL",
    "VIEWPORT_VISIBILITY",
    "VIDEO_PROGRESS",
    "VISIBILITY_CHANGE",
    "WINDOW_FOCUS",
    "WINDOW_BLUR",
}


@router.get("/users/{user_id}/trajectory")
def get_user_trajectory(
    user_id: UUID,
    date: str = Query(..., description="UTC date (YYYY-MM-DD) to fetch sessions for"),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Per-user, per-day session + event trajectory.

    Returns every session that started on the given UTC date, each with its
    filtered event list (mouse/scroll noise excluded so the researcher can read
    the actual flow).
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        day_start = datetime.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format (use YYYY-MM-DD)")
    day_end = day_start + timedelta(days=1)

    # Sessions that started within the day window
    sessions = db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.started_at >= day_start,
        UserSession.started_at < day_end,
    ).order_by(UserSession.started_at).all()

    session_payload = []
    total_events = 0
    for session in sessions:
        events = db.query(Event).filter(
            Event.session_id == session.id,
            Event.server_timestamp >= day_start,
            Event.server_timestamp < day_end,
            ~Event.event_type.in_(list(TRAJECTORY_IGNORED_EVENTS)),
        ).order_by(Event.server_timestamp.asc()).all()

        # Hydrate video titles in one pass
        vid_ids = {e.video_id for e in events if e.video_id is not None}
        videos_map = {}
        if vid_ids:
            rows = db.query(Video.id, Video.video_id, Video.title).filter(
                Video.id.in_(vid_ids)
            ).all()
            videos_map = {r[0]: {"video_id": r[1], "title": r[2]} for r in rows}

        event_payload = []
        for e in events:
            v = videos_map.get(e.video_id) if e.video_id else None
            event_payload.append({
                "event_type": e.event_type,
                "timestamp": e.server_timestamp.isoformat() if e.server_timestamp else None,
                "client_timestamp": e.client_timestamp.isoformat() if e.client_timestamp else None,
                "video_id": v["video_id"] if v else None,
                "video_title": v["title"] if v else None,
                "watch_ratio": e.watch_ratio,
                "watch_duration": e.watch_duration,
                "position_in_feed": e.position_in_feed,
                "algorithm": e.algorithm,
            })

        total_events += len(events)
        session_payload.append({
            "session_id": str(session.id),
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "events": event_payload,
        })

    return {
        "date": date,
        "summary": {
            "sessions": len(sessions),
            "events": total_events,
        },
        "window": {
            "start": day_start.isoformat(),
            "end": day_end.isoformat(),
        },
        "sessions": session_payload,
    }
