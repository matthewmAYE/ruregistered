-- Run this once in the Supabase SQL editor (after schema.sql).

-- ---------- Admins ----------
-- Add yourself after signing up on the site:
--   insert into admins (user_id) select id from auth.users where email = 'you@scarletmail.rutgers.edu';
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table admins enable row level security;
create policy "admins read own row" on admins for select using (auth.uid() = user_id);

create function is_admin() returns boolean
  language sql security definer stable set search_path = public
  as $$ select exists (select 1 from admins where user_id = auth.uid()) $$;

-- ---------- Reports ----------
create table reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'irrelevant', 'other')),
  details text,
  created_at timestamptz default now(),
  unique (review_id, reporter_id)
);
alter table reports enable row level security;
create policy "users report as themselves" on reports for insert
  with check (auth.uid() = reporter_id);
create policy "see own reports, admins see all" on reports for select
  using (auth.uid() = reporter_id or is_admin());
create policy "admins resolve reports" on reports for delete using (is_admin());

-- Admins can remove any review (users can still delete their own)
create policy "admins delete any review" on reviews for delete using (is_admin());

-- ---------- Saved courses and schedule sections ----------
create table saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('course', 'section')),
  item_id text not null,          -- course string like '01:198:111', or a section index
  course_string text not null,
  created_at timestamptz default now(),
  unique (user_id, kind, item_id)
);
alter table saved_items enable row level security;
create policy "read own saved" on saved_items for select using (auth.uid() = user_id);
create policy "insert own saved" on saved_items for insert with check (auth.uid() = user_id);
create policy "delete own saved" on saved_items for delete using (auth.uid() = user_id);

-- ---------- Data API grants (needed on projects affected by Supabase's 2026 change) ----------
grant select on admins to authenticated;
grant select, insert, delete on reports to authenticated;
grant select, insert, delete on saved_items to authenticated;
grant execute on function is_admin() to authenticated;
