"""Rebuilds the CURRENT term's sections, faculty allocation and timetable from what is in the database.

  python build_timetable.py            # dry run: plan + checks, changes nothing
  python build_timetable.py --apply    # replace current-term sections/meetings/enrolments (+ regenerate attendance)

Rules
- Students with the same course list form a cohort (e.g. all FE students; each programme-year after that).
  A cohort is split into ceil(students / CAPACITY) class groups; every group gets its own section of each course.
- Each section is taught by a faculty member of the course's department, least-loaded first, at most MAX_HOURS a week,
  never the same person for two groups of one course.
- Hard: no clash for a class group, a faculty member or a lab room; a subject meets at most once a day; lunch is free.
- Soft: "important" subjects (4+ credits) are spread so they share a day as rarely as possible.
- Lectures: min(credits, 3) one-hour slots a week. Laboratory / project courses: one 2-hour afternoon block.
Works directly on MongoDB (vit_portal) through mongo_db.py, so keys, foreign keys and cascades apply.
Attendance for the current term is regenerated (it belongs to the old sections).
"""
import datetime as dt, json, math, os, random, sys
from collections import defaultdict

CAPACITY, MAX_HOURS, TRIES = 60, 18, 400
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
SLOTS = [("09:00", "10:00"), ("10:00", "11:00"), ("11:15", "12:15"), ("12:15", "13:15"), ("14:00", "15:00"), ("15:00", "16:00")]
PAIRS = [(4, 5), (2, 3), (0, 1)]  # 2-hour blocks, afternoon first
TODAY = dt.date.today()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import mongo_db as M
ADMIN = {"admin": True, "uid": None, "email": "build_timetable.py", "faculty_id": None, "student_id": None}

def get_all(table, filt=None, key=None):
    rows = list(M.db[table].find(filt or {}, {"_id": 0}))
    return sorted(rows, key=lambda r: r[key]) if key else rows

def letters(n):  # 0 -> A, 25 -> Z, 26 -> AA (big cohorts need more than 26 sections)
    out = ""
    n += 1
    while n: n, r = divmod(n - 1, 26); out = chr(65 + r) + out
    return out


# ------------------------------------------------------------------ read
sems = get_all("semester", key="sem_id")
cur = sems[-1]["sem_id"]  # the portal treats the highest sem_id as the current term
students = get_all("student", key="student_id")
faculty = get_all("faculty", key="faculty_id")
courses = {c["course_id"]: c for c in get_all("course")}
reqs = get_all("program_requirement")
old_secs = get_all("section", {"sem_id": cur})

prog_courses = defaultdict(set)
for r in reqs: prog_courses[r["program_id"]].add(r["course_id"])
def course_list(st):  # every course of the programme recommended for the student's current semester
    return tuple(sorted(c for c in prog_courses[st["program_id"]] if courses[c]["sem_no"] == st["current_sem"]))

def is_block(c):  # laboratory / project courses get one 2-hour block
    t = c["title"].lower()
    return "laboratory" in t or "project" in t or t.endswith(" lab")
def blocks_of(c): return [(2, "Lab" if "lab" in c["title"].lower() else "Project")] if is_block(c) else [(1, "Lecture")] * min(3, c["credits"])
def important(c): return c["credits"] >= 4

# ------------------------------------------------------------------ cohorts -> class groups -> sections
cohorts = defaultdict(list)
for st in students:
    cl = course_list(st)
    if cl: cohorts[cl].append(st)
groups = []  # {name, students, courses}
for cl, sts in sorted(cohorts.items(), key=lambda kv: (kv[1][0]["current_sem"], kv[1][0]["program_id"])):
    sts.sort(key=lambda s: (s.get("division") or "", s.get("roll") or "", s["student_id"]))
    k = math.ceil(len(sts) / CAPACITY); size = math.ceil(len(sts) / k)
    progs = sorted({s["program_id"].replace("BTECH-", "") for s in sts})
    label = (sts[0]["year"] or f"S{sts[0]['current_sem']}") + " " + ("/".join(progs) if len(progs) <= 2 else "common")
    for i in range(k):
        groups.append(dict(name=label + (f" G{i + 1}" if k > 1 else ""), students=sts[i * size:(i + 1) * size], courses=list(cl)))

