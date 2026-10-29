"""Term snapshots, search, and response shaping (SOC data joined with ratings)."""
from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field

from .config import Settings, Term
from .names import display_name, norm, slug
from .ratings import NullSirsProvider, Professor, RatingsStore, SirsProvider
from .soc import SocClient, SocError

DAY_NAMES = {"M": "Monday", "T": "Tuesday", "W": "Wednesday", "H": "Thursday",
             "F": "Friday", "S": "Saturday", "U": "Sunday"}


def _clock(military: str | None) -> tuple[str | None, str | None]:
    if not military or not military.isdigit() or len(military) != 4:
        return None, None
    h, m = int(military[:2]), military[2:]
    return f"{military[:2]}:{m}", f"{h % 12 or 12}:{m} {'AM' if h < 12 else 'PM'}"


@dataclass
class Snapshot:
    term: Term
    courses: list[dict]
    by_string: dict[str, dict]
    section_by_index: dict[str, tuple[dict, dict]]
    search_text: dict[str, str]  # courseString -> normalised haystack
    instructors: dict[str, str]  # slug -> raw SOC name
    subjects: dict[str, set[str]]  # raw SOC name -> subject descriptions they teach
    loaded_at: float
    open_sections: set[str] | None = None
    open_loaded_at: float = 0.0
    agg_cache: dict = field(default_factory=dict)  # (ratings version, course) -> aggregate
    match_cache: dict = field(default_factory=dict)  # raw name -> (Match, Professor|None)
    agg_version: int = -1


def _build_snapshot(term: Term, courses: list[dict]) -> Snapshot:
    by_string, by_index, text, instructors, subjects = {}, {}, {}, {}, {}
    for c in courses:
        cs = c["courseString"]
        by_string[cs] = c
        names = set()
        for s in c.get("sections", []):
            by_index[str(s["index"])] = (c, s)
            for i in s.get("instructors", []):
                names.add(i["name"])
                subjects.setdefault(i["name"], set()).add(c.get("subjectDescription") or "")
                instructors.setdefault(slug(i["name"]), i["name"])
        text[cs] = norm(" ".join([c.get("title") or "", c.get("expandedTitle") or "",
                                  c.get("subjectDescription") or "", cs.replace(":", " "),
                                  *names]))
    return Snapshot(term, courses, by_string, by_index, text, instructors, subjects, time.time())


