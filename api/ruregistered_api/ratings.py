"""Professor ratings, read from the SQLite file written by scripts/rmp/collect.py.

SIRS has no data yet; `SirsProvider` is the slot where it plugs in later.
"""
from __future__ import annotations

import re
import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from .names import Match, NameIndex


@dataclass(frozen=True)
class Professor:
    id: str
    legacy_id: int | None
    first_name: str
    last_name: str
    department: str | None
    avg_rating: float | None
    avg_difficulty: float | None
    would_take_again_percent: float | None
    num_ratings: int

    @property
    def url(self) -> str | None:
        if self.legacy_id is None:
            return None
        return f"https://www.ratemyprofessors.com/professor/{self.legacy_id}"


@dataclass
class CourseStats:
    count: int = 0
    quality_sum: float = 0.0
    difficulty_sum: float = 0.0
    difficulty_n: int = 0


class SirsProvider(Protocol):
    """Future SIRS slot. Return a JSON-serialisable dict or None."""

    def for_professor(self, soc_name: str) -> dict | None: ...

    def for_course(self, course_string: str, soc_name: str | None = None) -> dict | None: ...


class NullSirsProvider:
    def for_professor(self, soc_name: str) -> dict | None:
        return None

    def for_course(self, course_string: str, soc_name: str | None = None) -> dict | None:
        return None


def course_number_from_rmp(text: str | None) -> str | None:
    """'CS111' -> '111', '01:198:111' -> '111', 'CALC1' -> None."""
    groups = re.findall(r"\d+", text or "")
    if not groups:
        return None
    last = groups[-1]
    if len(last) == 3:
        return last
    if len(last) == 6:
        return last[3:]
    return None


@dataclass
class RatingsData:
    professors: dict[str, Professor] = field(default_factory=dict)
    # professor id -> course number -> stats
    course_stats: dict[str, dict[str, CourseStats]] = field(default_factory=dict)
    names: NameIndex = field(default_factory=lambda: NameIndex([]))


def _num(value) -> float | None:
    return float(value) if value is not None else None


class RatingsStore:
    """Lazily (re)loads the RMP database whenever its file changes."""

    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self._lock = threading.Lock()
        self._data = RatingsData()
        self._stamp: tuple[float, int] | None = None
        self.version = 0

    @property
    def available(self) -> bool:
        return self.db_path.exists()

    def data(self) -> RatingsData:
        try:
            st = self.db_path.stat()
            stamp = (st.st_mtime, st.st_size)
        except OSError:
            stamp = None
        if stamp != self._stamp:
            with self._lock:
                if stamp != self._stamp:
                    self._data = self._load() if stamp else RatingsData()
                    self._stamp = stamp
                    self.version += 1
        return self._data

    def _load(self) -> RatingsData:
        conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        try:
            professors = {
                r[0]: Professor(r[0], r[1], r[2] or "", r[3] or "", r[4], _num(r[5]), _num(r[6]),
                                _num(r[7]), r[8] or 0)
                for r in conn.execute(
                    "SELECT id, legacy_id, first_name, last_name, department, avg_rating,"
                    " avg_difficulty, would_take_again_percent, num_ratings FROM professors"
                )
            }
            stats: dict[str, dict[str, CourseStats]] = {}
            for pid, course, helpful, clarity, difficulty in conn.execute(
                "SELECT professor_id, course, helpful_rating, clarity_rating, difficulty_rating"
                " FROM ratings"
            ):
                number = course_number_from_rmp(course)
                if number is None or helpful is None or clarity is None:
                    continue
                s = stats.setdefault(pid, {}).setdefault(number, CourseStats())
                s.count += 1
                s.quality_sum += (helpful + clarity) / 2
                if difficulty is not None:
                    s.difficulty_sum += difficulty
                    s.difficulty_n += 1
        finally:
            conn.close()
        names = NameIndex([(p.id, p.first_name, p.last_name, p.department) for p in professors.values()])
        return RatingsData(professors, stats, names)

    def match(self, soc_name: str, hints=()) -> tuple[Match, Professor | None]:
        data = self.data()
        m = data.names.match(soc_name, hints)
        return m, data.professors.get(m.professor_id) if m.professor_id else None
