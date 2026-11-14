"""MongoDB backend for the VIT portal (database `vit_portal`).

The relational design in supabase/schema.sql (+ the admin table in supabase/admin.sql) stays the single source of
truth: it is parsed at start-up and MongoDB is made to honour it -
  * one collection per table, same field names;
  * primary keys and UNIQUE constraints -> unique indexes; identity columns -> counters collection;
  * NOT NULL (without default) -> required fields; DEFAULTs applied on insert;
  * foreign keys checked on insert/update; ON DELETE CASCADE / SET NULL / restrict applied on delete;
  * the row-level-security policies -> rule checks in `scope()` / `check_write()`;
  * views `transcript` and `sgpa` and the functions register/drop/swap_section, admin_set_login -> Python below.
CHECK constraints are not enforced (the app's own logic keeps those values in range).
"""
import datetime as dt, hashlib, hmac, os, re, secrets, threading, time, uuid
import pymongo
from pymongo.errors import DuplicateKeyError

ROOT = os.path.dirname(os.path.abspath(__file__))
MONGO_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
db = client["vit_portal"]
MAX_ROWS = 5000  # per request; clients page with range()


class DbError(Exception):
    def __init__(self, message, code="P0001", status=400, details=None):
        super().__init__(message); self.message, self.code, self.status, self.details = message, code, status, details
    def json(self): return {"message": self.message, "code": self.code, "details": self.details, "hint": None}


def now_iso(): return dt.datetime.now(dt.timezone.utc).isoformat()
def today(): return dt.date.today().isoformat()


# ---------------------------------------------------------------------------------------------- schema model
def parse_schema():
    src = "\n".join(open(os.path.join(ROOT, "supabase", f), encoding="utf-8").read() for f in ("schema.sql", "admin.sql"))
    tables = {}
    for name, body in re.findall(r"create table (?:if not exists )?(\w+) \((.*?)\n\);", src, re.S):
        t = tables[name] = dict(cols={}, pk=[], unique=[], required=[], defaults={}, identity=None, fks={}, times=[])
        for raw in body.split("\n"):
            line = raw.split("--")[0].strip().rstrip(",")
            if not line: continue
            m = re.match(r"(primary key|unique(?: nulls not distinct)?)\s*\(([^)]*)\)", line)
            if m:
                cols = [c.strip() for c in m.group(2).split(",")]
                (t.__setitem__("pk", cols) if m.group(1) == "primary key" else t["unique"].append(cols)); continue
            if line.startswith("check"): continue
            col, typ = line.split()[:2]
            t["cols"][col] = typ
            if typ == "time": t["times"].append(col)
            if "primary key" in line: t["pk"] = [col]
            if re.search(r"\bunique\b", line): t["unique"].append([col])
            if "generated always as identity" in line: t["identity"] = col
            d = re.search(r"default (now\(\)|'[^']*'|-?\d+|true|false)", line)
            if d:
                v = d.group(1)
                t["defaults"][col] = ("now" if v == "now()" else [] if v == "'{}'" else v.strip("'") if v.startswith("'")
                                      else True if v == "true" else False if v == "false" else int(v))
            r = re.search(r"references\s+([\w.]+)(?:\s+on delete\s+(cascade|set null))?", line)
            if r: t["fks"][col] = ("users" if r.group(1) == "auth.users" else r.group(1), r.group(2) or "restrict")
            if ("not null" in line or "primary key" in line) and col not in t["defaults"] and t["identity"] != col:
                t["required"].append(col)
    tables.pop("pending_login", None)  # Supabase-only (login invitations); not needed with our own auth
    for t in tables.values():  # composite-PK members are NOT NULL too
        t["required"] += [c for c in t["pk"] if c not in t["required"] and c not in t["defaults"] and c != t["identity"]]
    return tables

TABLES = parse_schema()
VIEWS = ("transcript", "sgpa")
CHILDREN = {}  # parent table -> [(child table, child column, on delete)]
for _name, _t in TABLES.items():
    for _col, (_parent, _action) in _t["fks"].items():
        CHILDREN.setdefault(_parent, []).append((_name, _col, _action))

def pk_of(table): return TABLES[table]["pk"][0] if table in TABLES else "_id"


def ensure_indexes():
    for name, t in TABLES.items():
        c = db[name]
        c.create_index([(k, 1) for k in t["pk"]], unique=True, name="pk")
        for cols in t["unique"]:
            if cols == t["pk"]: continue
            nullable = [k for k in cols if k not in t["required"] and k not in t["defaults"]]
            opts = {"partialFilterExpression": {k: {"$type": "string"} for k in nullable}} if nullable else {}  # NULLs never collide (user_id, receipt)
            c.create_index([(k, 1) for k in cols], unique=True, name="uq_" + "_".join(cols), **opts)
        for col in t["fks"]:
            c.create_index([(col, 1)], name="fk_" + col)
    db.users.create_index("email", unique=True)
    db.sessions.create_index("expires", expireAfterSeconds=0)
    db.notification.create_index([("student_id", 1), ("created_at", -1)])
    db.activity_log.create_index([("at", -1)])


# ---------------------------------------------------------------------------------------------- student year
YEARS = ["FY", "SY", "TY", "LY"]

def sync_years():
    """Year of study follows the academic calendar: the batch admitted in the current academic year is FY, the one
    before SY, then TY, LY; older batches are 'Graduated'. The current academic year is that of the latest semester
    (highest sem_id), so everyone moves up when the admin adds the new year's semester. current_sem (odd/even term)
    and the year prefix of the roll number follow. Stored (not computed on read) so every query and tool sees it."""
    cur = db.semester.find_one({}, sort=[("sem_id", -1)])
    if not cur or not re.match(r"\d{4}", cur.get("year") or ""): return 0
    start, odd = int(cur["year"][:4]), cur["term_name"].lower().startswith("odd")
    n = {"$subtract": [start + 1, "$admit_year"]}  # 1 = admitted this academic year
    in_range = {"$and": [{"$gte": [n, 1]}, {"$lte": [n, 4]}]}
    code = {"$switch": {"branches": [{"case": {"$eq": [n, i + 1]}, "then": y} for i, y in enumerate(YEARS)],
                        "default": {"$cond": [{"$gt": [n, 4]}, "Graduated", "FY"]}}}
    return db.student.update_many({"admit_year": {"$type": "number"}}, [{"$set": {
        "year": code,
        "current_sem": {"$cond": [in_range, {"$subtract": [{"$multiply": [n, 2]}, 1 if odd else 0]}, "$current_sem"]},
        "roll": {"$cond": [{"$and": [in_range, {"$in": [{"$substrCP": [{"$ifNull": ["$roll", ""]}, 0, 2]}, YEARS]}]},
                           {"$concat": [code, {"$substrCP": ["$roll", 2, 100]}]}, "$roll"]}}}]).modified_count

