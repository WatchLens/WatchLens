"""
In-memory fallback stage counters for RecBoleRecommender.

Tracks which fallback stage fulfilled each recommendation request.
Resets on server restart (intentional — lightweight monitoring only).
"""
from collections import Counter
from threading import Lock
from typing import Dict
from uuid import UUID


class FallbackStats:
    def __init__(self):
        self._counters: Dict[str, Counter] = {}
        self._lock = Lock()

    def record(self, experiment_id: UUID, request_type: str, stage: str):
        key = str(experiment_id)
        with self._lock:
            if key not in self._counters:
                self._counters[key] = Counter()
            self._counters[key][f"{request_type}:{stage}"] += 1

    def get_stats(self, experiment_id: UUID) -> dict:
        key = str(experiment_id)
        with self._lock:
            counter = self._counters.get(key, Counter())

        feed_stages = ["cf", "i2i_history", "popularity", "recency"]
        watch_stages = ["i2i", "same_category", "popularity"]

        result = {
            "feed": {s: counter.get(f"feed:{s}", 0) for s in feed_stages},
            "watch": {s: counter.get(f"watch:{s}", 0) for s in watch_stages},
        }
        for req_type in ["feed", "watch"]:
            total = sum(v for k, v in result[req_type].items())
            result[req_type]["total"] = total
            result[req_type]["percentages"] = {
                s: round(v / total * 100, 1) if total > 0 else 0
                for s, v in result[req_type].items() if s != "total"
            }
        return result

    def reset(self, experiment_id: UUID):
        key = str(experiment_id)
        with self._lock:
            self._counters.pop(key, None)


_stats = FallbackStats()


def get_fallback_stats() -> FallbackStats:
    return _stats
