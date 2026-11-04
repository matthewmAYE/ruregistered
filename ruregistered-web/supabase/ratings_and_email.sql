/* Run after schema.sql in the Supabase SQL editor. Safe to run more than once. */

/* Average student rating per course, read by the Python API for search sorting */
create or replace view course_review_stats with (security_invoker = true) as
select
  course_string,
  count(*)::int as num_reviews,
  round(avg(quality)::numeric, 2) as avg_quality,
  round(avg(difficulty)::numeric, 2) as avg_difficulty
from reviews
group by course_string;

grant select on course_review_stats to anon, authenticated;

/* Only Rutgers addresses may create accounts, checked in the database so it cannot be skipped */
create or replace function public.require_rutgers_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) !~ '@(scarletmail\.)?rutgers\.edu$' then
    raise exception 'Sign up with your Rutgers ScarletMail address';
  end if;
  return new;
end;
$$;

drop trigger if exists require_rutgers_email on auth.users;
create trigger require_rutgers_email
  before insert on auth.users
  for each row execute function public.require_rutgers_email();
