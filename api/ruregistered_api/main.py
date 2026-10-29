"""FastAPI app: /v1 course, section and professor routes backed by Rutgers SOC + ratings."""
from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import VALID_CAMPUSES, VALID_TERMS, Settings, Term
from .names import display_name, norm
from .ratings import RatingsStore, SirsProvider
from .service import Service
from .soc import SocClient, SocError


def create_app(settings: Settings | None = None, soc: SocClient | None = None,
               ratings: RatingsStore | None = None, sirs: SirsProvider | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    soc = soc or SocClient(settings.soc_base_url)
    ratings = ratings or RatingsStore(settings.rmp_db)
    svc = Service(settings, soc, ratings, sirs)
    app = FastAPI(title="RUregistered API", version="0.1.0",
                  description="Rutgers Schedule of Classes joined with professor ratings.")

    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                           allow_methods=["GET"], allow_headers=["*"])

    @app.exception_handler(SocError)
    async def _soc_error(_: Request, exc: SocError):
        return JSONResponse({"detail": str(exc)}, status_code=502)

    def snap_for(year: int | None, term: int | None, campus: str | None):
        d = settings.default_term
        t = Term(year or d.year, d.term if term is None else term, (campus or d.campus).upper())
        if t.term not in VALID_TERMS or t.campus not in VALID_CAMPUSES:
            raise HTTPException(422, "term must be one of 0,1,7,9 and campus one of NB,NK,CM")
        return svc.snapshot(t)

    Year = Query(None, ge=2000, le=2100, description="Defaults to SOC_YEAR")
    TermQ = Query(None, description="0 winter, 1 spring, 7 summer, 9 fall")
    Campus = Query(None, description="NB, NK or CM")

    def page(items: list, limit: int, offset: int, shape):
        return {"total": len(items), "limit": limit, "offset": offset,
                "results": [shape(x) for x in items[offset:offset + limit]]}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/v1/meta")
    def meta(year: int | None = Year, term: int | None = TermQ, campus: str | None = Campus):
        snap = snap_for(year, term, campus)
        data = ratings.data()
        names = list(snap.instructors.values())
        matched = sum(svc._match(snap, n)[0].status == "matched" for n in names)
        return {"term": {"year": snap.term.year, "term": snap.term.term, "campus": snap.term.campus},
                "courses": len(snap.courses), "sections": len(snap.section_by_index),
                "soc_loaded_at": snap.loaded_at, "open_sections_loaded_at": snap.open_loaded_at,
                "ratings": {"source": "ratemyprofessors", "available": ratings.available,
                            "professors_loaded": len(data.professors),
                            "soc_instructors": len(names), "soc_instructors_matched": matched},
                "sirs": {"available": False}}

    @app.get("/v1/courses")
    def list_courses(
        q: str | None = Query(None, description="Title, subject, course number (198:111), instructor or section index"),
        subject: str | None = Query(None, description="3-digit subject code or part of its name"),
        school: str | None = Query(None, description="2-digit school code or part of its name"),
        level: Literal["U", "G"] | None = None,
        core: str | None = Query(None, description="Core code, e.g. HST"),
        credits: float | None = None,
        open_only: bool = False,
        instructor: str | None = Query(None, description="Substring of an instructor's name"),
        min_rating: float | None = Query(None, ge=0, le=5),
        sort: Literal["relevance", "course", "rating"] | None = None,
        limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
        year: int | None = Year, term: int | None = TermQ, campus: str | None = Campus,
    ):
        snap = snap_for(year, term, campus)
        found = svc.search(snap, q=q, subject=subject, school=school, level=level, core=core,
                           credits=credits, open_only=open_only, instructor=instructor,
                           min_rating=min_rating, sort=sort)
        return page(found, limit, offset, lambda c: svc.course_summary(snap, c))

    def course_or_404(snap, course_string: str) -> dict:
        digits = "".join(ch for ch in course_string if ch.isdigit())
        cs = f"{digits[:2]}:{digits[2:5]}:{digits[5:]}" if len(digits) == 8 else course_string
        course = snap.by_string.get(cs)
        if course is None:
            raise HTTPException(404, f"No course {course_string} in this term")
        return course

    @app.get("/v1/courses/{course_string}")
    def get_course(course_string: str, year: int | None = Year, term: int | None = TermQ,
                   campus: str | None = Campus):
        snap = snap_for(year, term, campus)
        return svc.course_detail(snap, course_or_404(snap, course_string))

    @app.get("/v1/courses/{course_string}/sections")
    def course_sections(course_string: str, open_only: bool = False, year: int | None = Year,
                        term: int | None = TermQ, campus: str | None = Campus):
        snap = snap_for(year, term, campus)
        c = course_or_404(snap, course_string)
        secs = [svc.section(snap, c, s) for s in c.get("sections", [])]
        return {"course_string": c["courseString"],
                "sections": [s for s in secs if s["open"] or not open_only]}

    @app.get("/v1/sections/{index}")
    def get_section(index: str, year: int | None = Year, term: int | None = TermQ,
                    campus: str | None = Campus):
        snap = snap_for(year, term, campus)
        hit = snap.section_by_index.get(index)
        if hit is None:
            raise HTTPException(404, f"No section with index {index} in this term")
        return svc.section(snap, *hit)

    @app.get("/v1/professors")
    def list_professors(
        q: str | None = Query(None, description="Substring of the instructor's name"),
        sort: Literal["name", "rating"] = "name", rated_only: bool = False,
        limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
        year: int | None = Year, term: int | None = TermQ, campus: str | None = Campus,
    ):
        snap = snap_for(year, term, campus)
        wanted = norm(q) if q else ""
        rows = []
        for key, raw in snap.instructors.items():
            if wanted and wanted not in norm(raw) and wanted not in norm(display_name(raw)):
                continue
            row = {"key": key, "name": raw, "display_name": display_name(raw),
                   **svc.instructor_rating(snap, raw)}
            if rated_only and not row["rmp"]:
                continue
            rows.append(row)
        if sort == "rating":
            rows.sort(key=lambda r: (r["rmp"] is None or r["rmp"]["avg_rating"] is None,
                                     -((r["rmp"] or {}).get("avg_rating") or 0), r["key"]))
        else:
            rows.sort(key=lambda r: r["key"])
        return page(rows, limit, offset, lambda r: r)

    @app.get("/v1/professors/{key}")
    def get_professor(key: str, year: int | None = Year, term: int | None = TermQ,
                      campus: str | None = Campus):
        snap = snap_for(year, term, campus)
        raw = snap.instructors.get(key)
        if raw is None:
            raise HTTPException(404, f"No instructor '{key}' in this term")
        return {"key": key, "name": raw, "display_name": display_name(raw),
                **svc.instructor_rating(snap, raw), "courses": svc.professor_courses(snap, raw)}

    return app


def app_factory() -> FastAPI:  # uvicorn --factory ruregistered_api.main:app_factory
    return create_app()