def _after_write(table):
    if table in ("semester", "student"): sync_years()


# ---------------------------------------------------------------------------------------------- auth
def hash_pw(pw, salt=None):
    salt = salt or secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "scrypt$" + salt.hex() + "$" + h.hex()

def check_pw(pw, stored):
    try:
        _, salt, h = stored.split("$")
        return hmac.compare_digest(hash_pw(pw, bytes.fromhex(salt)).split("$")[2], h)
    except Exception:
        return False

def account_type(uid):
    if db.admin.find_one({"user_id": uid}, {"_id": 1}): return "admin"
    if db.faculty.find_one({"user_id": uid}, {"_id": 1}): return "faculty"
    if db.student.find_one({"user_id": uid}, {"_id": 1}): return "student"
    return None

def login(email, password, role):
    """role = the portal being signed in to: 'student', 'faculty' or 'admin'. An account may only use its own portal."""
    u = db.users.find_one({"email": (email or "").strip().lower()})
    if not u or not check_pw(password or "", u["pw"]):
        raise DbError("Invalid login credentials", "invalid_credentials", 400)
    if u.get("disabled"): raise DbError("This account has been disabled. Contact the administrator.", "account_disabled", 403)
    kind = account_type(u["_id"])
    if role not in ("student", "faculty", "admin"): raise DbError("Choose the student, faculty or admin sign-in page.", "wrong_portal", 403)
    if kind != role:
        raise DbError({"admin": "This is an administrator account. Use the admin sign-in page.",
                       "faculty": "This is a faculty account. Use the faculty sign-in page.",
                       "student": "This is a student account. Use the student sign-in page."}.get(kind, "This account is not linked to a student or faculty record."),
                      "wrong_portal", 403)
    token = secrets.token_urlsafe(32)
    db.sessions.insert_one({"_id": token, "uid": u["_id"], "email": u["email"],
                            "expires": dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)})
    return {"access_token": token, "user": {"id": u["_id"], "email": u["email"]}}

def logout(token): db.sessions.delete_one({"_id": token})

_ctx_cache, _ctx_lock = {}, threading.Lock()
def context(token):
    """Session token -> {uid, email, admin, faculty_id, student_id}, or None. Cached briefly (role lookups per request)."""
    if not token: return None
    with _ctx_lock:
        hit = _ctx_cache.get(token)
        if hit and time.time() - hit[1] < 30: return hit[0]
    s = db.sessions.find_one({"_id": token})
    if not s or s["expires"].replace(tzinfo=dt.timezone.utc) < dt.datetime.now(dt.timezone.utc): return None
    uid = s["uid"]
    ctx = {"uid": uid, "email": s["email"], "admin": db.admin.find_one({"user_id": uid}, {"_id": 0}),
           "faculty_id": (db.faculty.find_one({"user_id": uid}, {"faculty_id": 1}) or {}).get("faculty_id"),
           "student_id": (db.student.find_one({"user_id": uid}, {"student_id": 1}) or {}).get("student_id")}
    with _ctx_lock: _ctx_cache[token] = (ctx, time.time())
    return ctx

COMPONENTS = {"CVV": 12.5, "MSE": 25, "ESE": 50, "ASSIGN": 12.5}  # total 100

def save_marks(ctx, p_section, p_component, p_marks):
    """Faculty enter one component's marks for their own current-term section. p_marks = {prn: int | None (clears)}."""
    fac = ctx["faculty_id"]
    if not fac: raise DbError("Only faculty can enter marks.", "42501", 403)
    if p_component not in COMPONENTS: raise DbError("Unknown assessment component.", "22023")
    sec = db.section.find_one({"section_id": p_section})
    cur = max(s["sem_id"] for s in db.semester.find({}, {"sem_id": 1}))
    if not sec or sec["faculty_id"] != fac or sec["sem_id"] != cur: raise DbError("You can enter marks only for your own sections this term.", "42501", 403)
    if db.marks_submission.find_one({"section_id": p_section}): raise DbError("Final marks for this section are already submitted and locked.", "42501", 403)
    top = COMPONENTS[p_component]; saved = 0
    for prn, v in (p_marks or {}).items():
        e = db.enrollment.find_one({"student_id": prn, "section_id": p_section}, {"enroll_id": 1})
        if not e: raise DbError(f"{prn} is not enrolled in this section.", "23503")
        key = {"enroll_id": e["enroll_id"], "component": p_component}
        if v is None or v == "": db.assessment.delete_one(key); continue
        try: v = float(v)
        except (TypeError, ValueError): raise DbError(f"Marks for {prn} must be a number.", "22P02")
        if v * 2 != int(v * 2): raise DbError(f"Marks for {prn} must be whole or half marks (e.g. 9.5).", "22P02")
        v = int(v) if v == int(v) else v
        if not 0 <= v <= top: raise DbError(f"Marks for {prn} must be between 0 and {top}.", "23514")
        if db.assessment.find_one(key): db.assessment.update_one(key, {"$set": {"marks": v, "updated_at": now_iso()}})
        else: db.assessment.insert_one(dict(key, id=next_ids("assessment", 1)[0], marks=v, max_marks=top, updated_at=now_iso()))
        saved += 1
    return {"saved": saved}

