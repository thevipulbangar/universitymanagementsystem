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
MAX_ROWS = 1000  # per request, like PostgREST; clients page with range()


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

def login(email, password):
    u = db.users.find_one({"email": (email or "").strip().lower()})
    if not u or not check_pw(password or "", u["pw"]):
        raise DbError("Invalid login credentials", "invalid_credentials", 400)
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
OWN_OR_FACULTY = {"student", "enrollment", "fee", "certificate", "hostel_allotment", "hall_ticket", "transcript", "sgpa"}
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
        if table == "feedback_submission": return {} if fac else {"student_id": stu} if stu else NO
        if table == "feedback_response": return {"faculty_id": fac} if fac else NO
        if table == "ppo_application": return {"student_id": stu} if stu else NO
        if table == "request": return {"course_id": {"$in": my_courses(ctx)}} if fac else {"student_id": stu} if stu else NO
    elif table == "fee" and op == "update" and stu: return {"student_id": stu, "status": "PENDING"}
    elif table == "request" and op == "update" and fac: return {"course_id": {"$in": my_courses(ctx)}}
    elif table == "lesson_progress" and fac: return {}
    elif table == "notification" and op == "update" and stu: return {"student_id": stu}
    raise DbError(f'permission denied for table {table}', "42501", 403)

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
        if all(r.get("enroll_id") in ok for r in rows): return
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
LETTER = {10: "O", 9: "A+", 8: "A", 7: "B+", 6: "B", 5: "C", 4: "P", 0: "F"}

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
        if not prereqs_met(stu, s["course_id"]): raise DbError(f"prerequisites not met for {s['course_id']}")
        credit = {c["course_id"]: c["credits"] for c in db.course.find({"course_id": {"$in": list(my_secs.values()) + [s["course_id"]]}}, {"_id": 0})}
        if sum(credit[c] for c in my_secs.values()) + credit[s["course_id"]] > sem["credit_cap"]:
            raise DbError(f"credit cap {sem['credit_cap']} exceeded")
        if not db.section.find_one_and_update({"section_id": p_section, "seats": {"$gt": 0}}, {"$inc": {"seats": -1}}):
            raise DbError("section is full")
        try: insert({"admin": True}, "enrollment", [{"student_id": stu, "section_id": p_section}], False)
        except DbError:
            db.section.update_one({"section_id": p_section}, {"$inc": {"seats": 1}}); raise

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
    if name == "register_section": return register_section(ctx, args.get("p_section"))
    if name == "drop_section": return drop_section(ctx, args.get("p_section"))
    if name == "swap_section": return swap_section(ctx, args.get("p_from"), args.get("p_to"))
    if name == "submit_feedback": return submit_feedback(ctx, args.get("p_section"), args.get("p_ratings"))
    if name == "admin_set_login":
        if not ctx["admin"]: raise DbError("only admins can create logins", "42501", 403)
        return set_login(args.get("p_email"), args.get("p_password"))
    raise DbError(f"function {name} does not exist", "42883", 404)