sections = []  # one per (course, group)
code_count = defaultdict(int)
for gi, g in enumerate(groups):
    for c in g["courses"]:
        code_count[c] += 1
        sections.append(dict(course=c, group=gi, code=letters(code_count[c] - 1), blocks=blocks_of(courses[c]), dept=courses[c]["dept_id"]))

pool = defaultdict(list)
for f in faculty: pool[f["dept_id"]].append(f["faculty_id"])
for s in sections:
    if not pool[s["dept"]]: sys.exit(f"No faculty in department {s['dept']} for {s['course']}")

home = {gi: f"{courses[g['courses'][0]]['dept_id']}-{101 + gi}" for gi, g in enumerate(groups)}  # one home classroom per group

# ------------------------------------------------------------------ schedule
def attempt(seed):
    rnd = random.Random(seed)
    busy_g, busy_f, busy_r = defaultdict(set), defaultdict(set), defaultdict(set)   # (day, slot)
    day_course, imp_day, load_g, load_f, hours = defaultdict(set), defaultdict(int), defaultdict(int), defaultdict(int), defaultdict(int)
    taught = defaultdict(set)  # faculty -> courses (one group per course each)
    plan = {}
    order = sorted(range(len(sections)), key=lambda i: (-sum(b[0] for b in sections[i]["blocks"]), rnd.random()))
    for i in order:
        s = sections[i]; g = s["group"]; c = courses[s["course"]]; need = sum(b[0] for b in s["blocks"])
        cands = sorted(pool[s["dept"]], key=lambda f: (s["course"] in taught[f], hours[f], rnd.random()))
        placed = None
        for f in cands:
            if hours[f] + need > MAX_HOURS: continue
            mtg, used_days = [], set()
            for length, typ in s["blocks"]:
                best = None
                for d in range(5):
                    if d in used_days or (s["course"], d) in day_course[g]: continue
                    for slots in ([p for p in PAIRS] if length == 2 else [(x,) for x in range(6)]):
                        room = f"{s['dept']}-LAB{1 + (g % 3)}" if length == 2 and typ == "Lab" else home[g]
                        if any((d, x) in busy_g[g] or (d, x) in busy_f[f] or (typ == "Lab" and (d, x) in busy_r[room]) for x in slots): continue
                        cost = (12 * imp_day[(g, d)] if important(c) else 0) + 2 * load_g[(g, d)] + load_f[(f, d)] \
                               + (0 if length == 2 else 0.3 * slots[0]) + rnd.random() * 0.5
                        if best is None or cost < best[0]: best = (cost, d, slots, room, typ)
                if best is None: break
                _, d, slots, room, typ = best
                used_days.add(d); mtg.append((d, slots, room, typ))
            if len(mtg) == len(s["blocks"]): placed = (f, mtg); break
        if not placed: return None
        f, mtg = placed
        for d, slots, room, typ in mtg:
            for x in slots:
                busy_g[g].add((d, x)); busy_f[f].add((d, x))
                if typ == "Lab": busy_r[room].add((d, x))
            day_course[g].add((s["course"], d)); load_g[(g, d)] += len(slots); load_f[(f, d)] += len(slots)
            if important(c): imp_day[(g, d)] += 1
        hours[f] += need; taught[f].add(s["course"]); plan[i] = placed
    return plan, hours, imp_day

result = None
for seed in range(TRIES):
    result = attempt(seed)
    if result: break
if not result: sys.exit("Could not build a clash-free timetable — add faculty, raise MAX_HOURS or add slots.")
plan, hours, imp_day = result

