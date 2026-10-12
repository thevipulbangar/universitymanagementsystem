-- VIT Portal — Supabase schema
-- Paste into Supabase Dashboard → SQL Editor → Run.
--
-- Core ER model (8 entities + PREREQUISITE self-reference):
--   DEPARTMENT 1─N PROGRAM 1─N PROGRAM_REQUIREMENT N─1 COURSE
--   DEPARTMENT 1─N STUDENT,  PROGRAM 1─N STUDENT
--   STUDENT 1─N ENROLLMENT N─1 SECTION N─1 SEMESTER,  COURSE 1─N SECTION
--   COURSE M─N COURSE via PREREQUISITE
-- Columns marked "-- portal" are extra attributes the frontend needs beyond the ER diagram.
-- Everything after the core block hangs off these entities.

-- =====================================================================
-- CORE ER ENTITIES
-- =====================================================================

create table department (
  dept_id   text primary key,                         -- 'CE'
  dept_name text not null unique,
  hod_name  text
);

create table program (
  program_id    text primary key,                     -- 'BTECH-CE'
  dept_id       text not null references department,
  program_name  text not null,
  total_credits int  not null check (total_credits > 0)
);

create table faculty (                                -- portal: teaches sections, marks attendance
  faculty_id  text primary key,                       -- 'F01'
  dept_id     text not null references department,
  user_id     uuid unique references auth.users on delete set null,
  name        text not null,
  short_name  text not null,
  email       text not null unique,
  designation text not null,
  cabin       text
);

create table course (
  course_id   text primary key,                       -- 'CS401'
  dept_id     text not null references department,
  title       text not null,
  credits     int  not null check (credits between 1 and 10),
  sem_no      int  check (sem_no between 1 and 8),    -- portal: recommended semester
  course_type text,                                   -- portal: Mandatory | Professional Elective | ...
  coordinator_id text references faculty,             -- portal
  description text,                                   -- portal
  skills      text[] not null default '{}',           -- portal: career engine
  careers     text[] not null default '{}',           -- portal
  next        text[] not null default '{}'            -- portal: suggested follow-ups
);

-- Self-referencing M:N. Rows sharing (course_id, group_no) are AND-ed;
-- different groups are OR-ed. e.g. CS5xx needs (MA201 AND CS305) OR (CS413 ≥ B+):
--   (CS5xx, MA201, 1, 4), (CS5xx, CS305, 1, 4), (CS5xx, CS413, 2, 7)
create table prerequisite (
  course_id        text references course on delete cascade,
  prereq_course_id text references course on delete cascade,
  group_no         int  not null default 1,
  min_grade_point  int  not null default 4 check (min_grade_point between 0 and 10),  -- 4 = P (pass)
  primary key (course_id, prereq_course_id, group_no),
  check (course_id <> prereq_course_id)
);

create table requirement_category (                   -- portal: degree-audit buckets with credit targets
  category text primary key,                          -- 'core', 'pe', 'bsm', ...
  name     text not null,
  credits  int  not null check (credits > 0),
  note     text
);

-- A course may count toward several categories (e.g. PH101 → bsm and es).
create table program_requirement (
  program_id   text references program on delete cascade,
  course_id    text references course  on delete cascade,
  category     text references requirement_category,
  is_mandatory boolean not null default false,
  primary key (program_id, course_id, category)
);

create table semester (
  sem_id      int generated always as identity primary key,
  term_name   text not null unique,                   -- 'Even 2026-27'
  credit_cap  int  not null default 24 check (credit_cap > 0),
  year        text not null,                          -- '2026-27'
  min_credits int  not null default 16,               -- portal: registration rules
  reg_opens   date,                                   -- portal: add/drop window
  reg_closes  date,
  check (min_credits <= credit_cap),
  check (reg_closes >= reg_opens)
);

