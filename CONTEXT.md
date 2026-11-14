# VIT Academic Portal — project context

DBMS course project: a university portal (student / faculty / admin) on **MongoDB**, served by a small Python server.
Last updated 2026-11-04.

## Run it
- MongoDB runs as the Windows service "MongoDB" (`mongodb://localhost:27017`, db `vit_portal`).
- `python serve.py` (or `start.bat`) → http://localhost:5500/ . Needs `pip install pymongo`.
- Sign-in: students at http://localhost:5500/ , faculty at http://localhost:5500/faculty (password = their own email). The portal has no admin sign-in; the admin console code and the API admin accounts (`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `keys.env`) still exist but are unreachable from the UI.

## How it fits together
browser → `app/db-client.js` → `serve.py` (JSON API) → `mongo_db.py` → MongoDB
- `mongo_db.py` parses `supabase/schema.sql` + `admin.sql` at start-up and enforces keys, uniques, not-null, defaults, FKs and ON DELETE actions; ports the old row-level-security rules (`scope`, `check_write`), registration (`register/drop/swap_section`), `transcript`/`sgpa` views, scrypt logins, sessions, and `sync_years()`.
- `app/portal-data.js` = data layer (`window.VIT`); `app/*.dc.html` = pages (Portal shell, Admin console, Faculty, student pages).
- `data/build_timetable.py` (CLI) and the Admin "Generate timetable" button build sections + a clash-free timetable.
- `data/generate.py` made the sample dataset (record only; its SQL output is no longer loaded).

## Rules the user set
- ER diagram entities stay intact: department, program, program_requirement, course, prerequisite (group_no + min_grade_point), student, enrollment, section, semester.
- No Docker. Supabase was dropped on 2026-11-03 (project `bmupevhuuwwdixxkyyiw` still exists online, unused).
- Student years are **FY / SY / TY / LY** (+ "Graduated"), derived from `admit_year` and the latest semester's academic year; they advance when the admin adds the next year's semester.

## Data (synthetic, sized to VIT Pune's 2026-27 intake)
9,072 students · 468 faculty · 190 courses · 3,100 sections · 180k enrolments · 363k attendance rows · 100k fee rows.
Branches: CE, AIDS, AIML, CSEAI, ME, CSML (+ Basic Sciences for first year). Current term "Odd 2026-27".

## Recently made live (2026-11-07)
Term/registration labels (`VIT.term`, `registrationWindow`), `career_path`, `ppo_event`, `ppo_application`, `request` collections (schema.sql, seeded by `data/seed_extras.py`), computed PPO eligibility, real file downloads (`VIT.saveDoc`), faculty announcements form.

## Monthly faculty feedback
`feedback_question` (8 statements rated 1-5: completion, doubts, career, clarity, punctuality, material, approachability, evaluation), `feedback_form` (one row per month, auto-created by `mongo_db.ensure_feedback_form()` on the first request of a month + an announcement), `feedback_submission` (who filled which section) and anonymous `feedback_response`. Students write only via the `submit_feedback` RPC. Class teacher = the student's `mentor_id`; the Feedback page's "My class" tab lists who has / hasn't filled. Recent sample attendance + lesson progress: `python data/seed_recent.py` (fills teaching days with no attendance up to the last day of instruction). Sample ratings: `python data/seed_feedback.py [share]` (synthetic; seeds every month of the term, replaces them on re-run). Pages: `app/Feedback.dc.html` (student nav "Faculty Feedback", faculty nav "Feedback").

## Admin console features
Table browser with search and Branch/Year filters · select rows → bulk set password (= email) / delete · Set/Change password · Generate timetable · Activity log (MongoDB `activity_log`).

## Known gaps
- CHECK constraints are not enforced by MongoDB (the app keeps values in range).
- Registration uses a server lock, not transactions (standalone MongoDB).
- An Approved seat/waiver request is a one-time override in `register_section` (waiver skips the prerequisite, seat adds one place); it becomes `Used` after registering.
- Heads of Department (department.hod_name = faculty name) set the term's registration window (`set_reg_window` RPC, faculty Registration page).
- Faculty enter ISE1 (/20), ISE2 (/20), ESE (/60) marks in `assessment` via the `save_marks` RPC; students see them on Examination → "in progress" tab. Users change their own password (`change_password` RPC).
- Fee "Pay" is a test payment (recorded in `fee`, no gateway). Career advisor is rule-based (no LLM). Career salary figures are indicative.