def submit_marks(ctx, p_section):
    """Faculty lock their section's marks once every enrolled student has all components."""
    fac = ctx["faculty_id"]
    sec = db.section.find_one({"section_id": p_section})
    cur = max(s["sem_id"] for s in db.semester.find({}, {"sem_id": 1}))
    if not fac or not sec or sec["faculty_id"] != fac or sec["sem_id"] != cur: raise DbError("You can submit marks only for your own sections this term.", "42501", 403)
    if db.marks_submission.find_one({"section_id": p_section}): raise DbError("Marks for this section are already submitted.", "23505", 409)
    ens = db.enrollment.distinct("enroll_id", {"section_id": p_section})
    missing = len(ens) * len(COMPONENTS) - db.assessment.count_documents({"enroll_id": {"$in": ens}})
    if not ens or missing: raise DbError(f"{missing} marks are still missing. Enter every component for every student first.", "23514")
    db.marks_submission.insert_one({"section_id": p_section, "faculty_id": fac, "submitted_at": now_iso()})
    return {"submitted": True}

def grades_status(ctx):
    """Faculty: how many of this term's sections have submitted final marks, and the release date."""
    if not ctx["faculty_id"] and not ctx["admin"]: raise DbError("Faculty only.", "42501", 403)
    sem = db.semester.find_one(sort=[("sem_id", -1)])
    secs = [s for s in db.section.find({"sem_id": sem["sem_id"]}, {"section_id": 1, "course_id": 1, "section_code": 1, "faculty_id": 1})
            if db.enrollment.find_one({"section_id": s["section_id"]}, {"_id": 1})]
    done = set(db.marks_submission.distinct("section_id", {"section_id": {"$in": [s["section_id"] for s in secs]}}))
    names = {f["faculty_id"]: f["name"] for f in db.faculty.find({}, {"faculty_id": 1, "name": 1})}
    pending = [f"{s['course_id']} {s.get('section_code', '')} · {names.get(s['faculty_id'], s['faculty_id'])}" for s in secs if s["section_id"] not in done]
    return {"total": len(secs), "submitted": len(done), "pending": pending[:30], "release": sem.get("grades_release")}

def set_grades_release(ctx, p_date, p_force=False):
    if not (ctx["admin"] or hod_dept(ctx)): raise DbError("Only a Head of Department can schedule the grade sheet release.", "42501", 403)
    try: d = dt.date.fromisoformat(p_date or "")
    except ValueError: raise DbError("Pick a release date.", "22007")
    if d < dt.date.today(): raise DbError("The release date cannot be in the past.", "23514")
    st = grades_status(ctx)
    if st["submitted"] < st["total"] and not (ctx["admin"] and p_force): raise DbError(f"{st['total'] - st['submitted']} sections have not submitted final marks yet.", "23514")
    sem = db.semester.find_one(sort=[("sem_id", -1)])
    db.semester.update_one({"sem_id": sem["sem_id"]}, {"$set": {"grades_release": d.isoformat()}})
    db.notification.insert_one({"id": next_ids("notification", 1)[0], "student_id": None, "kind": "academic", "read": False, "created_at": now_iso(),
                                "title": f"Grade sheet for {sem['term_name']}: {d:%d %b %Y}", "body": "Your grades appear under Examination from this date."})
    return {"release": d.isoformat()}

def class_marksheets(ctx, p_publish=False):
    """Class teacher (mentor): each mentee's marks progress this term. p_publish issues a marksheet
    (a certificate row, ref_code MS-<sem_id>) to every mentee whose marks are all entered."""
    fac = ctx["faculty_id"]
    if not fac: raise DbError("Only a class teacher can generate marksheets.", "42501", 403)
    sem = db.semester.find_one(sort=[("sem_id", -1)])
    secs = set(db.section.distinct("section_id", {"sem_id": sem["sem_id"]}))
    me = db.faculty.find_one({"faculty_id": fac}, {"name": 1})["name"]
    ref, out = f"MS-{sem['sem_id']}", []
    for s in db.student.find({"mentor_id": fac}, {"student_id": 1, "name": 1, "roll": 1}).sort("roll"):
        ens = [e["enroll_id"] for e in db.enrollment.find({"student_id": s["student_id"]}, {"enroll_id": 1, "section_id": 1}) if e["section_id"] in secs]
        marks = list(db.assessment.find({"enroll_id": {"$in": ens}}, {"marks": 1, "max_marks": 1}))
        need, total, top = len(ens) * len(COMPONENTS), sum(a["marks"] for a in marks), sum(a["max_marks"] for a in marks)
        ready = bool(ens) and len(marks) == need
        if p_publish and ready:
            row = {"title": f"Mark Sheet · {sem['term_name']}", "issuer": f"Class teacher · {me}", "issued_on": today(),
                   "hours": None, "verified": True, "grade": f"{total} / {top}"}
            if not db.certificate.update_one({"student_id": s["student_id"], "ref_code": ref}, {"$set": row}).matched_count:
                db.certificate.insert_one(dict(row, id=next_ids("certificate", 1)[0], student_id=s["student_id"], ref_code=ref))
        out.append({"prn": s["student_id"], "name": s["name"], "roll": s.get("roll", ""), "entered": len(marks), "needed": need,
                    "ready": ready, "published": bool(db.certificate.find_one({"student_id": s["student_id"], "ref_code": ref}, {"_id": 1}))})
    return out

def faculty_overview(ctx):
    """Admin: every faculty member with this term's load, marks status, last roll call, HoD and sign-in status."""
    if not ctx["admin"]: raise DbError("Admins only.", "42501", 403)
    sem = db.semester.find_one(sort=[("sem_id", -1)])
    secs = list(db.section.find({"sem_id": sem["sem_id"]}, {"section_id": 1, "faculty_id": 1}))
    done = set(db.marks_submission.distinct("section_id"))
    last = {r["_id"]: r["d"] for r in db.attendance_submission.aggregate([{"$group": {"_id": "$faculty_id", "d": {"$max": "$held_on"}}}])}
    hods = {d["hod_name"]: d["dept_id"] for d in db.department.find({}, {"hod_name": 1, "dept_id": 1}) if d.get("hod_name")}
    users = {u["_id"]: u for u in db.users.find({}, {"disabled": 1})}
    out = []
    for f in db.faculty.find({}, {"_id": 0}).sort("faculty_id"):
        mine = [s["section_id"] for s in secs if s["faculty_id"] == f["faculty_id"]]
        u = users.get(f.get("user_id"))
        out.append({"id": f["faculty_id"], "name": f["name"], "dept": f.get("dept_id"), "desig": f.get("designation", ""), "email": f.get("email", ""),
                    "sections": len(mine), "submitted": sum(1 for s in mine if s in done), "lastAttendance": last.get(f["faculty_id"]),
                    "hod": f["name"] in hods, "login": "none" if not u else "disabled" if u.get("disabled") else "active"})
    return out

