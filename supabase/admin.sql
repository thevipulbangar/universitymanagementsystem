-- VIT Portal — admin role + automatic login linking.
-- Run AFTER schema.sql (and seed.sql) in Supabase Dashboard → SQL Editor. Safe to run again.
-- Existing student/faculty policies are not touched; admins get an extra "admin all" policy per table
-- (permissive policies are OR-ed, so this only widens access for admins).

create table if not exists admin (
  admin_id text primary key,                          -- 'A01'
  user_id  uuid unique references auth.users on delete set null,
  name     text not null,
  email    text not null unique
);

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from admin where user_id = auth.uid()) $$;

-- Emails an admin has just created a login for (see "Create login" in the Admin console).
-- The auth trigger below links a new auth user only when its email is invited here, so a stranger
-- cannot self-sign-up with someone's email and inherit their record (or the admin's).
create table if not exists pending_login (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: admins may select/insert/update/delete everything
-- ---------------------------------------------------------------------
alter table admin enable row level security;
alter table pending_login enable row level security;
drop policy if exists "self read" on admin;
create policy "self read" on admin for select to authenticated using (user_id = auth.uid());  -- role detection

do $$ declare t text; begin
  foreach t in array array['admin','pending_login','department','program','faculty','course','prerequisite',
                           'requirement_category','program_requirement','semester','student','section','enrollment',
                           'section_meeting','attendance','attendance_submission','lesson_plan','lesson_progress',
                           'calendar_event','fee','certificate','hostel_allotment','exam_paper','hall_ticket','notification'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "admin all" on %I', t);
    execute format('create policy "admin all" on %I for all to authenticated using ((select is_admin())) with check ((select is_admin()))', t);
  end loop;
end $$;

-- schema.sql limits notification UPDATE to the "read" column (column grant). Admins need every column,
-- so grant the table back and enforce "students may only flip read" in a trigger instead.
create or replace function notification_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if not is_admin() and (new.id, new.student_id, new.title, new.body, new.kind, new.created_at)
                is distinct from (old.id, old.student_id, old.title, old.body, old.kind, old.created_at) then
    raise exception 'only the read flag may be changed';
  end if;
  return new;
end $$;
drop trigger if exists notification_guard on notification;
create trigger notification_guard before update on notification for each row execute function notification_guard();
grant update on notification to authenticated;

-- ---------------------------------------------------------------------
-- Link auth users to student / faculty / admin rows by email
-- ---------------------------------------------------------------------
create or replace function link_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pending_login where lower(email) = lower(new.email) and created_at > now() - interval '1 day') then
    update student set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
    update faculty set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
    update admin   set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  end if;
  delete from pending_login where lower(email) = lower(new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.link_auth_user();

insert into admin (admin_id, user_id, name, email) values ('A01', null, 'Portal Administrator', 'admin@vit.edu')
on conflict do nothing;

-- One-off backfill (re-run this file to link users created in the Dashboard since).
update student s set user_id = u.id from auth.users u where lower(u.email) = lower(s.email) and s.user_id is null
  and not exists (select 1 from student x where x.user_id = u.id);
update faculty f set user_id = u.id from auth.users u where lower(u.email) = lower(f.email) and f.user_id is null
  and not exists (select 1 from faculty x where x.user_id = u.id);
update admin   a set user_id = u.id from auth.users u where lower(u.email) = lower(a.email) and a.user_id is null
  and not exists (select 1 from admin x where x.user_id = u.id);

-- ---------------------------------------------------------------------
-- Admin console "Create login / Set password": creates (or resets) a confirmed
-- email+password login and links it to the student / faculty / admin row with that email.
-- Works whether or not "Confirm email" is on, and never sends mail.
-- ---------------------------------------------------------------------
create or replace function admin_set_login(p_email text, p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  em  text := lower(trim(p_email));
  uid uuid;
begin
  if not is_admin() then raise exception 'only admins can create logins'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'password must be at least 6 characters'; end if;
  if not exists (select 1 from student where lower(email) = em union all select 1 from faculty where lower(email) = em
                 union all select 1 from admin where lower(email) = em) then
    raise exception 'no student, faculty or admin record has the email %', em;
  end if;

  select id into uid from auth.users where lower(email) = em;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
            crypt(p_password, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  else
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')),
                          email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
    where id = uid;
  end if;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  select gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now()
  where not exists (select 1 from auth.identities where user_id = uid and provider = 'email');

  update student set user_id = uid where lower(email) = em;
  update faculty set user_id = uid where lower(email) = em;
  update admin   set user_id = uid where lower(email) = em;
  return uid;
end $$;
revoke all on function admin_set_login(text, text) from public, anon;
grant execute on function admin_set_login(text, text) to authenticated;
