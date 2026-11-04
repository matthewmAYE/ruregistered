# RUregistered design

What we're building, what's done, and what's left. Source of truth for scope is the
[Software Engineering Proposal](https://docs.google.com/presentation/d/1mgHU8UC6ilxLI1YWrgq_8YRwJyVlgZ8jPHI_olc1LcQ)
(Group 4, Oct 6 2026). Update this file when a feature ships or the plan changes.

## Goal

Ratings, reviews and registration for Rutgers classes in one place. A student should be able to find a course,
see what other students thought of it (numbers, comments and an AI summary), and go register for a section
without opening SOC, RateMyProfessors, SIRS and Reddit in separate tabs.

The proposal centres on reviews of the **class as a whole**, not only the professor. RMP data is a supplement;
our own student reviews are the main product.

## Features from the proposal

| # | Feature | Status | Where / what's missing |
| --- | --- | --- | --- |
| 1 | Search by name, code or department | **Done** | Typing `332` now returns only that department. A Department dropdown is fed by the new `GET /v1/subjects`. Fixed a bug where a numeric `subject` filter matched every course. [Search.jsx](ruregistered-web/src/pages/Search.jsx) |
| 2 | Course page with sections and professors | Done | [Course.jsx](ruregistered-web/src/pages/Course.jsx), [Professor.jsx](ruregistered-web/src/pages/Professor.jsx) |
| 3 | Leave a rating and comment on a class | Done | [Reviews.jsx](ruregistered-web/src/components/Reviews.jsx), `reviews` table in [schema.sql](ruregistered-web/supabase/schema.sql). Users can delete a review but not edit it |
| 4 | Class average from student reviews | **Done** | Supabase view `course_review_stats` in [ratings_and_email.sql](ruregistered-web/supabase/ratings_and_email.sql), read by the API ([reviews.py](api/ruregistered_api/reviews.py)) and returned as `ratings.student_reviews`. Search results show "Students 4.8/5 (12)" and fall back to RMP |
| 5 | Sort by rating | **Done** | "Highest rated" uses student reviews first, then RMP for this course, then the instructor average |
| 6 | Login with a verified ScarletMail account | **Done** | Sign up only accepts `@scarletmail.rutgers.edu` and `@rutgers.edu`. Checked in the form for a clear message and enforced by a database trigger. Existing accounts can still log in |
| 7 | AI summary of reviews | Not started | No LLM code anywhere |
| 8 | Easy registration (send to WebReg with the index copied) | Not started | Section index is shown; no copy button or WebReg link |
| 9 | AI flagging of malicious reviews | Not started | Planned for the polish phase |
| 10 | SIRS data | Not started | `SirsProvider` placeholder in [ratings.py](api/ruregistered_api/ratings.py); every `sirs` field is `null` |
| — | RMP ratings data | **Code done, data not collected** | [collect.py](scripts/rmp/collect.py) and its tests brought in from a side branch. Someone still has to run it to create `data/rmp/rmp.sqlite` (git ignored). See "Before this works live" |
| — | Deployment | Partly | API has Railway config and a `CORS_ORIGINS` setting. Not deployed yet, frontend has no hosting set up |

## Architecture: proposal vs. what we built

| | Proposal | Repo today |
| --- | --- | --- |
| Frontend | React | React + Vite (no Next.js) |
| Course data | Next.js route handlers; scheduled import of SOC into Postgres | Python FastAPI service holding one term of SOC in memory, refreshed hourly (open seats every minute) |
| Reviews and auth | Supabase | Supabase (matches) |
| AI | OpenAI GPT-4o/5 mini microservice | Not built |

**Decision needed:** stay with Vite + FastAPI or move to Next.js as proposed. The current split works and is
tested; switching costs time we don't have before Nov 24. Recommendation: keep the current stack, add the
AI summary as a FastAPI route (or a Supabase Edge Function), and note the change in the final presentation.

### Data flow (target)

```
Browser (React)
  ├── course search / detail ──► FastAPI ──► Rutgers SOC feed (cached)
  │                                 ├──► RMP SQLite (ratings join)
  │                                 └──► Supabase (student review averages, for sort/filter)
  ├── login, post/read reviews ──► Supabase (auth + reviews table, RLS)
  └── review summary ──────────► FastAPI /v1/courses/{cs}/summary ──► OpenAI (cached per course)
```

## Design for the missing pieces

### Ratings from our own reviews (features 4 and 5, done)
- Add a Supabase view `course_review_stats(course_string, n, avg_quality, avg_difficulty)`.
- FastAPI reads it (service key, server side only), caches for ~1 minute, and adds a `student_reviews` block next to
  the RMP blocks on every course.
- `sort=rating` and `min_rating` use `student_reviews` first, then RMP when a course has no reviews. Label which
  one is shown in the UI.
- Acceptance (from the user stories): after a review is posted, the course average updates within 2 seconds.
  The course page already reloads; the search list may lag by the cache window, which is fine.

### ScarletMail only accounts (feature 6, done)
- Restrict signup to `@scarletmail.rutgers.edu` and `@rutgers.edu`: check in the Login form for a clear
  message, and enforce in Supabase with a before-insert trigger on `auth.users` (or an auth hook), since the
  client check can be bypassed.
- Keep email confirmation on, so "verified" means the student controls the inbox.

### AI review summary (feature 7)
- Route: `GET /v1/courses/{cs}/summary`. Pulls the course's reviews from Supabase, sends comments plus
  averages to the model, returns 3 to 5 bullet themes (positives, negatives, workload, advice).
- Only summarise at 3+ reviews with comments; below that, show nothing.
- Cache in a `review_summaries(course_string, review_count, summary, created_at)` table and regenerate only when
  the review count changes, so cost stays near zero.
- API key lives only on the server. Show the summary labelled "AI summary" above the reviews.

### Registration handoff (feature 8)
- On each section: a "Register" button that copies the index to the clipboard and opens WebReg in a new tab,
  with a short "Index 12345 copied" confirmation. No WebReg automation.

### Review moderation (feature 9)
- On insert, run the comment through OpenAI's moderation endpoint (free) from the same backend. Flagged reviews
  get `hidden = true` and don't appear until reviewed. Add a `reports` table so users can flag reviews too.

### RMP data (script done, data still to collect)
- Recover or rewrite `scripts/rmp/collect.py` and commit it. Don't commit the SQLite file; document how to
  generate it, or host it somewhere the deployed API can read.

## Before this works live

These steps need a person with access. The code and tests are done.

1. **Supabase.** Run [ratings_and_email.sql](ruregistered-web/supabase/ratings_and_email.sql) once in the SQL
   editor. It is safe to rerun.
2. **API environment.** Set `SUPABASE_URL` and `SUPABASE_KEY` (the anon key from the frontend `.env`) wherever the
   API runs. Without them search still works but ignores student reviews.
3. **RMP data.** Run `python scripts/rmp/collect.py professors` (a few minutes, gives instructor averages), then
   `ratings --limit 200` in batches for per course numbers. RMP's terms prohibit automated access, so the
   team needs to decide whether showing this data on a public site is acceptable. The script's own notes
   say private use only.
4. **Python version.** The API needs Python 3.11 or newer. The macOS default `python3` here is 3.10.

The two side branches are now folded in. The collector came from `claude/project-thread-toxx3h`, and the
`CORS_ORIGINS` setting plus Railway deploy config ([railway.json](api/railway.json)) came from
`claude/project-thread-xeo227`. When `CORS_ORIGINS` is unset the API allows only the local Vite dev server.

## Timeline (from the proposal)

| Dates | Phase | Status |
| --- | --- | --- |
| Oct 5–11 | Foundation: requirements, repo, UI prototype, SOC API | Done |
| Oct 12–25 | Data and browsing: SOC import, search by name/number/department | Done (in-memory instead of DB import) |
| Oct 26–Nov 10 | Accounts and browsing: course pages, sections, ScarletMail login | Done |
| Nov 11–24 | Reviews and ratings: submit reviews, class averages, sort by rating, AI summary | Done except AI summary |
| Nov 25–final | Polish: user feedback, UI/UX, AI flagging | Not started |

## Out of scope for now
- Multiple terms at once (API supports `?year=&term=`, UI doesn't).
- Reddit scraping.
- Editing reviews (delete and re-post works).