def admin_faculty(ctx, p_faculty, p_action, p_password=None):
    """Admin actions on one faculty member: password | make_hod | disable | enable."""
    if not ctx["admin"]: raise DbError("Admins only.", "42501", 403)
    f = db.faculty.find_one({"faculty_id": p_faculty})
    if not f: raise DbError("No such faculty member.", "23503", 404)
    if p_action == "password":
        set_login(f["email"], p_password); return {"ok": True}
    if p_action == "make_hod":
        db.department.update_one({"dept_id": f["dept_id"]}, {"$set": {"hod_name": f["name"]}}); return {"ok": True}
    if p_action in ("disable", "enable"):
        if not f.get("user_id"): raise DbError("This faculty member has no sign-in yet. Set a password first.", "23514")
        db.users.update_one({"_id": f["user_id"]}, {"$set": {"disabled": p_action == "disable"}})
        if p_action == "disable": db.sessions.delete_many({"uid": f["user_id"]})  # signs them out now
        with _ctx_lock: _ctx_cache.clear()
        return {"ok": True}
    raise DbError("Unknown action.", "22023")

def fees_pending(stu, year):
    """Semester fee heads still unpaid for that academic year (examination fees are due later and don't block registration)."""
    return [f["head"] for f in db.fee.find({"student_id": stu, "year": year, "status": "PENDING"}, {"head": 1}) if not f["head"].startswith("Examination")]

def confirm_registration(ctx):
    stu = ctx["student_id"]
    if not stu: raise DbError("Only students confirm their registration.", "42501", 403)
    sem = db.semester.find_one(sort=[("sem_id", -1)]); t = today()
    if not (sem.get("reg_opens") and sem["reg_opens"] <= t <= sem.get("reg_closes", "")): raise DbError("The registration window is closed.", "42501", 403)
    due = fees_pending(stu, sem["year"])
    if due: raise DbError("Pay your semester fees first: " + ", ".join(due) + ".", "23514", 402)
    secs = db.section.distinct("section_id", {"sem_id": sem["sem_id"]})
    if not db.enrollment.find_one({"student_id": stu, "section_id": {"$in": secs}}, {"_id": 1}): raise DbError("No subjects have been assigned to you yet. Contact your department.", "23514")
    if db.reg_confirmation.find_one({"student_id": stu, "sem_id": sem["sem_id"]}): raise DbError("Your registration is already confirmed.", "23505", 409)
    row = {"student_id": stu, "sem_id": sem["sem_id"], "confirmed_at": now_iso()}
    db.reg_confirmation.insert_one(dict(row)); return row

def hod_dept(ctx):
    """dept_id the signed-in faculty member heads (department.hod_name = their name), else None."""
    if not ctx or not ctx.get("faculty_id"): return None
    f = db.faculty.find_one({"faculty_id": ctx["faculty_id"]}, {"name": 1})
    d = f and db.department.find_one({"hod_name": f["name"]}, {"dept_id": 1})
    return d["dept_id"] if d else None

def set_reg_window(ctx, p_opens, p_closes):
    if not (ctx["admin"] or hod_dept(ctx)): raise DbError("Only a Head of Department can change the registration window.", "42501", 403)
    try: a, b = dt.date.fromisoformat(p_opens or ""), dt.date.fromisoformat(p_closes or "")
    except ValueError: raise DbError("Pick both an opening and a closing date.", "22007")
    if b < a: raise DbError("The closing date must be on or after the opening date.", "23514")
    cur = max(s["sem_id"] for s in db.semester.find({}, {"sem_id": 1}))
    db.semester.update_one({"sem_id": cur}, {"$set": {"reg_opens": a.isoformat(), "reg_closes": b.isoformat()}})
    nid = next_ids("notification", 1)[0]
    db.notification.insert_one({"id": nid, "student_id": None, "kind": "registration", "read": False, "created_at": now_iso(),
                                "title": f"Subject registration: {a:%d %b} – {b:%d %b %Y}",
                                "body": "Add, drop or swap sections under Subject Registration while the window is open."})
    return {"reg_opens": a.isoformat(), "reg_closes": b.isoformat()}

def change_password(ctx, p_old, p_new):
    u = db.users.find_one({"_id": ctx["uid"]})
    if not u or not check_pw(p_old or "", u["pw"]): raise DbError("Your current password is not correct.", "invalid_credentials", 400)
    new = p_new or ""
    if len(new) < 8: raise DbError("The new password must be at least 8 characters.", "23514")
    if new.strip().lower() == u["email"].lower(): raise DbError("The new password cannot be your email address.", "23514")
    if new == p_old: raise DbError("The new password must be different from the current one.", "23514")
    db.users.update_one({"_id": u["_id"]}, {"$set": {"pw": hash_pw(new)}})
    return {"ok": True}

def set_login(email, password):
    """Creates or resets a login and links it to the student / faculty / admin record with that email."""
    em = (email or "").strip().lower()
    if len(password or "") < 6: raise DbError("password must be at least 6 characters")
    rx = {"email": re.compile("^" + re.escape(em) + "$", re.I)}
    if not any(db[t].find_one(rx, {"_id": 1}) for t in ("student", "faculty", "admin")):
        raise DbError(f"no student, faculty or admin record has the email {em}")
    u = db.users.find_one({"email": em})
    uid = u["_id"] if u else str(uuid.uuid4())
    db.users.update_one({"_id": uid}, {"$set": {"email": em, "pw": hash_pw(password)}}, upsert=True)
    db.sessions.delete_many({"uid": uid})  # a reset password signs out old sessions
    for t in ("student", "faculty", "admin"): db[t].update_many(rx, {"$set": {"user_id": uid}})
    with _ctx_lock: _ctx_cache.clear()
    return uid