class Service:
    def __init__(self, settings: Settings, soc: SocClient, ratings: RatingsStore,
                 sirs: SirsProvider | None = None):
        self.settings, self.soc, self.ratings = settings, soc, ratings
        self.sirs = sirs or NullSirsProvider()
        self._snapshots: dict[str, Snapshot] = {}
        self._lock = threading.Lock()

    # ---- data loading -------------------------------------------------
    def snapshot(self, term: Term) -> Snapshot:
        snap = self._snapshots.get(term.key)
        now = time.time()
        if snap is None or now - snap.loaded_at > self.settings.courses_ttl:
            with self._lock:
                snap = self._snapshots.get(term.key)
                if snap is None or now - snap.loaded_at > self.settings.courses_ttl:
                    try:
                        snap = _build_snapshot(term, self.soc.courses(term))
                        self._snapshots[term.key] = snap
                    except SocError:
                        if snap is None:
                            raise
                        snap.loaded_at = now  # serve stale data; retry after another TTL
        if snap.open_sections is None or now - snap.open_loaded_at > self.settings.open_sections_ttl:
            try:
                snap.open_sections = self.soc.open_sections(term)
            except SocError:
                pass  # fall back to the status baked into courses.json
            snap.open_loaded_at = now
        return snap

    @staticmethod
    def _is_open(snap: Snapshot, section: dict) -> bool:
        if snap.open_sections is not None:
            return str(section["index"]) in snap.open_sections
        return bool(section.get("openStatus"))

    # ---- ratings ------------------------------------------------------
    def _match(self, snap: Snapshot, soc_name: str):
        self._sync_cache(snap)
        if soc_name not in snap.match_cache:
            snap.match_cache[soc_name] = self.ratings.match(soc_name, snap.subjects.get(soc_name, ()))
        return snap.match_cache[soc_name]

    def _sync_cache(self, snap: Snapshot) -> None:
        self.ratings.data()  # reloads the database if the file changed
        if snap.agg_version != self.ratings.version:
            snap.agg_cache.clear()
            snap.match_cache.clear()
            snap.agg_version = self.ratings.version

    def instructor_rating(self, snap: Snapshot, soc_name: str) -> dict:
        match, prof = self._match(snap, soc_name)
        out = {"match": {"status": match.status, "confidence": match.confidence},
               "rmp": self._rmp_summary(prof) if prof else None,
               "sirs": self.sirs.for_professor(soc_name)}
        return out

    @staticmethod
    def _rmp_summary(p: Professor) -> dict:
        return {"professor_id": p.id, "name": f"{p.first_name} {p.last_name}".strip(),
                "department": p.department, "avg_rating": p.avg_rating,
                "avg_difficulty": p.avg_difficulty,
                "would_take_again_percent": p.would_take_again_percent,
                "num_ratings": p.num_ratings, "url": p.url}

    def course_rating(self, snap: Snapshot, course: dict) -> dict:
        data = self.ratings.data()
        self._sync_cache(snap)
        cs = course["courseString"]
        if cs in snap.agg_cache:
            return snap.agg_cache[cs]
        names = {i["name"] for s in course.get("sections", []) for i in s.get("instructors", [])}
        profs, rated = {}, []
        for n in names:
            m, p = self._match(snap, n)
            if p:
                profs[p.id] = p
        for p in profs.values():
            if p.num_ratings and p.avg_rating is not None:
                rated.append(p)
        total = sum(p.num_ratings for p in rated)
        agg = {"instructors_matched": len(profs), "instructors_total": len(names),
               "rmp_instructor_average": None, "rmp_this_course": None,
               "sirs": self.sirs.for_course(cs)}
        if total:
            agg["rmp_instructor_average"] = {
                "avg_rating": round(sum(p.avg_rating * p.num_ratings for p in rated) / total, 2),
                "avg_difficulty": round(sum((p.avg_difficulty or 0) * p.num_ratings
                                            for p in rated if p.avg_difficulty is not None)
                                        / max(1, sum(p.num_ratings for p in rated
                                                     if p.avg_difficulty is not None)), 2),
                "num_ratings": total, "num_instructors": len(rated)}
        n = q = d = dn = 0
        for p in profs.values():
            st = data.course_stats.get(p.id, {}).get(course["courseNumber"])
            if st:
                n += st.count
                q += st.quality_sum
                d += st.difficulty_sum
                dn += st.difficulty_n
        if n:
            agg["rmp_this_course"] = {"avg_rating": round(q / n, 2),
                                      "avg_difficulty": round(d / dn, 2) if dn else None,
                                      "num_ratings": n}
        snap.agg_cache[cs] = agg
        return agg

    @staticmethod
    def _headline(agg: dict) -> float | None:
        """Single number used for sorting/filtering: course-specific if known, else instructor average."""
        block = agg["rmp_this_course"] or agg["rmp_instructor_average"]
        return block["avg_rating"] if block else None

    # ---- shaping ------------------------------------------------------
    def _meeting(self, m: dict) -> dict:
        start, start_disp = _clock(m.get("startTimeMilitary"))
        end, end_disp = _clock(m.get("endTimeMilitary"))
        day = m.get("meetingDay") or None
        return {"day": day, "day_name": DAY_NAMES.get(day), "start": start, "end": end,
                "start_display": start_disp, "end_display": end_disp,
                "mode": m.get("meetingModeDesc"), "campus": m.get("campusName"),
                "campus_abbrev": m.get("campusAbbrev"), "building": m.get("buildingCode"),
                "room": m.get("roomNumber"), "by_arrangement": day is None}

    def section(self, snap: Snapshot, course: dict, s: dict) -> dict:
        return {
            "index": str(s["index"]), "number": s.get("number"),
            "course_string": course["courseString"], "open": self._is_open(snap, s),
            "open_status_text": s.get("openStatusText"),
            "instructors": [{"name": i["name"], "display_name": display_name(i["name"]),
                             "key": slug(i["name"]), **self.instructor_rating(snap, i["name"])}
                            for i in s.get("instructors", [])],
            "meeting_times": [self._meeting(m) for m in s.get("meetingTimes", [])],
            "campus_locations": [c.get("description") for c in s.get("sectionCampusLocations", [])],
            "section_type": s.get("sectionCourseType"), "subtitle": s.get("subtitle") or None,
            "exam": s.get("examCodeText"), "final_exam": s.get("finalExam"),
            "notes": s.get("sectionNotes") or None, "comments": s.get("commentsText") or None,
            "eligibility": s.get("sectionEligibility") or None,
            "open_to": s.get("openToText") or None,
            "cross_listed": s.get("crossListedSectionsText") or None,
            "session_dates": s.get("sessionDates"),
            "majors": s.get("majors") or [], "minors": s.get("minors") or [],
        }

    def course_summary(self, snap: Snapshot, c: dict) -> dict:
        sections = c.get("sections", [])
        names = sorted({i["name"] for s in sections for i in s.get("instructors", [])})
        return {
            "course_string": c["courseString"], "title": c.get("expandedTitle") or c.get("title"),
            "subject": c["subject"], "subject_description": c.get("subjectDescription"),
            "course_number": c["courseNumber"], "credits": c.get("credits"),
            "level": c.get("level"), "school": (c.get("school") or {}).get("description"),
            "core_codes": [{"code": x.get("coreCode"), "description": x.get("coreCodeDescription")}
                           for x in c.get("coreCodes", [])],
            "campus_locations": [x.get("description") for x in c.get("campusLocations", [])],
            "sections_total": len(sections),
            "sections_open": sum(self._is_open(snap, s) for s in sections),
            "instructors": [{"name": n, "display_name": display_name(n), "key": slug(n)}
                            for n in names],
            "ratings": self.course_rating(snap, c),
        }

    def course_detail(self, snap: Snapshot, c: dict) -> dict:
        out = self.course_summary(snap, c)
        out.update({
            "description": c.get("courseDescription") or None,
            "prerequisites": c.get("preReqNotes") or None,
            "notes": c.get("courseNotes") or None, "subject_notes": c.get("subjectNotes") or None,
            "unit_notes": c.get("unitNotes") or None, "synopsis_url": c.get("synopsisUrl") or None,
            "course_fee": c.get("courseFeeDescr") or (c.get("courseFee") if c.get("courseFee") not in (None, "0") else None),
            "sections": [self.section(snap, c, s) for s in c.get("sections", [])],
        })
        return out

    # ---- search -------------------------------------------------------
    @staticmethod
    def _filters_pass(c: dict, subject, school, level, core, credits) -> bool:
        if subject and subject != c["subject"] and norm(subject) not in norm(c.get("subjectDescription")):
            return False
        sch = c.get("school") or {}
        if school and school != sch.get("code") and norm(school) not in norm(sch.get("description")):
            return False
        if level and (c.get("level") or "").upper() != level.upper():
            return False
        if core and core.upper() not in {x.get("coreCode") for x in c.get("coreCodes", [])}:
            return False
        return credits is None or c.get("credits") == credits

    @staticmethod
    def _score(c: dict, hay: str, q: str | None, tokens: list[str], numeric: bool) -> int | None:
        """Relevance of a course for `q`, or None when it does not match."""
        if not q:
            return 0
        digits = re.sub(r"\D", "", q)
        cs_digits = c["courseString"].replace(":", "")
        if numeric:  # "198:111", "198111", "01:198:111", or a bare section index
            if len(digits) >= 3 and digits in cs_digits:
                return 90 if cs_digits.endswith(digits) else 80
            if any(str(s["index"]) == digits for s in c.get("sections", [])):
                return 70
            return None
        if not all(t in hay for t in tokens):
            return None
        title = norm(c.get("expandedTitle") or c.get("title"))
        if title == " ".join(tokens):
            return 85
        if title.startswith(" ".join(tokens)):
            return 60
        return 40 if all(t in title for t in tokens) else 10

    def search(self, snap: Snapshot, *, q=None, subject=None, school=None, level=None, core=None,
               credits=None, open_only=False, instructor=None, min_rating=None, sort=None):
        q = (q or "").strip() or None
        tokens = norm(q).split() if q else []
        numeric = bool(q) and re.fullmatch(r"[\d: ]+", q) is not None
        wanted = norm(instructor) if instructor else None
        scored = []
        for c in snap.courses:
            if not self._filters_pass(c, subject, school, level, core, credits):
                continue
            sections = c.get("sections", [])
            if open_only and not any(self._is_open(snap, s) for s in sections):
                continue
            if wanted and not any(wanted in norm(i["name"]) for s in sections
                                  for i in s.get("instructors", [])):
                continue
            score = self._score(c, snap.search_text[c["courseString"]], q, tokens, numeric)
            if score is None:
                continue
            rating = None
            if min_rating is not None or sort == "rating":
                rating = self._headline(self.course_rating(snap, c))
                if min_rating is not None and (rating is None or rating < min_rating):
                    continue
            scored.append((score, rating, c["courseString"], c))
        if sort == "rating":
            scored.sort(key=lambda t: (t[1] is None, -(t[1] or 0), t[2]))
        elif sort == "course" or not q:
            scored.sort(key=lambda t: t[2])
        else:
            scored.sort(key=lambda t: (-t[0], t[2]))
        return [t[3] for t in scored]

    # ---- professors ---------------------------------------------------
    def professor_courses(self, snap: Snapshot, raw_name: str) -> list[dict]:
        out = []
        for c in snap.courses:
            secs = [s for s in c.get("sections", [])
                    if any(i["name"] == raw_name for i in s.get("instructors", []))]
            if secs:
                out.append({"course_string": c["courseString"],
                            "title": c.get("expandedTitle") or c.get("title"),
                            "sections": [{"index": str(s["index"]), "number": s.get("number"),
                                          "open": self._is_open(snap, s)} for s in secs]})
        return out