# ------------------------------------------------------------------ verify (independently of the scheduler)
seen_g, seen_f, seen_r = set(), set(), set()
for i, (f, mtg) in plan.items():
    s = sections[i]; days = [m[0] for m in mtg]
    assert len(days) == len(set(days)), f"{s['course']} meets twice a day"
    for d, slots, room, typ in mtg:
        for x in slots:
            for key, seen in (((s["group"], d, x), seen_g), ((f, d, x), seen_f)) + ((((room, d, x), seen_r),) if typ == "Lab" else ()):
                assert key not in seen, f"clash {key}"; seen.add(key)
    assert courses[s["course"]]["dept_id"] == next(x["dept_id"] for x in faculty if x["faculty_id"] == f)
assert max(hours.values()) <= MAX_HOURS
imp_clash = sum(1 for v in imp_day.values() if v > 1)

# ------------------------------------------------------------------ report
dept_students = defaultdict(int)
for st in students: dept_students[st["dept_id"]] += 1
print(f"Current term sem_id={cur}: {len(students)} students -> {len(groups)} class groups -> {len(sections)} sections (was {len(old_secs)})")
print(f"{'dept':5} {'students':>8} {'sections':>8} {'faculty':>7} {'used':>5} {'hrs/wk':>12}")
for d in sorted(pool):
    secs = [i for i, s in enumerate(sections) if s["dept"] == d]
    used = sorted({plan[i][0] for i in secs}); h = [hours[f] for f in pool[d]]
    print(f"{d:5} {dept_students.get(d, 0):>8} {len(secs):>8} {len(pool[d]):>7} {len(used):>5} {min(h):>4}-{max(h):<3}avg {sum(h) / len(h):.1f}")
print(f"Checks passed: no group/faculty/lab clashes, one meeting per subject per day, max {max(hours.values())} h/week per faculty.")
print(f"Days on which two 4-credit subjects of one group meet: {imp_clash} (unavoidable minimum is 1 per group with two 4-credit subjects)")
g0 = 0
print(f"\nSample timetable — {groups[g0]['name']}:")
grid = {(d, x): "" for d in range(5) for x in range(6)}
for i, (f, mtg) in plan.items():
    if sections[i]["group"] != g0: continue
    for d, slots, room, typ in mtg:
        for x in slots: grid[(d, x)] = f"{sections[i]['course']}/{f}"
print("      " + "".join(f"{a}-{b}".ljust(15) for a, b in SLOTS))
for d in range(5): print(f"{DAYS[d]:5} " + "".join(grid[(d, x)].ljust(15) for x in range(6)))

if "--apply" not in sys.argv:
    print("\nDry run only. Re-run with --apply to write it to the database."); sys.exit(0)

# ------------------------------------------------------------------ apply
old_ids = [s["section_id"] for s in old_secs]
old_enr = get_all("enrollment", {"section_id": {"$in": old_ids}})
backup = os.path.join(ROOT, "data", f"backup_term{cur}_{dt.datetime.now():%Y%m%d_%H%M%S}.json")
att = get_all("attendance", {"enroll_id": {"$in": [e["enroll_id"] for e in old_enr]}})
json.dump(dict(sections=old_secs, enrollments=old_enr, attendance=att), open(backup, "w", encoding="utf-8"))
print(f"Backup of the old term written to {backup}")

# enrolment -> attendance and section -> section_meeting cascade, as in the schema
M.delete(ADMIN, "attendance_submission", [["section_id", "in", old_ids]], False)
M.delete(ADMIN, "enrollment", [["section_id", "in", old_ids]], False)
M.delete(ADMIN, "section", [["section_id", "in", old_ids]], False)
M.db.notification.delete_many({"title": {"$regex": "^Attendance below threshold"}})

