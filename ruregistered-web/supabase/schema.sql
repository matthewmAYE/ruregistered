create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_string text not null,
  professor_key text,
  quality int not null check (quality between 1 and 5),
  difficulty int not null check (difficulty between 1 and 5),
  comment text,
  created_at timestamptz default now(),
  unique (user_id, course_string, professor_key)
);
alter table reviews enable row level security;
create policy "anyone can read" on reviews for select using (true);
create policy "users insert own" on reviews for insert with check (auth.uid() = user_id);
create policy "users update own" on reviews for update using (auth.uid() = user_id);
create policy "users delete own" on reviews for delete using (auth.uid() = user_id);
