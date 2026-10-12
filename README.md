# University Management System — VIT Academic Portal

A university registration and academic management portal (DBMS course project).
Static HTML frontend backed by **Supabase** (PostgreSQL + Auth + Row Level Security).

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

Highlights:
- Registration runs inside the database (`register_section`, `drop_section`, `swap_section`):
  prerequisite check, credit cap, add/drop window and seat limits in one transaction.
- `transcript` and `sgpa` views compute letter grades and SGPA.
- Row Level Security: students see only their own records, faculty mark attendance only
  for their own sections, admins manage everything.

## Project layout

```
index.html          → redirects to the portal
start.bat / serve.py→ local server (http://localhost:5500)
app/
  Portal.dc.html    → shell: login, navigation (imports the other pages)
  Admin.dc.html     → admin data console
  Dashboard, Academic, Timetable, Registration, Examination, Records,
  Career, DegreeAudit, ModuleHome, Faculty (.dc.html)
  portal-data.js    → data layer (window.VIT): Supabase loader + mock fallback
  config.js         → Supabase URL + anon (public) key
  support.js        → page runtime
supabase/
  schema.sql        → tables, views, functions, RLS policies
  seed.sql          → sample data
  admin.sql         → admin role, admin policies, auto-linking of logins
```

## Run locally

Requires Python 3. Double-click `start.bat`, or:

```
python serve.py
```

then open http://localhost:5500/. With an empty key in `app/config.js` the portal runs on
built-in mock data.

## Set up Supabase

1. Create a project at supabase.com.
2. SQL Editor → run `supabase/schema.sql`, then `supabase/seed.sql`, then `supabase/admin.sql`.
3. Authentication → Users → Add user (tick *Auto Confirm User*), e.g. `admin@vit.edu`,
   `vaishnavi.bhagwat23@vit.edu`, `anaya.deshmukh@vit.edu`. Run `admin.sql` again to link
   logins created after it.
4. Put the project URL and **anon** key in `app/config.js` (never the service_role key).
5. Optional: Authentication → Sign In / Providers → Email → turn off *Confirm email* so the
   admin console's "Create login" works immediately.
