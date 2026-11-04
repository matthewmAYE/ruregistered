# RUregistered web

React (Vite) frontend. Course data comes from the Python API; reviews and login use Supabase.

## Setup
1. `npm install`
2. `cp .env.example .env` and fill in the Supabase URL and anon key.
3. Run `supabase/schema.sql`, then `supabase/ratings_and_email.sql`, in the Supabase SQL editor.
   The second file adds per course averages for the API and blocks sign ups from non Rutgers emails.
   If the database already exists, run only the second file.
4. Start the Python API: `uvicorn --factory ruregistered_api.main:app_factory --port 8000`.
   Give it `SUPABASE_URL` and `SUPABASE_KEY` (same values as the `.env` here) so search can sort by student ratings.
5. `npm run dev` and open http://localhost:5173

The Python API must allow CORS from `http://localhost:5173` (see `CORSMiddleware` note).

## Structure
- `src/api.js` calls the Python API
- `src/supabase.js` and `src/auth.jsx` handle Supabase and login state
- `src/pages/` Search, Course, Professor, Login
- `src/components/Reviews.jsx` student reviews (Supabase)

## Tests
`npm test` runs the suite once (Vitest + React Testing Library); `npm run test:watch` reruns on save.
The API and Supabase are mocked, so tests need no `.env`, no network and no running backend.
Tests live in `src/__tests__/`, one file per page/component plus `api.test.js`.