# ---------------------------------------------------------------------------------------------- row-level rules
PUBLIC_READ = {"department", "program", "faculty", "course", "prerequisite", "requirement_category", "program_requirement",
               "semester", "section", "section_meeting", "lesson_plan", "lesson_progress", "calendar_event", "exam_paper",
               "career_path", "ppo_event", "feedback_question", "feedback_form"}
OWN_OR_FACULTY = {"reg_confirmation", "student", "enrollment", "fee", "certificate", "hostel_allotment", "hall_ticket", "transcript", "sgpa"}
NO = {"_id": {"$exists": False}}  # matches nothing

def my_enroll_ids(ctx): return [e["enroll_id"] for e in db.enrollment.find({"student_id": ctx["student_id"]}, {"enroll_id": 1})]

def my_courses(ctx): return db.section.distinct("course_id", {"faculty_id": ctx["faculty_id"]})

def scope(ctx, table, op):
    """Extra Mongo filter limiting which rows `ctx` may touch with op (select/update/delete); DbError if none at all."""
    if ctx is None: raise DbError("Not signed in.", "PGRST301", 401)
    if ctx["admin"]: return {}
    fac, stu = ctx["faculty_id"], ctx["student_id"]
    if op == "select":
        if table in PUBLIC_READ: return {}
        if table in OWN_OR_FACULTY: return {} if fac else {"student_id": stu} if stu else NO
        if table == "attendance": return {} if fac else {"enroll_id": {"$in": my_enroll_ids(ctx)}} if stu else NO
        if table == "attendance_submission": return {} if fac else NO
        if table == "notification": return {"$or": [{"student_id": stu}, {"student_id": None}]} if stu else {"student_id": None}
        if table == "admin": return {"user_id": ctx["uid"]}
        if table == "marks_submission": return {} if fac else NO
        if table == "assessment":
            if fac: return {"enroll_id": {"$in": [e["enroll_id"] for e in db.enrollment.find({"section_id": {"$in": db.section.distinct("section_id", {"faculty_id": fac})}}, {"enroll_id": 1})]}}
            return {"enroll_id": {"$in": my_enroll_ids(ctx)}} if stu else NO
        if table == "feedback_submission": return {} if fac else {"student_id": stu} if stu else NO
        if table == "feedback_response": return {"faculty_id": fac} if fac else NO
        if table == "ppo_application": return {"student_id": stu} if stu else NO
        if table == "request": return {"course_id": {"$in": my_courses(ctx)}} if fac else {"student_id": stu} if stu else NO
    elif table == "fee" and op == "update" and stu: return {"student_id": stu, "status": "PENDING"}
    elif table == "request" and op == "update" and fac: return {"course_id": {"$in": my_courses(ctx)}}
    elif table == "lesson_progress" and fac: return {}
    elif table == "notification" and op == "update" and stu: return {"student_id": stu}
    raise DbError(f'permission denied for table {table}', "42501", 403)

def _mins(t):
    h, m = str(t or "0:0").split(":")[:2]; return int(h) * 60 + int(m)

def attendance_clash(rows):
    """Reject a roll call if any of these students already has attendance on that date within the same hour
    (a class is one period), whoever marked it."""
    if not rows: return
    day, at = rows[0].get("held_on"), _mins(rows[0].get("held_at"))
    try: sunday = dt.date.fromisoformat(day or "").weekday() == 6
    except ValueError: raise DbError("Pick a valid date.", "22007")
    if sunday: raise DbError("Attendance cannot be marked for a Sunday.", "23514", 400)
    if not 8 * 60 <= at <= 18 * 60: raise DbError("Attendance can only be marked for sessions between 08:00 and 18:00.", "23514", 400)
    prns = db.enrollment.distinct("student_id", {"enroll_id": {"$in": [r.get("enroll_id") for r in rows]}})
    ens = {e["enroll_id"]: e["section_id"] for e in db.enrollment.find({"student_id": {"$in": prns}}, {"enroll_id": 1, "section_id": 1})}
    for a in db.attendance.find({"enroll_id": {"$in": list(ens)}, "held_on": day}, {"held_at": 1, "faculty_id": 1, "enroll_id": 1}):
        if abs(_mins(a["held_at"]) - at) < 60:
            f = db.faculty.find_one({"faculty_id": a["faculty_id"]}, {"name": 1}) or {}
            c = (db.section.find_one({"section_id": ens[a["enroll_id"]]}, {"course_id": 1}) or {}).get("course_id", "")
            raise DbError(f"Attendance is already marked for these students on {day} at {str(a['held_at'])[:5]} "
                          f"({c}, by {f.get('name', a['faculty_id'])}). Pick a different time.", "23505", 409)

def check_write(ctx, table, op, rows=None, changes=None):
    if ctx is None: raise DbError("Not signed in.", "PGRST301", 401)
    if ctx["admin"]: return
    fac = ctx["faculty_id"]
    if table == "lesson_progress" and fac: return
    if op == "insert" and table == "notification" and fac: return
    if op == "insert" and table == "attendance_submission" and fac and all(r.get("faculty_id") == fac for r in rows): return
    if op == "insert" and table == "attendance" and fac and all(r.get("faculty_id") == fac for r in rows):
        mine = {s["section_id"] for s in db.section.find({"faculty_id": fac}, {"section_id": 1})}
        ok = {e["enroll_id"] for e in db.enrollment.find({"enroll_id": {"$in": [r.get("enroll_id") for r in rows]}, "section_id": {"$in": list(mine)}}, {"enroll_id": 1})}
        if all(r.get("enroll_id") in ok for r in rows):
            attendance_clash(rows); return
    stu = ctx["student_id"]
    if op == "insert" and table in ("ppo_application", "request") and stu and all(r.get("student_id") == stu for r in rows): return
    if op == "update" and table == "fee" and stu and set(changes) <= {"status", "paid_on", "receipt", "mode"} and changes.get("status") == "PAID": return
    if op == "update" and table == "request" and fac and set(changes) <= {"status"}: return
    if op == "update" and table == "notification" and ctx["student_id"] and set(changes) <= {"read"}: return
    raise DbError(f'new row violates row-level security policy for table "{table}"', "42501", 403)