create table student (
  student_id text primary key,                        -- PRN '12310457'
  program_id text not null references program,
  dept_id    text not null references department,
  name       text not null,
  admit_year int  not null check (admit_year between 2000 and 2100),
  user_id    uuid unique references auth.users on delete set null,  -- portal: login
  first_name text,                                    -- portal
  roll       text,
  year       text,                                    -- FE | SE | TE | BE
  division   text,
  batch      text,
  current_sem int check (current_sem between 1 and 8),
  email      text not null unique,
  phone      text,
  dob        date,
  gender     text,
  category   text,
  admission  text,
  mentor_id  text references faculty
);

-- day/start_time/end_time = the section's primary slot (as in the ER diagram);
-- section_meeting below lists every weekly slot, which the timetable needs.
create table section (
  section_id   int generated always as identity primary key,
  course_id    text not null references course,
  sem_id       int  not null references semester,
  day          text not null check (day in ('Mon','Tue','Wed','Thu','Fri','Sat')),
  start_time   time not null,
  end_time     time not null,
  section_code text not null default 'A',             -- portal: 'A', 'B'
  faculty_id   text references faculty,               -- portal
  room         text,                                  -- portal
  capacity     int  not null default 60 check (capacity > 0),
  seats        int  not null default 60 check (seats >= 0),  -- seats left; DB refuses overbooking
  unique (course_id, sem_id, section_code),
  check (end_time > start_time),
  check (seats <= capacity)
);

create table enrollment (
  enroll_id   int generated always as identity primary key,
  student_id  text not null references student on delete cascade,
  section_id  int  not null references section,
  grade_point int  check (grade_point in (0,4,5,6,7,8,9,10)),  -- null while in progress
  marks       int  check (marks between 0 and 100),  -- portal: transcript shows marks
  enrolled_at timestamptz not null default now(),
  unique (student_id, section_id)
);

-- =====================================================================
-- PORTAL TABLES (attached to the core entities)
-- =====================================================================

create table section_meeting (
  id         int generated always as identity primary key,
  section_id int  not null references section on delete cascade,
  day        text not null check (day in ('Mon','Tue','Wed','Thu','Fri','Sat')),
  start_time time not null,
  end_time   time not null,
  room       text not null,
  type       text not null,                           -- Lecture | Lab | Tutorial | Studio
  check (end_time > start_time)
);

create table attendance (
  id         int generated always as identity primary key,
  enroll_id  int  not null references enrollment on delete cascade,
  faculty_id text references faculty,
  held_on    date not null,
  held_at    time,
  type       text not null default 'Lecture',
  status     text not null check (status in ('Present','Absent','Excused')),
  unique nulls not distinct (enroll_id, held_on, held_at)
);

create table attendance_submission (                  -- faculty-side log of each roll call
  id         int generated always as identity primary key,
  section_id int  not null references section,
  faculty_id text references faculty,
  held_on    date not null,
  present    int  not null,
  total      int  not null check (present between 0 and total),
  created_at timestamptz not null default now()
);

create table lesson_plan (
  course_id  text primary key references course on delete cascade,
  objectives text[] not null default '{}',
  modules    jsonb  not null                          -- [{n,title,topics:[[title,date]]}]
);

create table lesson_progress (
  course_id  text references course on delete cascade,
  module_n   int  not null,
  topic      text not null,
  done       boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (course_id, module_n, topic)
);

create table calendar_event (
  id       int generated always as identity primary key,
  sem_id   int references semester,
  start_on date not null,
  end_on   date not null,
  title    text not null,
  kind     text not null,                             -- academic | registration | holiday | exam
  detail   text,
  check (end_on >= start_on)
);

create table fee (
  id         int generated always as identity primary key,
  student_id text not null references student on delete cascade,
  year       text not null,
  head       text not null,
  amount     int  not null check (amount >= 0),
  status     text not null check (status in ('PAID','PENDING')),
  paid_on    date,
  due_on     date,
  receipt    text unique,
  mode       text
);

create table certificate (
  id         int generated always as identity primary key,
  student_id text not null references student on delete cascade,
  title      text not null,
  issuer     text not null,
  ref_code   text,
  issued_on  date not null,
  hours      int,
  verified   boolean not null default false,
  grade      text
);

