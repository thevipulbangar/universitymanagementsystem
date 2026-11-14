"""Brings the SAMPLE data (synthetic) up to date for the current term:
  - attendance: every timetabled class from the day after the last recorded session up to today or the
    "Last day of instruction" (whichever is earlier), skipping holiday / exam / vacation days of the calendar;
    each student has a steady attendance habit (65–97 %). One attendance_submission per class, like a faculty roll call.
  - lesson progress: lesson-plan topics whose planned date has passed are marked done.
Re-running is safe: it only fills days that have no attendance yet and upserts topic progress.
    python data/seed_recent.py
"""
import datetime as dt, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import mongo_db as M

db, rnd = M.db, random.Random(2026)
cur = max(s["sem_id"] for s in db.semester.find({}, {"sem_id": 1}))
events = list(db.calendar_event.find({"sem_id": cur}))
start = dt.date.fromisoformat(min(e["start_on"] for e in events))
last_day = next((dt.date.fromisoformat(e["start_on"]) for e in events if e["title"].lower().startswith("last day of instruction")), None)
end = min(dt.date.today(), last_day or dt.date.today())
off = set()
for e in events:
    if e["kind"] in ("holiday", "exam", "vacation"):
        d = dt.date.fromisoformat(e["start_on"])
        while d <= dt.date.fromisoformat(e["end_on"]): off.add(d); d += dt.timedelta(days=1)

sections = {s["section_id"]: s for s in db.section.find({"sem_id": cur})}
latest = db.attendance.find_one({}, {"held_on": 1}, sort=[("held_on", -1)])  # whole table: only fill days with no attendance at all
first = (dt.date.fromisoformat(latest["held_on"]) + dt.timedelta(days=1)) if latest else start
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# ---------------- attendance
meet = {}
for m in db.section_meeting.find({"section_id": {"$in": list(sections)}}): meet.setdefault(m["section_id"], []).append(m)
roll = {}
for e in db.enrollment.find({"section_id": {"$in": list(sections)}}, {"enroll_id": 1, "student_id": 1, "section_id": 1}): roll.setdefault(e["section_id"], []).append(e)
habit = {}
rows, subs = [], []
d = first
while d <= end:
    if d not in off and d.weekday() < 6:
        for sid, ms in meet.items():
            for m in ms:
                if m["day"] != DAYS[d.weekday()]: continue
                present = 0
                for e in roll.get(sid, []):
                    p = habit.setdefault(e["student_id"], rnd.uniform(0.65, 0.97))
                    st = "Present" if rnd.random() < p else ("Excused" if rnd.random() < 0.15 else "Absent")
                    present += st != "Absent"
                    rows.append({"enroll_id": e["enroll_id"], "faculty_id": sections[sid]["faculty_id"], "held_on": d.isoformat(), "held_at": m["start_time"], "type": m["type"], "status": st})
                subs.append({"section_id": sid, "faculty_id": sections[sid]["faculty_id"], "held_on": d.isoformat(), "present": present, "total": len(roll.get(sid, [])), "created_at": M.now_iso()})
    d += dt.timedelta(days=1)
for r, i in zip(rows, M.next_ids("attendance", len(rows))): r["id"] = i
for r, i in zip(subs, M.next_ids("attendance_submission", len(subs))): r["id"] = i
if rows:
    try: db.attendance.insert_many(rows, ordered=True)
    except Exception:  # never leave a half-filled period behind
        db.attendance.delete_many({"id": {"$in": [r["id"] for r in rows]}}); raise
if subs: db.attendance_submission.insert_many(subs, ordered=False)
print(f"attendance {first} .. {end}: {len(rows)} rows, {len(subs)} classes")

# ---------------- lesson progress: topics planned on or before the last teaching day are done,
# except that ~40% of courses run 1-3 topics behind schedule (their last planned topics are still open)
year = start.year
n = done = 0
for p in db.lesson_plan.find({}, {"_id": 0}):
    topics = []
    for mo in p["modules"]:
        for t in mo["topics"]:
            try: when = dt.datetime.strptime(f"{t[1]} {year}", "%d %b %Y").date()
            except (ValueError, IndexError): continue
            topics.append((when, mo["n"], t[0]))
    due = sorted(x for x in topics if x[0] <= end)
    lag = rnd.choices([0, 1, 2, 3], weights=[60, 20, 12, 8])[0]
    finished = set(due[:len(due) - lag])
    for when, mod, topic in topics:
        ok = (when, mod, topic) in finished
        db.lesson_progress.update_one({"course_id": p["course_id"], "module_n": mod, "topic": topic},
                                      {"$set": {"done": ok, "updated_at": M.now_iso()}}, upsert=True)
        n += 1; done += ok
print(f"lesson progress: {n} topics, {done} done")
