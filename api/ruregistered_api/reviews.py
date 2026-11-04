"""Student review averages per course, read from the Supabase view course_review_stats."""
from __future__ import annotations

import threading
import time

import httpx

PAGE = 1000  # Supabase returns at most 1000 rows per request by default


class StudentReviewStore:
    """Caches the course_review_stats view and refreshes it every `ttl` seconds."""

    def __init__(self, url: str | None, key: str | None, ttl: float = 30.0,
                 http: httpx.Client | None = None):
        self.url = (url or "").rstrip("/")
        self.key = key or ""
        self.ttl = ttl
        self._http = http or httpx.Client(timeout=10.0)
        self._lock = threading.Lock()
        self._stats: dict[str, dict] = {}
        self._loaded_at = 0.0

    @property
    def available(self) -> bool:
        return bool(self.url and self.key)

    def _fetch(self) -> dict[str, dict]:
        # Reads every row of the view one page at a time
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}
        out, offset = {}, 0
        while True:
            resp = self._http.get(
                f"{self.url}/rest/v1/course_review_stats",
                params={"select": "course_string,num_reviews,avg_quality,avg_difficulty",
                        "limit": PAGE, "offset": offset},
                headers=headers)
            resp.raise_for_status()
            rows = resp.json()
            for r in rows:
                out[r["course_string"]] = {
                    "avg_rating": round(float(r["avg_quality"]), 2),
                    "avg_difficulty": round(float(r["avg_difficulty"]), 2),
                    "num_ratings": int(r["num_reviews"]),
                }
            if len(rows) < PAGE:
                return out
            offset += PAGE

    def stats(self) -> dict[str, dict]:
        if not self.available:
            return {}
        if time.time() - self._loaded_at > self.ttl:
            with self._lock:
                if time.time() - self._loaded_at > self.ttl:
                    try:
                        self._stats = self._fetch()
                    except (httpx.HTTPError, ValueError, KeyError, TypeError):
                        pass  # keep serving the last good copy until the next refresh
                    self._loaded_at = time.time()
        return self._stats

    def for_course(self, course_string: str) -> dict | None:
        return self.stats().get(course_string)