create table hostel_allotment (
  student_id   text primary key references student on delete cascade,
  hostel       text not null,
  block        text,
  room         text,
  floor        text,
  occupancy    text,
  warden       text,
  warden_phone text,
  mess         text,
  check_in     date
);

create table exam_paper (
  id        int generated always as identity primary key,
  sem_id    int  not null references semester,
  exam      text not null,                            -- 'In-Semester Examination I'
  course_id text not null references course,
  held_on   date not null,
  time_slot text not null,                            -- '10:00 – 11:30'
  venue     text not null,
  unique (sem_id, exam, course_id)
);

create table hall_ticket (
  student_id   text references student on delete cascade,
  sem_id       int  references semester,
  exam         text not null,
  seat         text not null,
  centre       text not null,
  block        text,
  instructions text[] not null default '{}',
  primary key (student_id, sem_id, exam)
);

create table notification (
  id         int generated always as identity primary key,
  student_id text references student on delete cascade,  -- null = everyone
  title      text not null,
  body       text,
  kind       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index on section (course_id, sem_id);
create index on enrollment (section_id);
create index on section_meeting (section_id);
create index on attendance (enroll_id);
create index on notification (student_id, created_at desc);

-- =====================================================================
-- VIEWS
-- =====================================================================

create function grade_letter(gp int) returns text language sql immutable as $$
  select case gp when 10 then 'O' when 9 then 'A+' when 8 then 'A' when 7 then 'B+'
                 when 6 then 'B' when 5 then 'C' when 4 then 'P' when 0 then 'F' end $$;

-- Completed courses with letter grades (feeds Examination → Grade Card).
create view transcript with (security_invoker = true) as
select e.student_id, sm.sem_id, sm.term_name, c.course_id, c.title, c.credits,
       e.grade_point, grade_letter(e.grade_point) as grade, e.marks
from enrollment e
join section  s  on s.section_id = e.section_id
join course   c  on c.course_id  = s.course_id
join semester sm on sm.sem_id    = s.sem_id
where e.grade_point is not null;

-- SGPA per student per semester.
create view sgpa with (security_invoker = true) as
select student_id, sem_id, term_name,
       round(sum(grade_point * credits)::numeric / sum(credits), 2) as sgpa,
       sum(credits) as credits
from transcript group by student_id, sem_id, term_name;

-- =====================================================================
-- FUNCTIONS (registration runs in one transaction inside the DB)
-- =====================================================================

create function my_student_id() returns text language sql stable security definer set search_path = public as
  $$ select student_id from student where user_id = auth.uid() $$;

create function my_faculty_id() returns text language sql stable security definer set search_path = public as
  $$ select faculty_id from faculty where user_id = auth.uid() $$;

-- True when some OR-group of p_course's prerequisites is fully met by p_student's passed grades.
create function prereqs_met(p_student text, p_course text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from prerequisite where course_id = p_course)
      or exists (
        select 1 from prerequisite g
        where g.course_id = p_course
        group by g.group_no
        having bool_and(exists (
          select 1 from enrollment e join section s on s.section_id = e.section_id
          where e.student_id = p_student and s.course_id = g.prereq_course_id
            and e.grade_point >= g.min_grade_point)))
$$;

-- Raises unless today is inside the section's semester add/drop window (null dates = closed).
create function assert_window_open(p_section int) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from section s join semester sm on sm.sem_id = s.sem_id
                 where s.section_id = p_section and current_date between sm.reg_opens and sm.reg_closes) then
    raise exception 'registration window closed';
  end if;
end $$;