# ---------------------------------------------------------------------------------------------- generic CRUD
def to_query(filters):
    q = {}
    for col, op, val in filters or []:
        if op == "eq": q.setdefault("$and", []).append({col: val})
        elif op == "in": q.setdefault("$and", []).append({col: {"$in": list(val)}})
        elif op == "neq": q.setdefault("$and", []).append({col: {"$ne": val}})
        else: raise DbError(f"unsupported filter {op}")
    return q

def both(a, b):
    return a if not b else b if not a else {"$and": [a, b]}

def norm_time(v):
    return v + ":00" if isinstance(v, str) and re.fullmatch(r"\d\d:\d\d", v) else v

def clean(table, values, insert):
    t = TABLES[table]; out = {}
    for k, v in values.items():
        if k not in t["cols"]: raise DbError(f"column {k} of table {table} does not exist", "PGRST204")
        if k == t["identity"] and insert: raise DbError(f'cannot insert a non-DEFAULT value into column "{k}"', "428C9")
        out[k] = norm_time(v) if k in t["times"] else v
    if insert:
        for k, d in t["defaults"].items():
            if out.get(k) is None: out[k] = now_iso() if d == "now" else list(d) if isinstance(d, list) else d
        miss = [k for k in t["required"] if out.get(k) is None]
        if miss: raise DbError(f'null value in column "{miss[0]}" of relation "{table}" violates not-null constraint', "23502")
    else:
        bad = [k for k in out if out[k] is None and (k in t["required"] or k in t["defaults"])]
        if bad: raise DbError(f'null value in column "{bad[0]}" of relation "{table}" violates not-null constraint', "23502")
    return out

def check_fks(table, rows):
    for col, (parent, _) in TABLES[table]["fks"].items():
        vals = {r[col] for r in rows if r.get(col) is not None}
        if not vals: continue
        key = "_id" if parent == "users" else pk_of(parent)
        found = {d[key] for d in db[parent].find({key: {"$in": list(vals)}}, {key: 1})}
        missing = vals - found
        if missing:
            raise DbError(f'insert or update on table "{table}" violates foreign key constraint on column "{col}"', "23503",
                          details=f'Key ({col})=({sorted(missing, key=str)[0]}) is not present in table "{parent}".')

def next_ids(table, n):
    seq = db.counters.find_one_and_update({"_id": table}, {"$inc": {"seq": n}}, upsert=True, return_document=pymongo.ReturnDocument.AFTER)["seq"]
    return list(range(seq - n + 1, seq + 1))

def dup_error(e):
    return DbError("duplicate key value violates unique constraint", "23505", 409, details=str(e.details.get("keyValue") if getattr(e, "details", None) else e)[:200])

def select(ctx, table, filters=None, order=None, rng=None, count=False, head=False):
    if table in VIEWS: return view_select(ctx, table, filters, order, rng, count, head)
    if table not in TABLES: raise DbError(f'relation "{table}" does not exist', "42P01", 404)
    q = both(to_query(filters), scope(ctx, table, "select"))
    total = db[table].count_documents(q) if count else None
    if head: return [], total
    cur = db[table].find(q, {"_id": 0})
    if order: cur = cur.sort([(c, 1 if asc else -1) for c, asc in order])
    a, b = rng if rng else (0, MAX_ROWS - 1)
    cur = cur.skip(a).limit(min(b - a + 1, MAX_ROWS))
    return list(cur), total

def insert(ctx, table, rows, returning=True):
    if table not in TABLES: raise DbError(f'relation "{table}" does not exist', "42P01", 404)
    rows = rows if isinstance(rows, list) else [rows]
    if not rows: return []
    check_write(ctx, table, "insert", rows=rows)
    docs = [clean(table, r, True) for r in rows]
    check_fks(table, docs)
    idc = TABLES[table]["identity"]
    if idc:
        for d, i in zip(docs, next_ids(table, len(docs))): d[idc] = i
    try:
        db[table].insert_many([dict(d) for d in docs], ordered=True)
    except pymongo.errors.BulkWriteError as e:
        done = e.details.get("nInserted", 0)  # emulate an all-or-nothing statement: undo the rows already written
        if done: db[table].delete_many({"$or": [{k: d[k] for k in TABLES[table]["pk"]} for d in docs[:done]]})
        err = (e.details.get("writeErrors") or [{}])[0]
        raise DbError("duplicate key value violates unique constraint" if err.get("code") == 11000 else err.get("errmsg", "insert failed"),
                      "23505" if err.get("code") == 11000 else "XX000", 409, details=str(err.get("keyValue"))[:200])
    _after_write(table)
    return docs if returning else []

def update(ctx, table, filters, values, returning=True):
    if table not in TABLES: raise DbError(f'relation "{table}" does not exist', "42P01", 404)
    changes = clean(table, values, False)
    check_write(ctx, table, "update", changes=changes)
    q = both(to_query(filters), scope(ctx, table, "update"))
    check_fks(table, [changes])
    keys = [d["_id"] for d in db[table].find(q, {"_id": 1})]
    if keys and changes:
        try: db[table].update_many({"_id": {"$in": keys}}, {"$set": changes})
        except DuplicateKeyError as e: raise dup_error(e)
    _after_write(table)
    return list(db[table].find({"_id": {"$in": keys}}, {"_id": 0})) if returning else []

def upsert(ctx, table, rows, returning=True):
    rows = rows if isinstance(rows, list) else [rows]
    check_write(ctx, table, "insert", rows=rows)
    out = []
    for r in rows:
        doc = clean(table, r, True); check_fks(table, [doc])
        key = {k: doc[k] for k in TABLES[table]["pk"]}
        db[table].update_one(key, {"$set": doc}, upsert=True); out.append(doc)
    _after_write(table)
    return out if returning else []

def _delete(table, q):
    pk = pk_of(table)
    docs = list(db[table].find(q, {"_id": 0}))
    if not docs: return []
    for child, col, action in CHILDREN.get(table, []):
        vals = [d[pk] for d in docs if d.get(pk) is not None]
        cq = {col: {"$in": vals}}
        if action == "cascade": _delete(child, cq)
        elif action == "set null": db[child].update_many(cq, {"$set": {col: None}})
        elif db[child].find_one(cq, {"_id": 1}):
            raise DbError(f'update or delete on table "{table}" violates foreign key constraint on table "{child}"', "23503", 409,
                          details=f'Key is still referenced from table "{child}" ({col}).')
    db[table].delete_many(q)
    return docs

