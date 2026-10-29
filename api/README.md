# RUregistered course API

A small FastAPI service that pulls the public Rutgers Schedule of Classes (SOC) JSON feed and serves
course search plus full course, section and professor detail, joined with professor ratings.

- Course data: `https://classes.rutgers.edu/soc/api/courses.json` and `openSections.json` (public, no auth).
  `courses.json` is cached for an hour, `openSections.json` for a minute, so open/closed status stays current.
  If a refresh fails, the last good snapshot keeps being served.
- Ratings: read from the SQLite file written by `scripts/rmp/collect.py` (`data/rmp/rmp.sqlite`), reloaded
  automatically when the file changes. With no file the API still works and ratings are `null`.
- SIRS: not available yet. Every rating block carries a `sirs` field (currently `null`) and
  `ruregistered_api.ratings.SirsProvider` is the slot to plug it into.

## Run

```bash
cd api
pip install -e '.[dev]'
uvicorn --factory ruregistered_api.main:app_factory --reload   # docs at http://127.0.0.1:8000/docs
python -m pytest
```

Environment: `SOC_YEAR` (2026), `SOC_TERM` (9: 1 spring, 7 summer, 9 fall, 0 winter), `SOC_CAMPUS` (NB),
`RMP_DB` (path to the SQLite file), `SOC_COURSES_TTL`, `SOC_OPEN_TTL`. Every route also takes
`?year=&term=&campus=` to look at another term.

## Routes

| Route | What it returns |
| --- | --- |
| `GET /v1/courses` | Search. Params: `q` (title, subject, `198:111` / `198111`, instructor, or a section index), `subject`, `school`, `level` (U/G), `core` (e.g. HST), `credits`, `open_only`, `instructor`, `min_rating`, `sort` (relevance, course, rating), `limit`, `offset` |
| `GET /v1/courses/{course_string}` | Full course: description, prerequisites, core codes, every section with meetings and instructors, ratings |
| `GET /v1/courses/{course_string}/sections` | Sections only (`open_only` filter) |
| `GET /v1/sections/{index}` | One section by registration index |
| `GET /v1/professors` | Instructors teaching this term with their ratings (`q`, `rated_only`, `sort`) |
| `GET /v1/professors/{key}` | One instructor, ratings, and the sections they teach |
| `GET /v1/meta` | Term, counts, load times, and how many instructors were matched to ratings |

## How ratings are joined

SOC gives instructors as `LAST, FIRST` strings with no ids, and about a third have only a last name, so each
name is matched to RateMyProfessors and the result is reported on every instructor:

```json
"match": {"status": "matched", "confidence": "exact"}
```

- `exact`: same last name and first name.
- `fuzzy`: first names are prefixes of each other (initials, Rob/Robert).
- `department`: a tie, or a last-name-only entry, resolved because exactly one candidate's RMP department
  agrees with the subjects the instructor teaches. Treat these as lower confidence in any UI.
- `ambiguous` / `unmatched`: no rating is attached rather than guessing.

A course gets two rating blocks: `rmp_instructor_average` (weighted by review count across the matched
instructors teaching it) and `rmp_this_course` (reviews whose RMP course label ends in this course number,
e.g. `CS111`; best effort, since RMP labels are free text). `sort=rating` and `min_rating` use
`rmp_this_course` when present, otherwise the instructor average.

## Notes

- Bright Data is not used. The SOC feed is public JSON and a plain `httpx` fetch is enough; `SocClient`
  is the only place that talks to it if a proxy or unblocker is ever needed.
- This service has no database of its own yet. It holds one term in memory (about 20 MB of JSON), so run a
  single worker per term.
