"""Runtime settings, read from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Term:
    year: int
    term: int  # SOC codes: 1 spring, 7 summer, 9 fall, 0 winter
    campus: str  # NB, NK, CM

    @property
    def key(self) -> str:
        return f"{self.year}-{self.term}-{self.campus}"


VALID_TERMS = {0, 1, 7, 9}
VALID_CAMPUSES = {"NB", "NK", "CM"}


@dataclass(frozen=True)
class Settings:
    default_term: Term = Term(2026, 9, "NB")
    soc_base_url: str = "https://classes.rutgers.edu/soc/api"
    courses_ttl: float = 3600.0  # seconds before courses.json is refetched
    open_sections_ttl: float = 60.0  # seconds before openSections.json is refetched
    rmp_db: Path = field(default_factory=lambda: REPO_ROOT / "data" / "rmp" / "rmp.sqlite")
    cors_origins: tuple[str, ...] = ()  # browser origins allowed to call the API; empty disables CORS

    @classmethod
    def from_env(cls) -> "Settings":
        env = os.environ
        return cls(
            default_term=Term(
                int(env.get("SOC_YEAR", 2026)),
                int(env.get("SOC_TERM", 9)),
                env.get("SOC_CAMPUS", "NB").upper(),
            ),
            soc_base_url=env.get("SOC_BASE_URL", cls.soc_base_url),
            courses_ttl=float(env.get("SOC_COURSES_TTL", cls.courses_ttl)),
            open_sections_ttl=float(env.get("SOC_OPEN_TTL", cls.open_sections_ttl)),
            rmp_db=Path(env.get("RMP_DB", REPO_ROOT / "data" / "rmp" / "rmp.sqlite")),
            cors_origins=tuple(o.strip().rstrip("/") for o in env.get("CORS_ORIGINS", "").split(",") if o.strip()),
        )