def delete(ctx, table, filters, returning=True):
    if table not in TABLES: raise DbError(f'relation "{table}" does not exist', "42P01", 404)
    check_write(ctx, table, "delete")
    q = both(to_query(filters), scope(ctx, table, "delete"))
    if not q: raise DbError("DELETE requires a filter", "21000")
    docs = _delete(table, q)
    if table in ("student", "faculty", "admin"):
        with _ctx_lock: _ctx_cache.clear()
    _after_write(table)
    return docs if returning else []


# ---------------------------------------------------------------------------------------------- views
LETTER = {10: "A+", 9: "A", 8: "B+", 7: "B", 6: "C", 5: "D", 4: "P", 0: "F"}

def transcript_rows(q):
    enr = list(db.enrollment.find(both(q, {"grade_point": {"$ne": None}}), {"_id": 0}))
    secs = {s["section_id"]: s for s in db.section.find({"section_id": {"$in": list({e["section_id"] for e in enr})}}, {"_id": 0})}
    crs = {c["course_id"]: c for c in db.course.find({}, {"_id": 0, "course_id": 1, "title": 1, "credits": 1})}
    sems = {s["sem_id"]: s for s in db.semester.find({}, {"_id": 0})}
    out = []
    for e in enr:
        s = secs[e["section_id"]]; c = crs[s["course_id"]]
        out.append({"student_id": e["student_id"], "sem_id": s["sem_id"], "term_name": sems[s["sem_id"]]["term_name"], "course_id": c["course_id"],
                    "title": c["title"], "credits": c["credits"], "grade_point": e["grade_point"], "grade": LETTER.get(e["grade_point"]), "marks": e.get("marks")})
    return out

def view_select(ctx, table, filters, order, rng, count, head):
    sc = scope(ctx, table, "select")
    base = {k: v for k, v in sc.items()}  # scope filters on student_id, which enrollment carries too
    for col, op, val in filters or []:  # push student_id filters down; others are applied after the join
        if col == "student_id": base = both(base, to_query([[col, op, val]]))
    rows = transcript_rows(base)
    if table == "sgpa":
        acc = {}
        for r in rows:
            k = (r["student_id"], r["sem_id"])
            a = acc.setdefault(k, {"student_id": r["student_id"], "sem_id": r["sem_id"], "term_name": r["term_name"], "pts": 0, "credits": 0})
            a["pts"] += r["grade_point"] * r["credits"]; a["credits"] += r["credits"]
        rows = [{"student_id": a["student_id"], "sem_id": a["sem_id"], "term_name": a["term_name"],
                 "sgpa": round(a["pts"] / a["credits"], 2) if a["credits"] else None, "credits": a["credits"]} for a in acc.values()]
    for col, op, val in filters or []:
        if col == "student_id": continue
        rows = [r for r in rows if (r.get(col) == val if op == "eq" else r.get(col) in val if op == "in" else r.get(col) != val)]
    for col, asc in reversed(order or []): rows.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=not asc)
    total = len(rows) if count else None
    if head: return [], total
    a, b = rng if rng else (0, MAX_ROWS - 1)
    return rows[a:min(b + 1, a + MAX_ROWS)], total


# ---------------------------------------------------------------------------------------------- registration (was SQL functions)
_reg_lock = threading.Lock()  # serialises registration; MongoDB standalone has no multi-document transactions

def _section_sem(section_id):
    s = db.section.find_one({"section_id": section_id}, {"_id": 0})
    if not s: raise DbError("no such section")
    return s, db.semester.find_one({"sem_id": s["sem_id"]}, {"_id": 0})

def _window_open(sem):
    if not (sem.get("reg_opens") and sem.get("reg_closes") and sem["reg_opens"] <= today() <= sem["reg_closes"]):
        raise DbError("registration window closed")

def prereqs_met(student, course):
    groups = {}
    for p in db.prerequisite.find({"course_id": course}, {"_id": 0}): groups.setdefault(p["group_no"], []).append(p)
    if not groups: return True
    secs = {s["section_id"]: s["course_id"] for s in db.section.find({}, {"_id": 0, "section_id": 1, "course_id": 1})}
    best = {}
    for e in db.enrollment.find({"student_id": student, "grade_point": {"$ne": None}}, {"_id": 0}):
        c = secs.get(e["section_id"]); best[c] = max(best.get(c, -1), e["grade_point"])
    return any(all(best.get(p["prereq_course_id"], -1) >= p["min_grade_point"] for p in g) for g in groups.values())

def register_section(ctx, p_section):
    stu = ctx and ctx["student_id"]
    if not stu: raise DbError("not a student")
    with _reg_lock:
        s, sem = _section_sem(p_section); _window_open(sem)
        same_term = [x["section_id"] for x in db.section.find({"sem_id": s["sem_id"]}, {"section_id": 1})]
        mine = list(db.enrollment.find({"student_id": stu, "section_id": {"$in": same_term}}, {"_id": 0}))
        my_secs = {x["section_id"]: x["course_id"] for x in db.section.find({"section_id": {"$in": [e["section_id"] for e in mine]}}, {"_id": 0})}
        if s["course_id"] in my_secs.values(): raise DbError(f"already registered for {s['course_id']}")
        approved = {r["kind"]: r["id"] for r in db.request.find({"student_id": stu, "course_id": s["course_id"], "status": "Approved"}, {"kind": 1, "id": 1})}
        if "waiver" not in approved and not prereqs_met(stu, s["course_id"]): raise DbError(f"prerequisites not met for {s['course_id']}")
        credit = {c["course_id"]: c["credits"] for c in db.course.find({"course_id": {"$in": list(my_secs.values()) + [s["course_id"]]}}, {"_id": 0})}
        if sum(credit[c] for c in my_secs.values()) + credit[s["course_id"]] > sem["credit_cap"]:
            raise DbError(f"credit cap {sem['credit_cap']} exceeded")
        if db.section.find_one_and_update({"section_id": p_section, "seats": {"$gt": 0}}, {"$inc": {"seats": -1}}): extra = False
        elif "seat" in approved: db.section.update_one({"section_id": p_section}, {"$inc": {"capacity": 1}}); extra = True  # approved seat: one more place
        else: raise DbError("section is full")
        try: insert({"admin": True}, "enrollment", [{"student_id": stu, "section_id": p_section}], False)
        except DbError:
            db.section.update_one({"section_id": p_section}, {"$inc": {"capacity": -1} if extra else {"seats": 1}}); raise
        if approved: db.request.update_many({"id": {"$in": list(approved.values())}}, {"$set": {"status": "Used"}})  # one registration per approval

