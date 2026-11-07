"""Seeds SAMPLE feedback (synthetic, like the rest of the dataset) for every month of the current term up to today.
The current month: ~40% of students have rated their faculty (the rest can fill the form themselves).
Earlier months: ~20% of students (those forms are closed). Re-running replaces the feedback of those months.
    python data/seed_feedback.py [current_share]
"""
import datetime as dt, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import mongo_db as M

share_now = float(sys.argv[1]) if len(sys.argv) > 1 else 0.4
share_past = 0.2
rnd = random.Random(2026)
db = M.db
M.ensure_feedback_form()

cur = max(s["sem_id"] for s in db.semester.find({}, {"sem_id": 1}))
start = min(e["start_on"] for e in db.calendar_event.find({"sem_id": cur}))          # '2026-07-20'
y, mo = int(start[:4]), int(start[5:7])
months = []
while (y, mo) <= (dt.date.today().year, dt.date.today().month):
    months.append(f"{y}-{mo:02d}"); y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
for m in months:
    if not db.feedback_form.find_one({"month": m}): db.feedback_form.insert_one({"month": m, "created_at": M.now_iso()})
db.feedback_submission.delete_many({"month": {"$in": months}}); db.feedback_response.delete_many({"month": {"$in": months}})

sections = {s["section_id"]: s for s in db.section.find({"sem_id": cur})}
qids = sorted(q["id"] for q in db.feedback_question.find({}, {"id": 1}))
# each faculty has a general quality (3.0-4.8) and each question a small personal offset, so results differ between people
quality = {f["faculty_id"]: rnd.uniform(3.0, 4.8) for f in db.faculty.find({}, {"faculty_id": 1})}
bias = {(f, q): rnd.uniform(-0.5, 0.5) for f in quality for q in qids}
enrol = {}
for e in db.enrollment.find({"section_id": {"$in": list(sections)}}, {"student_id": 1, "section_id": 1}):
    enrol.setdefault(e["student_id"], []).append(e["section_id"])

for m in months:
    share = share_now if m == months[-1] else share_past
    subs, resp = [], []
    for sid, secs in enrol.items():
        if rnd.random() > share: continue
        for sec_id in secs:
            s = sections[sec_id]
            subs.append({"month": m, "student_id": sid, "section_id": sec_id, "created_at": M.now_iso()})
            for q in qids:
                r = round(min(5, max(1, rnd.gauss(quality[s["faculty_id"]] + bias[(s["faculty_id"], q)], 0.8))))
                resp.append({"month": m, "section_id": sec_id, "faculty_id": s["faculty_id"], "question_id": q, "rating": r})
    for d, i in zip(subs, M.next_ids("feedback_submission", len(subs))): d["id"] = i
    for d, i in zip(resp, M.next_ids("feedback_response", len(resp))): d["id"] = i
    if subs: db.feedback_submission.insert_many(subs)
    if resp: db.feedback_response.insert_many(resp, ordered=False)
    print(f"{m}: {len(subs)} submissions, {len(resp)} ratings")
