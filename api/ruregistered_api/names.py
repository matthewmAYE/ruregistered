"""Instructor name normalisation and matching between SOC and RMP."""
from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass


def norm(text: str | None) -> str:
    """Lowercase, strip accents and punctuation, collapse whitespace."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z]+", " ", text.lower()).strip()


def parse_soc_name(raw: str) -> tuple[str, str]:
    """SOC instructors are 'LAST, FIRST [MIDDLE]'. Returns (last, first-and-middle)."""
    last, _, first = (raw or "").partition(",")
    return last.strip(), first.strip()


def display_name(raw: str) -> str:
    last, first = parse_soc_name(raw)
    if not first:
        return last.title()
    return f"{first.title()} {last.title()}"


def slug(raw: str) -> str:
    return norm(raw).replace(" ", "-")


@dataclass(frozen=True)
class Match:
    status: str  # "matched" | "unmatched" | "ambiguous"
    confidence: str | None = None  # "exact" | "fuzzy" for matched
    professor_id: str | None = None


def _compact(text: str) -> str:
    return norm(text).replace(" ", "")


def _prefix_match(a: str, b: str) -> bool:
    shorter = min(len(a), len(b))
    return (a.startswith(b) or b.startswith(a)) and (shorter == 1 or shorter >= 3)


def _dept_overlap(department: str | None, subjects: Iterable[str]) -> bool:
    """Loose test that an RMP department ('Computer Science') fits a SOC subject name."""
    dept = {t for t in norm(department).split() if len(t) >= 4}
    for subject in subjects:
        for t in norm(subject).split():
            if len(t) >= 4 and any(t.startswith(d[:4]) and d.startswith(t[:4]) for d in dept):
                return True
    return False


class NameIndex:
    """Maps SOC instructor names onto RMP professors.

    About a third of SOC instructors have only a last name, so matching also uses the
    subjects the instructor teaches (`hints`) against the RMP department.

    Levels, in order (each needs a single surviving candidate, otherwise 'ambiguous'):
    1. same last name and first token          -> "exact"
    2. same last name, first tokens are prefixes (initials, Rob/Robert) -> "fuzzy"
    3. last name only                          -> "department" (department must agree)
    Ties at levels 1-2 are broken by department agreement, also reported as "department".
    """

    def __init__(self, professors: list[tuple[str, str, str, str | None]]):
        """professors: (id, first_name, last_name, department)."""
        self._by_last: dict[str, list[tuple[str, str, str | None]]] = {}
        for pid, first, last, dept in professors:
            tokens = norm(first).split()
            self._by_last.setdefault(_compact(last), []).append(
                (pid, tokens[0] if tokens else "", dept))

    def match(self, soc_name: str, hints: Iterable[str] = ()) -> Match:
        last, first = parse_soc_name(soc_name)
        candidates = self._by_last.get(_compact(last))
        if not candidates:
            return Match("unmatched")
        tokens = norm(first).split()
        if not tokens:
            return self._resolve(candidates, hints, "department", must_agree=True)
        want = tokens[0]
        exact = [c for c in candidates if c[1] == want]
        if exact:
            return self._resolve(exact, hints, "exact")
        fuzzy = [c for c in candidates if c[1] and _prefix_match(c[1], want)]
        if fuzzy:
            return self._resolve(fuzzy, hints, "fuzzy")
        return Match("unmatched")

    @staticmethod
    def _resolve(pool, hints, confidence: str, must_agree: bool = False) -> Match:
        hints = list(hints)
        if len(pool) == 1 and not must_agree:
            return Match("matched", confidence, pool[0][0])
        agreeing = [c for c in pool if _dept_overlap(c[2], hints)]
        if len(agreeing) == 1:
            return Match("matched", "department", agreeing[0][0])
        if len(pool) > 1 or len(agreeing) > 1:
            return Match("ambiguous")
        return Match("unmatched")