rows = []
for i, s in enumerate(sections):
    f, mtg = plan[i]; d, slots, room, _ = sorted(mtg)[0]; n = len(groups[s["group"]]["students"])
    rows.append(dict(course_id=s["course"], sem_id=cur, day=DAYS[d], start_time=SLOTS[slots[0]][0], end_time=SLOTS[slots[-1]][1],
                     section_code=s["code"], faculty_id=f, room=room, capacity=CAPACITY, seats=CAPACITY - n))
new = M.insert(ADMIN, "section", rows)
sid = {(r["course_id"], r["section_code"]): r["section_id"] for r in new}
mt = []
for i, s in enumerate(sections):
    for d, slots, room, typ in plan[i][1]:
        mt.append(dict(section_id=sid[(s["course"], s["code"])], day=DAYS[d], start_time=SLOTS[slots[0]][0], end_time=SLOTS[slots[-1]][1], room=room, type=typ))
M.insert(ADMIN, "section_meeting", mt, False)
enr = [dict(student_id=st["student_id"], section_id=sid[(s["course"], s["code"])], enrolled_at=f"{TODAY.year if TODAY.month >= 7 else TODAY.year - 1}-07-25T10:00:00+05:30")
       for s in sections for st in groups[s["group"]]["students"]]
made = M.insert(ADMIN, "enrollment", enr)

# attendance: 8 roll calls per enrolment on real meeting days before today, skipping holidays
hol = {dt.date.fromisoformat(e["start_on"]) + dt.timedelta(days=k) for e in get_all("calendar_event", {"sem_id": cur, "kind": {"$in": ["holiday", "exam"]}})
       for k in range((dt.date.fromisoformat(e["end_on"]) - dt.date.fromisoformat(e["start_on"])).days + 1)}
term_events = get_all("calendar_event", {"sem_id": cur})
start = min((dt.date.fromisoformat(e["start_on"]) for e in term_events), default=TODAY - dt.timedelta(weeks=12))
by_sec = defaultdict(list)
for m in mt: by_sec[m["section_id"]].append(m)
fac_of = {r["section_id"]: r["faculty_id"] for r in new}
rnd = random.Random(7); base = {st["student_id"]: rnd.uniform(.68, .98) for st in students}
dates_of = {}
for sec, ms in by_sec.items():
    cands = []
    d = start
    while d < TODAY:
        for m in ms:
            if d.weekday() < 5 and DAYS[d.weekday()] == m["day"] and d not in hol: cands.append((d, m))
        d += dt.timedelta(days=1)
    dates_of[sec] = [cands[int(k * len(cands) / 8)] for k in range(8)] if len(cands) >= 8 else cands
att_rows, low = [], defaultdict(list)
for e in made:
    pres = tot = 0
    for d, m in dates_of[e["section_id"]]:
        r = rnd.random(); stt = "Present" if r < base[e["student_id"]] else ("Excused" if r < base[e["student_id"]] + .03 else "Absent")
        att_rows.append(dict(enroll_id=e["enroll_id"], faculty_id=fac_of[e["section_id"]], held_on=d.isoformat(), held_at=m["start_time"], type=m["type"], status=stt))
        tot += 1; pres += stt != "Absent"
    if tot and pres / tot < .75: low[e["student_id"]].append((e["section_id"], round(100 * pres / tot)))
M.insert(ADMIN, "attendance", att_rows, False)
title_of = {r["section_id"]: courses[r["course_id"]]["title"] for r in new}
notes = [dict(student_id=s, title="Attendance below threshold — " + title_of[sec], kind="warning",
              body=f"Your attendance is {p}%. Institute minimum is 75% to appear for the end-semester examination.") for s, xs in low.items() for sec, p in xs]
M.insert(ADMIN, "notification", notes, False)
print(f"Applied: {len(new)} sections, {len(mt)} meetings, {len(made)} enrolments, {len(att_rows)} attendance rows, {len(notes)} low-attendance notices.")