def drop_section(ctx, p_section):
    stu = ctx and ctx["student_id"]
    with _reg_lock:
        _, sem = _section_sem(p_section); _window_open(sem)
        r = db.enrollment.find_one({"student_id": stu, "section_id": p_section, "grade_point": None}, {"enroll_id": 1})
        if r:
            _delete("enrollment", {"enroll_id": r["enroll_id"]})
            db.section.update_one({"section_id": p_section}, {"$inc": {"seats": 1}})

def swap_section(ctx, p_from, p_to):
    stu = ctx and ctx["student_id"]
    with _reg_lock:
        a, _ = _section_sem(p_from); b, sem = _section_sem(p_to)
        if (a["course_id"], a["sem_id"]) != (b["course_id"], b["sem_id"]): raise DbError("sections belong to different courses")
        _window_open(sem)
        if not db.enrollment.find_one({"student_id": stu, "section_id": p_from, "grade_point": None}): raise DbError(f"not registered in section {p_from}")
        if not db.section.find_one_and_update({"section_id": p_to, "seats": {"$gt": 0}}, {"$inc": {"seats": -1}}): raise DbError("section is full")
        db.enrollment.update_one({"student_id": stu, "section_id": p_from, "grade_point": None}, {"$set": {"section_id": p_to}})
        db.section.update_one({"section_id": p_from}, {"$inc": {"seats": 1}})

# ---------------------------------------------------------------------------------------------- monthly feedback
_MONTH = [None]
def month(): return dt.date.today().strftime("%Y-%m")

def ensure_feedback_form():
    """A feedback form exists for every calendar month: created on the first request of a new month, with an announcement."""
    m = month()
    if _MONTH[0] == m: return
    if not db.feedback_form.find_one({"month": m}):
        db.feedback_form.insert_one({"month": m, "created_at": now_iso()})
        nid = next_ids("notification", 1)[0]
        db.notification.insert_one({"id": nid, "student_id": None, "kind": "academic", "read": False, "created_at": now_iso(),
                                    "title": f"Faculty feedback for {dt.date.today():%B %Y} is open",
                                    "body": "Rate each of your faculty from 1 to 5 under Feedback. It takes two minutes and is anonymous."})
    _MONTH[0] = m

def submit_feedback(ctx, p_section, p_ratings):
    stu = ctx["student_id"]
    if not stu: raise DbError("Only students can submit feedback.", "42501", 403)
    ensure_feedback_form(); m = month()
    sec = db.section.find_one({"section_id": p_section})
    cur = max(s["sem_id"] for s in db.semester.find({}, {"sem_id": 1}))
    if not sec or sec["sem_id"] != cur or not db.enrollment.find_one({"student_id": stu, "section_id": p_section}):
        raise DbError("You are not enrolled in that section this term.", "42501", 403)
    qids = {q["id"] for q in db.feedback_question.find({}, {"id": 1})}
    try: ratings = {int(k): int(v) for k, v in (p_ratings or {}).items()}
    except (TypeError, ValueError): raise DbError("invalid ratings")
    if set(ratings) != qids or not all(1 <= v <= 5 for v in ratings.values()):
        raise DbError("Answer every question with a rating from 1 to 5.", "23514")
    if db.feedback_submission.find_one({"month": m, "student_id": stu, "section_id": p_section}):
        raise DbError("You have already submitted feedback for this course this month.", "23505", 409)
    sid = next_ids("feedback_submission", 1)[0]
    db.feedback_submission.insert_one({"id": sid, "month": m, "student_id": stu, "section_id": p_section, "created_at": now_iso()})
    ids = next_ids("feedback_response", len(ratings))
    db.feedback_response.insert_many([{"id": i, "month": m, "section_id": p_section, "faculty_id": sec["faculty_id"], "question_id": q, "rating": v}
                                      for i, (q, v) in zip(ids, sorted(ratings.items()))])
    return {"month": m, "section_id": p_section}

def rpc(ctx, name, args):
    if ctx is None: raise DbError("Not signed in.", "PGRST301", 401)
    if name in ("register_section", "drop_section", "swap_section") and not ctx["admin"]:
        raise DbError("Subjects are assigned by the college. Confirm them on the Subject Registration page.", "42501", 403)
    if name == "confirm_registration": return confirm_registration(ctx)
    if name == "register_section": return register_section(ctx, args.get("p_section"))
    if name == "drop_section": return drop_section(ctx, args.get("p_section"))
    if name == "swap_section": return swap_section(ctx, args.get("p_from"), args.get("p_to"))
    if name == "submit_marks": return submit_marks(ctx, args.get("p_section"))
    if name == "grades_status": return grades_status(ctx)
    if name == "set_grades_release": return set_grades_release(ctx, args.get("p_date"), bool(args.get("p_force")))
    if name == "class_marksheets": return class_marksheets(ctx, bool(args.get("p_publish")))
    if name == "save_marks": return save_marks(ctx, args.get("p_section"), args.get("p_component"), args.get("p_marks"))
    if name == "set_reg_window": return set_reg_window(ctx, args.get("p_opens"), args.get("p_closes"))
    if name == "change_password": return change_password(ctx, args.get("p_old"), args.get("p_new"))
    if name == "submit_feedback": return submit_feedback(ctx, args.get("p_section"), args.get("p_ratings"))
    if name == "faculty_overview": return faculty_overview(ctx)
    if name == "admin_faculty": return admin_faculty(ctx, args.get("p_faculty"), args.get("p_action"), args.get("p_password"))
    if name == "admin_set_login":
        if not ctx["admin"]: raise DbError("only admins can create logins", "42501", 403)
        return set_login(args.get("p_email"), args.get("p_password"))
    raise DbError(f"function {name} does not exist", "42883", 404)