create function register_section(p_section int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student text := my_student_id();
  v_course  text; v_sem int; v_cap int; v_opens date; v_closes date; v_now int;
begin
  if v_student is null then raise exception 'not a student'; end if;
  select s.course_id, s.sem_id, sm.credit_cap, sm.reg_opens, sm.reg_closes
    into v_course, v_sem, v_cap, v_opens, v_closes
    from section s join semester sm on sm.sem_id = s.sem_id where s.section_id = p_section;
  if v_course is null then raise exception 'no such section'; end if;
  perform assert_window_open(p_section);
  if exists (select 1 from enrollment e join section s on s.section_id = e.section_id
             where e.student_id = v_student and s.course_id = v_course and s.sem_id = v_sem) then
    raise exception 'already registered for %', v_course;
  end if;
  if not prereqs_met(v_student, v_course) then raise exception 'prerequisites not met for %', v_course; end if;
  select coalesce(sum(c.credits), 0) into v_now
    from enrollment e join section s on s.section_id = e.section_id join course c on c.course_id = s.course_id
    where e.student_id = v_student and s.sem_id = v_sem;
  if v_now + (select credits from course where course_id = v_course) > v_cap then
    raise exception 'credit cap % exceeded', v_cap;
  end if;
  update section set seats = seats - 1 where section_id = p_section and seats > 0;  -- row lock serialises racers
  if not found then raise exception 'section is full'; end if;
  insert into enrollment (student_id, section_id) values (v_student, p_section);
end $$;

create function drop_section(p_section int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_window_open(p_section);
  delete from enrollment where student_id = my_student_id() and section_id = p_section and grade_point is null;
  if found then update section set seats = seats + 1 where section_id = p_section; end if;
end $$;

create function swap_section(p_from int, p_to int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select (course_id, sem_id) from section where section_id = p_from)
     is distinct from (select (course_id, sem_id) from section where section_id = p_to) then
    raise exception 'sections belong to different courses';
  end if;
  perform assert_window_open(p_to);
  update enrollment set section_id = p_to
    where student_id = my_student_id() and section_id = p_from and grade_point is null;
  if not found then raise exception 'not registered in section %', p_from; end if;
  update section set seats = seats - 1 where section_id = p_to and seats > 0;
  if not found then raise exception 'section is full'; end if;
  update section set seats = seats + 1 where section_id = p_from;
end $$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

-- Reference tables: any signed-in user reads; nobody writes from the browser.
do $$ declare t text; begin
  foreach t in array array['department','program','faculty','course','prerequisite','requirement_category',
                           'program_requirement','semester','section','section_meeting','lesson_plan',
                           'calendar_event','exam_paper'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Per-student tables: own rows, or any faculty.
do $$ declare t text; begin
  foreach t in array array['student','enrollment','fee','certificate','hostel_allotment','hall_ticket'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own or faculty %1$s" on %1$I for select to authenticated
                    using (student_id = my_student_id() or my_faculty_id() is not null)', t);
  end loop;
end $$;
-- enrollment is written only via register_section / drop_section / swap_section.

alter table attendance enable row level security;
create policy "own or faculty" on attendance for select to authenticated using (
  my_faculty_id() is not null
  or exists (select 1 from enrollment e where e.enroll_id = attendance.enroll_id and e.student_id = my_student_id()));
create policy "faculty mark" on attendance for insert to authenticated with check (
  faculty_id = my_faculty_id()
  and exists (select 1 from enrollment e join section s on s.section_id = e.section_id
              where e.enroll_id = attendance.enroll_id and s.faculty_id = my_faculty_id()));

alter table attendance_submission enable row level security;
create policy "faculty read"  on attendance_submission for select to authenticated using (my_faculty_id() is not null);
create policy "faculty write" on attendance_submission for insert to authenticated with check (faculty_id = my_faculty_id());

alter table lesson_progress enable row level security;
create policy "read" on lesson_progress for select to authenticated using (true);
create policy "faculty write" on lesson_progress for all to authenticated
  using (my_faculty_id() is not null) with check (my_faculty_id() is not null);

alter table notification enable row level security;
create policy "own" on notification for select to authenticated using (student_id = my_student_id() or student_id is null);
create policy "mark read" on notification for update to authenticated
  using (student_id = my_student_id()) with check (student_id = my_student_id());
revoke update on notification from authenticated;
grant update (read) on notification to authenticated;   -- students may flip read, nothing else
create policy "faculty notify" on notification for insert to authenticated with check (my_faculty_id() is not null);
