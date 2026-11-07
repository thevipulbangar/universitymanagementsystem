# University Management System — VIT Academic Portal

A university registration and academic management portal (DBMS course project).
Static HTML frontend + a small Python server (`serve.py`) backed by **MongoDB** (database `vit_portal`):
all academic data, logins and the admin activity log.

Roles: **Student** (attendance, registration, results, fees, certificates), **Faculty**
(attendance marking, lesson plans, rosters) and **Admin** (add/edit/delete any data).

## Database design

Core ER model — 8 entities plus a self-referencing prerequisite relation:

```
DEPARTMENT 1─N PROGRAM 1─N PROGRAM_REQUIREMENT N─1 COURSE
DEPARTMENT 1─N STUDENT,  PROGRAM 1─N STUDENT
STUDENT 1─N ENROLLMENT N─1 SECTION N─1 SEMESTER,  COURSE 1─N SECTION
COURSE M─N COURSE via PREREQUISITE   (group_no = OR-groups, rows in a group AND-ed)
```

The relational design lives in `supabase/schema.sql` (+ the `admin` table in `supabase/admin.sql`) and is the
single source of truth: `mongo_db.py` parses it at start-up and makes MongoDB honour it —
- one collection per table, same field names;
- primary keys and UNIQUE constraints → unique indexes; identity columns → a `counters` collection;
- NOT NULL → required fields; DEFAULTs applied on insert;
- foreign keys checked on insert/update; ON DELETE CASCADE / SET NULL / restrict applied on delete;
- the row-level-security policies → server-side rules: students see only their own records, faculty mark
  attendance only for their own sections, admins manage everything;
- registration (`register_section`, `drop_section`, `swap_section`): prerequisite check, credit cap, add/drop
  window and seat limits; the `transcript` and `sgpa` views compute letter grades and SGPA.

CHECK constraints are not enforced by MongoDB (the app keeps those values in range). Extra collections:
`users` (scrypt-hashed passwords), `sessions` (7-day tokens, auto-expire), `counters`, `activity_log`.

## Project layout

```
start.bat / serve.py → server on http://localhost:5500: static files from app/ + the JSON API
mongo_db.py          → MongoDB model (parsed from schema.sql), rules, registration, views, auth
app/
  Portal.dc.html     → shell: login, navigation (imports the other pages)
  Admin.dc.html      → admin data console (bulk actions, Generate timetable, Activity log)
  Dashboard, Academic, Timetable, Registration, Examination, Records,
  Career, ModuleHome, Faculty (.dc.html)
  db-client.js       → browser client for the API (db.from(t).select()/insert()/…, rpc, auth)
  portal-data.js     → data layer (window.VIT): database loader + mock fallback
  support.js         → page runtime
data/
  build_timetable.py → sections, faculty allocation and a clash-free timetable for the current term
  generate.py        → how the VIT Pune-sized sample dataset was generated (writes SQL; record only)
supabase/            → the relational schema (read by mongo_db.py) and the original Supabase SQL
```

API (all JSON, `Authorization: Bearer <session token>`): `POST /api/auth/login|logout`, `POST /api/db`
(`{table, op: select|insert|update|delete|upsert, filters, order, range, values}`), `POST /api/rpc/<name>`,
`GET|POST /api/activity` (admins). Only `app/` is served as files — `keys.env` and the Python sources are not.

## Run locally

1. Install MongoDB Community Server (runs as the Windows service "MongoDB" on `mongodb://localhost:27017`).
   To use another server, set `MONGODB_URI` before starting.
2. `pip install pymongo`
3. Double-click `start.bat`, or run `python serve.py`, then open http://localhost:5500/.

Sign-in: students and faculty use their institute email as both email and password (first-time setup —
change it from the Admin console). The admin login is in `keys.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
Opened without the server (e.g. as a file), the portal falls back to built-in mock data.

Current term timetable from the command line: `python data/build_timetable.py` (preview) or `--apply`.
