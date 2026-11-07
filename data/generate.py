"""Generates the full portal dataset as SQL insert files (00..03, 05) + student CSVs in this folder.
NOTE: this produced the dataset now living in MongoDB (it was loaded via Supabase, then migrated). The SQL files are
not loaded by anything any more; keep this script as the record of how the data was made.
Sized to VIT Pune's sanctioned intake (Admission Notification F.Y. B.Tech 2026-27, 3 Aug 2026) and the AICTE 1:20
student-faculty ratio. Modelled on VIT Pune's structure (FY/SY/TY/LY, odd/even terms, 16-24 credits, divisions of 60).
All people, phone numbers, grades and fee receipts are synthetic. Re-run: python generate.py
The current term's sections, timetable, enrolments and attendance are NOT generated here: load the files, then run
build_timetable.py --apply (or the Admin console's Generate timetable button).
"""
import csv, json, math, datetime as dt, os, random

random.seed(2026)
HERE = os.path.dirname(os.path.abspath(__file__))
D = dt.date
q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
arr = lambda xs: "ARRAY[" + ",".join(q(x) for x in xs) + "]::text[]" if xs else "ARRAY[]::text[]"

# ---------------------------------------------------------------- departments / programs
DEPTS = {  # id: (dept name, programme name, HoD)
    "CE": ("Computer Engineering", "Computer Engineering", "Dr. Rohan Kulkarni"),
    "AD": ("Artificial Intelligence and Data Science", "Artificial Intelligence and Data Science", "Dr. Meera Iyer"),
    "AM": ("Computer Science and Engineering (Artificial Intelligence and Machine Learning)", "Computer Science and Engineering (Artificial Intelligence and Machine Learning)", "Dr. Samir Rane"),
    "ME": ("Mechanical Engineering", "Mechanical Engineering", "Dr. Vikram Gokhale"),
    "CA": ("Computer Science and Engineering (Artificial Intelligence)", "Computer Science and Engineering (Artificial Intelligence)", "Dr. Nikhil Sathe"),
    "CM": ("Computer Science and Engineering (Machine Learning)", "Computer Science and Engineering (Machine Learning)", "Dr. Anaya Deshmukh"),
}
SHORT = {"CE": "Computer Engineering", "AD": "AIDS", "AM": "AIML", "ME": "Mechanical Engineering", "CA": "CSEAI", "CM": "CSML"}
BS = ("BS", "Basic Sciences and Humanities", "Dr. Kavita Joshi")
# Sanctioned intake per year. CSML is not in VIT's 2026-27 list: 180 assumed, like VIT's other CSE specialisations.
INTAKE = {"CE": 720, "AD": 360, "AM": 360, "ME": 360, "CA": 360, "CM": 180}
PER_FACULTY, DIV = 20, 60  # AICTE student:faculty ratio; students per division
BLOCK = {"CE": "B", "AD": "C", "AM": "C", "ME": "M", "CA": "D", "CM": "D", "BS": "A"}

# ---------------------------------------------------------------- people
M = "Aarav Aditya Arjun Atharv Ayaan Dev Dhruv Ishaan Kabir Krish Laksh Madhav Neil Om Parth Pranav Rohan Rudra Samarth Sarthak Shivam Siddharth Soham Tanmay Varun Vedant Vihaan Yash Omkar Harsh Nikhil Pratik Saurabh Swapnil Tejas Mihir Rahul Amit Sanket".split()
F = "Aditi Ananya Anushka Diya Ishita Isha Kavya Khushi Mansi Meera Neha Nidhi Pooja Prachi Priya Riya Saanvi Sakshi Shreya Sneha Tanvi Trisha Vaishnavi Vidhi Yashvi Aarohi Gauri Janhavi Kirti Manasi Payal Rutuja Shruti Sayali Pranjal Ritika Simran Anjali Komal".split()
L = "Patil Joshi Kulkarni Deshmukh Pawar Jadhav Shinde More Kale Bhagwat Iyer Rane Sathe Marathe Gaikwad Kadam Chavan Desai Naik Salunkhe Bhosale Mehta Shah Gupta Sharma Verma Singh Reddy Nair Menon Thakur Phadke Apte Bapat Gokhale Karve Tilak Wagh Sawant Mane Lokhande Ghate Kamble Jagtap Kulkarni Dixit Bhide Godbole Paranjpe Limaye Oak Dange Mahajan Chaudhari Pandit Bendre Nikam Kshirsagar Purohit Soman Deshpande Agarwal Jain Bansal Malhotra Kapoor Rao Pillai Kaur Chopra Saxena Tiwari Mishra Pandey Dubey Yadav Patel Desai Trivedi Vyas Bhatt Joshi Kelkar Sathaye Gadgil Ranade Vaidya Abhyankar".split()
L = list(dict.fromkeys(L))

emails = set()
def uniq_email(base):
    e, k = base + "@vit.edu", 2
    while e in emails:
        e = f"{base}{k}@vit.edu"; k += 1
    emails.add(e); return e

faculty = []  # (id, dept, name, short, email, designation, cabin)
by_dept = {}
def make_faculty(dept, n, hod):
    names = [hod] + [None] * (n - 1)
    for i in range(n):
        if names[i] is None:
            g = random.choice("MF"); fn = random.choice(M if g == "M" else F)
            names[i] = ("Dr. " if random.random() < .55 else "Prof. ") + fn + " " + random.choice(L)
        nm = names[i]; parts = nm.split(); fn, ln = parts[1], parts[-1]
        fid = f"F{len(faculty) + 1:03d}"
        des = "Professor" if i == 0 else random.choice(["Associate Professor", "Assistant Professor", "Assistant Professor", "Associate Professor"])
        faculty.append((fid, dept, nm, f"{fn[0]}. {ln}", uniq_email(f"{fn}.{ln}".lower()), des, f"{BLOCK[dept]}-{random.randint(101, 412)}"))
        by_dept.setdefault(dept, []).append(fid)
# departments teach SE-BE (3 batches); Basic Sciences teaches every FE student
for d, (_, _, hod) in DEPTS.items(): make_faculty(d, math.ceil(INTAKE[d] * 3 / PER_FACULTY), hod)
make_faculty("BS", math.ceil(sum(INTAKE.values()) / PER_FACULTY), BS[2])
def letters(n):  # 0 -> A, 25 -> Z, 26 -> AA
    out = ""
    n += 1
    while n: n, r = divmod(n - 1, 26); out = chr(65 + r) + out
    return out

# ---------------------------------------------------------------- semesters
TERMS = ["Odd 2023-24", "Even 2023-24", "Odd 2024-25", "Even 2024-25", "Odd 2025-26", "Even 2025-26", "Odd 2026-27"]
SEM_ID = {t: i + 1 for i, t in enumerate(TERMS)}
CUR = "Odd 2026-27"

# ---------------------------------------------------------------- courses (position-based, identical credit structure per programme)
CREDITS = {s: [4, 4, 3, 3, 2] for s in range(1, 8)}; CREDITS[8] = [8, 4, 3, 3, 2]
CAT = {1: "bsm bsm es es hss", 2: "bsm bsm es es hss", 3: "bsm core core core core", 4: "core core core core hss",
       5: "core core core core core", 6: "core core core pe oe", 7: "core core pe pe proj", 8: "proj pe oe hss proj"}
CAT = {s: v.split() for s, v in CAT.items()}
FE = {1: ["Engineering Mathematics I", "Engineering Physics", "Basic Electrical Engineering", "Programming and Problem Solving", "Communication Skills"],
      2: ["Engineering Mathematics II", "Engineering Chemistry", "Basic Electronics Engineering", "Engineering Graphics and Design", "Universal Human Values"]}
T = {  # titles for sems 3..8, 5 positions
    "CE": {3: ["Discrete Mathematics", "Data Structures", "Digital Logic and Computer Organization", "Object-Oriented Programming", "Data Structures Laboratory"],
           4: ["Design and Analysis of Algorithms", "Database Management Systems", "Operating Systems", "Computer Networks", "Engineering Economics and Management"],
           5: ["Theory of Computation", "Software Engineering", "Computer Architecture", "Web Technologies", "Full Stack Development Laboratory"],
           6: ["Compiler Design", "Information Security", "Distributed Systems", "Cloud Computing", "Entrepreneurship Development"],
           7: ["Artificial Intelligence", "Big Data Analytics", "Blockchain Technology", "Natural Language Processing", "Project Stage I"],
           8: ["Project Stage II", "Deep Learning", "Digital Marketing", "Industrial Management", "Industry Internship"]},
    "ME": {3: ["Engineering Mathematics III", "Strength of Materials", "Engineering Thermodynamics", "Fluid Mechanics", "Machine Drawing and CAD Laboratory"],
           4: ["Applied Thermodynamics", "Theory of Machines", "Manufacturing Processes", "Material Science and Metallurgy", "Engineering Economics and Management"],
           5: ["Design of Machine Elements", "Heat and Mass Transfer", "Metrology and Quality Control", "Dynamics of Machinery", "Mechanical Measurement Laboratory"],
           6: ["Refrigeration and Air Conditioning", "CAD/CAM", "Mechatronics", "Finite Element Analysis", "Entrepreneurship Development"],
           7: ["Industrial Engineering", "Power Plant Engineering", "Automobile Engineering", "Robotics and Automation", "Project Stage I"],
           8: ["Project Stage II", "Additive Manufacturing", "Digital Marketing", "Industrial Management", "Industry Internship"]},
}
VAR = {  # CS-family variants: (sem, pos) overrides on the Computer Engineering list
    "AD": {(3, 0): "Probability and Statistics", (3, 4): "Python for Data Science Laboratory", (4, 1): "Data Warehousing and Mining", (5, 1): "Data Visualisation", (5, 3): "Statistical Inference",
           (6, 0): "Machine Learning", (6, 3): "Time Series Analysis", (7, 0): "Big Data Technologies", (7, 2): "Business Intelligence", (7, 3): "Text and Social Media Analytics", (8, 1): "Data Ethics and Governance"},
    "AM": {(3, 0): "Linear Algebra for Machine Learning", (3, 4): "Python for Machine Learning Laboratory", (4, 1): "Introduction to Machine Learning", (5, 1): "Neural Networks", (5, 3): "Computer Vision",
           (6, 0): "Deep Learning", (6, 3): "Reinforcement Learning", (7, 0): "Generative AI", (7, 2): "MLOps", (7, 3): "Speech and Audio Processing", (8, 1): "Responsible AI"},
    "CA": {(3, 0): "Discrete Mathematics", (4, 1): "Knowledge Representation and Reasoning", (5, 1): "Machine Learning", (5, 3): "Intelligent Systems",
           (6, 0): "Deep Learning", (6, 3): "Computer Vision", (7, 0): "Generative AI", (7, 2): "AI for Robotics", (7, 3): "Cognitive Computing", (8, 1): "AI Ethics and Safety"},
    "CM": {(3, 0): "Probability and Statistics", (4, 1): "Introduction to Machine Learning", (5, 1): "Pattern Recognition", (5, 3): "Data Mining",
           (6, 0): "Advanced Machine Learning", (6, 3): "Optimisation Techniques", (7, 0): "Deep Learning", (7, 2): "Edge and Embedded ML", (7, 3): "Federated Learning", (8, 1): "Machine Learning Operations"},
}
def title_of(d, s, p):
    if s <= 2: return FE[s][p]
    if d == "ME": return T["ME"][s][p]
    return VAR.get(d, {}).get((s, p), T["CE"][s][p])

SKILLS = {"bsm": ["Mathematics"], "es": ["Engineering Fundamentals"], "hss": ["Communication"], "core": [], "pe": [], "oe": [], "proj": ["Project Delivery"]}
courses = []  # dict rows
cid = {}      # (dept, sem, pos) -> course_id
for d in list(DEPTS) + ["FE"]:
    for s in (range(1, 3) if d == "FE" else range(3, 9)):
        for p in range(5):
            code = f"FE{s}{p + 1:02d}" if d == "FE" else f"{d}{s}{p + 1:02d}"
            cid[(d, s, p)] = code
            cat = CAT[s][p]
            fac = by_dept["BS" if d == "FE" else d][(s + p) % len(by_dept["BS" if d == "FE" else d])]
            ttl = title_of(d if d != "FE" else "CE", s, p)
            courses.append(dict(id=code, dept="BS" if d == "FE" else d, title=ttl, credits=CREDITS[s][p], sem=s,
                                type={"pe": "Professional Elective", "oe": "Open Elective"}.get(cat, "Mandatory"), coord=fac, cat=cat))
for c in courses:
    c["desc"] = f"{c['title']}: semester {c['sem']} course of the B.Tech programme, {c['credits']} credits."
    c["skills"] = [c["title"]] + SKILLS[c["cat"]]
prog_courses = {d: [cid[("FE", s, p)] for s in (1, 2) for p in range(5)] + [cid[(d, s, p)] for s in range(3, 9) for p in range(5)] for d in DEPTS}
C = {c["id"]: c for c in courses}
for c in courses:  # suggested follow-up = same position next semester
    nxt = None
    for (d, s, p), code in cid.items():
        if code == c["id"] and s < 8:
            nxt = cid.get((d if s >= 3 else ("CE" if s == 2 else "FE"), s + 1, p)) if s != 2 else None
    c["next"] = [nxt] if nxt else []
prereq = []
for d in DEPTS:
    prereq += [(cid[(d, 4, 0)], cid[(d, 3, 1)], 1, 4), (cid[(d, 5, 3)], cid[(d, 4, 2)], 1, 4), (cid[(d, 6, 0)], cid[(d, 5, 0)], 1, 4), (cid[(d, 5, 0)], cid[(d, 4, 0)], 1, 4)]
prereq += [(cid[("FE", 2, 0)], cid[("FE", 1, 0)], 1, 4), (cid[("FE", 2, 1)], cid[("FE", 1, 1)], 1, 4)]
prereq = sorted(set(prereq))
cat_credits = {}
for code in prog_courses["CE"]: cat_credits[C[code]["cat"]] = cat_credits.get(C[code]["cat"], 0) + C[code]["credits"]
CAT_META = {"core": ("Professional Core", "Compulsory departmental courses"), "pe": ("Professional Electives", "Depth in a chosen specialisation"),
            "bsm": ("Basic Sciences & Mathematics", "Mathematics, physics, chemistry, statistics"), "es": ("Engineering Sciences", "Cross-disciplinary engineering base"),
            "hss": ("Humanities & Social Sciences", "Communication, ethics, economics"), "oe": ("Open Electives", "Any department, breadth requirement"),
            "proj": ("Projects & Internship", "Project stages and industry internship")}
TOTAL_CREDITS = sum(cat_credits.values())

# ---------------------------------------------------------------- students (admit year => class; frame = Odd 2026-27)
CLS = {2023: ("LY", 7), 2024: ("TY", 5), 2025: ("SY", 3), 2026: ("FY", 1)}
CATS = ["OPEN"] * 50 + ["OBC"] * 20 + ["SC"] * 8 + ["ST"] * 3 + ["EWS"] * 10 + ["NT"] * 5 + ["VJ"] * 4
students, used_prn, cnt = [], set(), {}
for d in DEPTS:
    for yr, (cls, sem) in CLS.items():
        for i in range(round(INTAKE[d] * random.uniform(.94, 1.0))):  # 94-100% of seats filled
            g = random.choice(["Male", "Female"]); fn = random.choice(M if g == "Male" else F); ln = random.choice(L)
            while True:
                prn = f"1{str(yr)[2:]}{random.randint(20000, 99999)}"
                if prn not in used_prn: used_prn.add(prn); break
            cnt[(d, yr)] = cnt.get((d, yr), 0) + 1
            div = letters(i // DIV)
            dob = D(yr - 18 - random.choice([0, 0, 0, 1]), 1, 1) + dt.timedelta(days=random.randint(0, 364))
            students.append(dict(
                id=prn, prog="BTECH-" + d, dept=d, name=f"{fn} {ln}".upper(), admit=yr, first=fn, roll=f"{cls}{d}{div}{i % DIV + 1:02d}", year=cls,
                div=div, batch=f"{div}{random.randint(1, 3)}", sem=sem, email=uniq_email(f"{fn}.{ln}".lower() + str(yr)[2:]),
                phone=f"+91 {random.choice('9876')}{random.randint(1000, 9999)} {random.randint(10000, 99999)}", dob=dob.isoformat(), gender=g,
                category=random.choice(CATS), admission=random.choice([f"CAP Round {random.choice(['I', 'II'])}, {yr}", f"Institute Level, {yr}", f"MHT-CET {yr}"]),
                mentor=random.choice(by_dept[d]), ability=random.gauss(68, 10)))
students.sort(key=lambda s: (s["dept"], s["admit"], s["id"]))

# ---------------------------------------------------------------- rooms / exam venues
POS = {code: p for (d, s, p), code in cid.items()}
ROOM = {}
for code, c in C.items():
    ROOM[code] = f"{BLOCK[c['dept']]}-{200 + (c['sem'] * 7 + POS[code] * 3) % 90}"

# ---------------------------------------------------------------- sections / enrollments
def term_of(admit, sem):  # term in which a student admitted in `admit` takes semester `sem`
    y = admit + (sem - 1) // 2
    return f"{'Odd' if sem % 2 else 'Even'} {y}-{str(y + 1)[2:]}"
# Completed semesters only; one section per class group of 60 (FE: the whole batch in groups of 60, later: the division).
sections, sec_id = {}, {}   # (course, term, group) -> id
enrollments = []            # (id, student, section, gp, marks, course, sem)
def gp_of(m): return 10 if m >= 90 else 9 if m >= 80 else 8 if m >= 70 else 7 if m >= 60 else 6 if m >= 50 else 5 if m >= 45 else 4
fe_rank = {}
for yr in CLS:
    batch = sorted((s for s in students if s["admit"] == yr), key=lambda s: (s["dept"], s["div"], s["roll"]))
    for k, s in enumerate(batch): fe_rank[s["id"]] = k // DIV
fac_turn = {}
for st in students:
    for sem in range(1, st["sem"]):
        term = term_of(st["admit"], sem); grp = fe_rank[st["id"]] if sem <= 2 else ord(st["div"][-1]) - 65 + 26 * (len(st["div"]) - 1)
        for p in range(5):
            code = cid[("FE" if sem <= 2 else st["dept"], sem, p)]
            key = (code, term, grp)
            if key not in sec_id:
                pool_ = by_dept[C[code]["dept"]]; fac_turn[C[code]["dept"]] = fac_turn.get(C[code]["dept"], -1) + 1
                sec_id[key] = len(sec_id) + 1
                sections[key] = dict(id=sec_id[key], enrolled=0, code=letters(grp), fac=pool_[fac_turn[C[code]["dept"]] % len(pool_)])
            sections[key]["enrolled"] += 1
            m = int(min(99, max(41, random.gauss(st["ability"], 8)))); g = gp_of(m)
            enrollments.append((len(enrollments) + 1, st["id"], sec_id[key], g, m, code, sem))

# ---------------------------------------------------------------- write helpers
def write(name, parts):
    with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(parts) + "\n")
def ins(table, cols, rows, sysval=False, size=400):
    out = []
    for i in range(0, len(rows), size):
        out.append(f"insert into {table} ({', '.join(cols)}){' overriding system value' if sysval else ''} values\n  " + ",\n  ".join(rows[i:i + size]) + ";")
    return "\n".join(out)
def setval(seq_table, col): return f"select setval(pg_get_serial_sequence('{seq_table}', '{col}'), (select coalesce(max({col}), 1) from {seq_table}));"

# ---- 00 reset
write("00_reset.sql", [
    "-- Removes ALL portal data (old sample data included) but keeps schema, `admin`, `pending_login` and auth logins.",
    "-- Run in Supabase -> SQL Editor. This cannot be undone.",
    "begin;",
    "truncate notification, hall_ticket, exam_paper, hostel_allotment, certificate, fee, calendar_event, lesson_progress, lesson_plan,",
    "  attendance_submission, attendance, section_meeting, enrollment, section, student, program_requirement, prerequisite,",
    "  requirement_category, course, faculty, semester, program, department restart identity cascade;",
    "commit;"])

# ---- 01 core
cur_cal = [("2026-07-20", "2026-07-20", "Semester commences", "academic", None), ("2026-07-27", "2026-08-07", "Add / drop window", "registration", "Students may add, drop or swap sections. Credit range 16–24."),
           ("2026-08-15", "2026-08-15", "Independence Day", "holiday", None), ("2026-09-14", "2026-09-14", "Ganesh Chaturthi", "holiday", None),
           ("2026-09-21", "2026-09-26", "In-semester examination I", "exam", None), ("2026-10-02", "2026-10-02", "Gandhi Jayanti", "holiday", None),
           ("2026-10-09", "2026-10-09", "Mentor–mentee review", "academic", None), ("2026-10-20", "2026-10-20", "Dussehra", "holiday", None),
           ("2026-11-05", "2026-11-05", "Last day of instruction", "academic", None), ("2026-11-06", "2026-11-10", "Diwali break", "holiday", None),
           ("2026-11-11", "2026-11-14", "Practical & oral examinations", "exam", None), ("2026-11-16", "2026-11-28", "End-semester examination", "exam", None),
           ("2026-12-01", "2026-12-31", "Winter vacation", "vacation", None), ("2026-12-22", "2026-12-22", "Results declared", "academic", None)]
cal_rows = [f"({SEM_ID[CUR]}, {q(a)}, {q(b)}, {q(t)}, {q(k)}, {q(dd)})" for a, b, t, k, dd in cur_cal]
cal_rows += [f"(null, {q(a)}, {q(b)}, {q(t)}, {q(k)}, null)" for a, b, t, k in
             [("2027-01-04", "2027-01-04", "Even semester commences", "academic"), ("2027-01-04", "2027-01-15", "Even semester registration window", "registration"), ("2027-01-26", "2027-01-26", "Republic Day", "holiday")]]
MODT = ["Foundations", "Core Techniques", "Advanced Topics", "Applications and Case Studies"]
ASP = ["Introduction and scope", "Key definitions and notation", "Worked examples", "Design considerations", "Case study", "Problem-solving session"]
lp_rows = []
for code, c in C.items():
    if c["sem"] % 2 == 0 or c["sem"] == 8: continue
    start = D(2026, 7, 21); mods = []; k = 0
    for n in range(4):
        tops = []
        for t in range(3):
            tops.append([f"{c['title']}: {ASP[(n * 3 + t) % 6]}", (start + dt.timedelta(days=k * 6)).strftime("%d %b")]); k += 1
        mods.append(dict(n=n + 1, title=MODT[n], topics=tops))
    lp_rows.append(f"({q(code)}, {arr([f'Explain the core ideas of {c['title']}', f'Apply {c['title']} to practical problems'])}, {q(json.dumps(mods))}::jsonb)")
write("01_core.sql", [
    "-- Departments, programmes, faculty, courses, prerequisites, requirements, terms, calendar and lesson plans.",
    "begin;",
    ins("department", ["dept_id", "dept_name", "hod_name"], [f"({q(k)}, {q(v[0])}, {q(v[2])})" for k, v in DEPTS.items()] + [f"({q(BS[0])}, {q(BS[1])}, {q(BS[2])})"]),
    ins("program", ["program_id", "dept_id", "program_name", "total_credits"], [f"({q('BTECH-' + k)}, {q(k)}, {q('B.Tech ' + v[1])}, {TOTAL_CREDITS})" for k, v in DEPTS.items()]),
    ins("faculty", ["faculty_id", "dept_id", "name", "short_name", "email", "designation", "cabin"], [f"({', '.join(q(x) for x in f)})" for f in faculty]),
    ins("course", ["course_id", "dept_id", "title", "credits", "sem_no", "course_type", "coordinator_id", "description", "skills", "careers", "next"],
        [f"({q(c['id'])}, {q(c['dept'])}, {q(c['title'])}, {c['credits']}, {c['sem']}, {q(c['type'])}, {q(c['coord'])}, {q(c['desc'])}, {arr(c['skills'])}, ARRAY[]::text[], {arr(c['next'])})" for c in courses]),
    ins("prerequisite", ["course_id", "prereq_course_id", "group_no", "min_grade_point"], [f"({q(a)}, {q(b)}, {g}, {m})" for a, b, g, m in prereq]),
    ins("requirement_category", ["category", "name", "credits", "note"], [f"({q(k)}, {q(CAT_META[k][0])}, {cat_credits[k]}, {q(CAT_META[k][1])})" for k in CAT_META]),
    ins("program_requirement", ["program_id", "course_id", "category", "is_mandatory"],
        [f"({q('BTECH-' + d)}, {q(code)}, {q(C[code]['cat'])}, {'false' if C[code]['cat'] in ('pe', 'oe') else 'true'})" for d in DEPTS for code in prog_courses[d]]),
    ins("semester", ["sem_id", "term_name", "year", "credit_cap", "min_credits", "reg_opens", "reg_closes"],
        [f"({SEM_ID[t]}, {q(t)}, {q(t.split()[1])}, 24, 16, {q('2026-07-27') if t == CUR else 'null'}, {q('2026-08-07') if t == CUR else 'null'})" for t in TERMS], sysval=True),
    setval("semester", "sem_id"),
    ins("calendar_event", ["sem_id", "start_on", "end_on", "title", "kind", "detail"], cal_rows),
    ins("lesson_plan", ["course_id", "objectives", "modules"], lp_rows),
    "commit;"])

# ---- 02 students (+ hostel, fees, certificates)
stud_cols = ["student_id", "program_id", "dept_id", "name", "admit_year", "first_name", "roll", "year", "division", "batch", "current_sem", "email", "phone", "dob", "gender", "category", "admission", "mentor_id"]
stud_rows = [f"({q(s['id'])}, {q(s['prog'])}, {q(s['dept'])}, {q(s['name'])}, {s['admit']}, {q(s['first'])}, {q(s['roll'])}, {q(s['year'])}, {q(s['div'])}, {q(s['batch'])}, {s['sem']}, {q(s['email'])}, {q(s['phone'])}, {q(s['dob'])}, {q(s['gender'])}, {q(s['category'])}, {q(s['admission'])}, {q(s['mentor'])})" for s in students]
HOSTELS = {"Female": [("Kaveri Hostel — Girls", "C", "Dr. Shubhangi Patil"), ("Godavari Hostel — Girls", "G", "Prof. Rekha Phadke")],
           "Male": [("Krishna Hostel — Boys", "K", "Dr. Anil Bapat"), ("Narmada Hostel — Boys", "N", "Prof. Sunil Wagh")]}
host_rows, fee_rows, cert_rows, receipt = [], [], [], 84000
hostel_of = {}
for s in students:
    if random.random() < .45:
        h, b, w = random.choice(HOSTELS[s["gender"]]); fl = random.randint(1, 4); occ = random.choice(["Double sharing", "Triple sharing"])
        hostel_of[s["id"]] = True
        host_rows.append(f"({q(s['id'])}, {q(h)}, {q(b)}, {q(f'{b}-{fl}{random.randint(1, 20):02d}')}, {q(['1st', '2nd', '3rd', '4th'][fl - 1] + ' Floor')}, {q(occ)}, {q(w)}, '+91 20 2437 3XXX', {q(random.choice(['Mess I — Vegetarian', 'Mess II — Vegetarian', 'Mess III — Mixed']))}, {q(str(D(s['admit'], 6, random.randint(15, 28))))})")
    for yi, yr in enumerate(range(s["admit"], 2027)):
        if yr > 2026: continue
        ay = f"{yr}-{str(yr + 1)[2:]}"; curyr = yr == 2026
        heads = [("Tuition Fee", 112000 + 4000 * (yr - 2023), "TF"), ("Development Fee", 14500, "DF"), ("Library & Laboratory", 3500, "LL")]
        if s["id"] in hostel_of: heads.append(("Hostel & Mess", 12000 + 1000 * (yr - 2023), "HM"))
        for h, amt, code in heads:
            pending = curyr and h == "Tuition Fee" and random.random() < .12
            receipt += random.randint(1, 9)
            fee_rows.append(f"({q(s['id'])}, {q(ay)}, {q(h)}, {amt}, {q('PENDING' if pending else 'PAID')}, {'null' if pending else q(str(D(yr, 6, random.randint(10, 28))))}, {q('2026-08-31') if pending else 'null'}, {'null' if pending else q(f'VIT/{str(yr)[2:]}/{code}/{receipt:07d}')}, {'null' if pending else q(random.choice(['Net Banking', 'UPI', 'Debit Card', 'Demand Draft']))})")
        if curyr:
            fee_rows.append(f"({q(s['id'])}, {q(ay)}, {q(f'Examination Fee — Semester {s['sem']}')}, 6500, 'PENDING', null, '2026-11-02', null, null)")
        else:
            receipt += random.randint(1, 9)
            fee_rows.append(f"({q(s['id'])}, {q(ay)}, 'Examination Fee', 13000, 'PAID', {q(str(D(yr, 6, random.randint(10, 28))))}, null, {q(f'VIT/{str(yr)[2:]}/EF/{receipt:07d}')}, 'Net Banking')")
    pool = [("Advanced Python Programming", "VIT Centre for Continuing Education", "CCE", 60), ("Cloud Foundations Bootcamp", "VIT Industry Partnership Cell", "IPC", 24),
            ("National Level Hackathon — Participant", "VIT Technical Council", "HACK", 36), ("NPTEL — Introduction to Machine Learning", "NPTEL / IIT Madras", "NPTEL", 40),
            ("Design Thinking Workshop", "VIT Design Studio", "DTW", 16), ("Communication and Leadership Workshop", "VIT Training & Placement Cell", "TPC", 20),
            ("Data Analysis with Excel and SQL", "VIT Centre for Continuing Education", "DAX", 30)]
    if s["admit"] < 2026:
        for t, iss, rc, hrs in random.sample(pool, random.randint(0, 3)):
            cert_rows.append(f"({q(s['id'])}, {q(t)}, {q(iss)}, {q(f'{rc}-{random.randint(100, 999)}')}, {q(str(D(random.randint(s['admit'] + 1, 2026), random.randint(1, 9), random.randint(1, 28))))}, {hrs}, {random.choice(['true', 'true', 'false'])}, {q(random.choice(['O', 'A+', 'A', 'B+']))})")
write("02_students.sql", [
    "-- Students, hostel allotments, fees and certificates. Run after 01_core.sql.", "begin;",
    ins("student", stud_cols, stud_rows),
    ins("hostel_allotment", ["student_id", "hostel", "block", "room", "floor", "occupancy", "warden", "warden_phone", "mess", "check_in"], host_rows),
    ins("fee", ["student_id", "year", "head", "amount", "status", "paid_on", "due_on", "receipt", "mode"], fee_rows),
    ins("certificate", ["student_id", "title", "issuer", "ref_code", "issued_on", "hours", "verified", "grade"], cert_rows),
    "commit;"])

# ---- 03 past sections / enrollments (the weekly slot of a past section is not tracked: placeholder Mon 09:00)
sec_rows = []
for (code, term, grp), s in sorted(sections.items(), key=lambda kv: kv[1]["id"]):
    sec_rows.append(f"({s['id']}, {q(code)}, {SEM_ID[term]}, 'Mon', '09:00', '10:00', {q(s['code'])}, {q(s['fac'])}, {q(ROOM[code])}, {DIV}, {DIV - s['enrolled']})")
enr_rows = []
SMAP = {s["id"]: s for s in students}
for e in enrollments:
    s = SMAP[e[1]]; y = s["admit"] + (e[6] - 1) // 2
    when = D(y, 7, 25) if e[6] % 2 else D(y + 1, 1, 8)
    enr_rows.append(f"({e[0]}, {q(e[1])}, {e[2]}, {'null' if e[3] is None else e[3]}, {'null' if e[4] is None else e[4]}, {q(when.isoformat() + ' 10:00:00+05:30')})")
write("03_sections.sql", [
    "-- Past-term sections and graded enrolments. Run after 02_students.sql. The current term comes from build_timetable.py.", "begin;",
    ins("section", ["section_id", "course_id", "sem_id", "day", "start_time", "end_time", "section_code", "faculty_id", "room", "capacity", "seats"], sec_rows, sysval=True),
    setval("section", "section_id"),
    ins("enrollment", ["enroll_id", "student_id", "section_id", "grade_point", "marks", "enrolled_at"], enr_rows, sysval=True),
    setval("enrollment", "enroll_id"), "commit;"])

# ---- 05 exams, hall tickets, notifications
EX = "End-Semester Examination"
DATES = [D(2026, 11, 16), D(2026, 11, 18), D(2026, 11, 20), D(2026, 11, 23), D(2026, 11, 25)]
pap_rows, seen = [], set()
for code, c in C.items():
    if c["sem"] % 2 == 0 or c["sem"] == 8: continue
    if code in seen: continue
    seen.add(code)
    pap_rows.append(f"({SEM_ID[CUR]}, {q(EX)}, {q(code)}, {q(DATES[POS[code]].isoformat())}, '10:00 – 13:00', {q(ROOM[code])})")
INS_ = ["Carry this hall ticket and your institute identity card to every paper.", "Report to the examination hall 20 minutes before the scheduled time.",
        "Electronic devices, including smart watches, are not permitted in the examination hall.", "Candidates with attendance below 75% in a course are not eligible for that paper."]
ht_rows = [f"({q(s['id'])}, {SEM_ID[CUR]}, {q(EX + ' — Semester ' + str(s['sem']))}, {q(f'{BLOCK[s['dept']]}-{200 + i % 60}-{i % 40 + 1}')}, 'VIT Pune — Bibwewadi Campus', {q('Academic Block ' + BLOCK[s['dept']])}, {arr(INS_)})" for i, s in enumerate(students)]
# papers carry the semester-specific exam title the portal matches against the hall ticket
pap_rows = []
for sem in (1, 3, 5, 7):
    for code, c in C.items():
        if c["sem"] == sem: pap_rows.append(f"({SEM_ID[CUR]}, {q(EX + ' — Semester ' + str(sem))}, {q(code)}, {q(DATES[POS[code]].isoformat())}, '10:00 – 13:00', {q(ROOM[code])})")
now = "now()"
note_rows = [
    f"(null, 'End-semester examination from 16 November', 'Timetable published under Examination → Time Table. Hall tickets are available from 9 November.', 'academic', false, {now} - interval '3 hours')",
    f"(null, 'Diwali break 6–10 November', 'Classes resume on 11 November with practical and oral examinations.', 'info', false, {now} - interval '1 day')",
    f"(null, 'Library timings extended', 'The central library stays open until 22:00 during the examination period.', 'info', true, {now} - interval '3 days')",
]
for s in students:
    note_rows.append(f"({q(s['id'])}, 'Examination fee due 2 November', 'Examination Fee — Semester {s['sem']} of ₹6,500 is pending. Pay under Records → Fees.', 'warning', false, {now} - interval '5 hours')")
write("05_exams_notifications.sql", [
    "-- Exam timetable, hall tickets and notifications. Run after 03_sections.sql.", "begin;",
    ins("exam_paper", ["sem_id", "exam", "course_id", "held_on", "time_slot", "venue"], pap_rows),
    ins("hall_ticket", ["student_id", "sem_id", "exam", "seat", "centre", "block", "instructions"], ht_rows),
    ins("notification", ["student_id", "title", "body", "kind", "read", "created_at"], note_rows), "commit;"])

# ---- CSVs for browsing / spreadsheets
cols = ["student_id", "program_id", "dept_id", "name", "admit_year", "first_name", "roll", "year", "division", "batch", "current_sem", "email", "phone", "dob", "gender", "category", "admission"]
keys = ["id", "prog", "dept", "name", "admit", "first", "roll", "year", "div", "batch", "sem", "email", "phone", "dob", "gender", "category", "admission"]
with open(os.path.join(HERE, "students.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(cols); [w.writerow([s[k] for k in keys]) for s in students]
with open(os.path.join(HERE, "students_overview.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["Student Name", "Student PRN", "Phone Number", "Course Name", "Gender", "DOB", "Email", "Year", "Division", "Admit Year"])
    for s in students: w.writerow([s["name"], s["id"], s["phone"], SHORT[s["dept"]], s["gender"], s["dob"], s["email"], s["year"], s["div"], s["admit"]])
by = {}
for st in students: by[(st["dept"], st["admit"])] = by.get((st["dept"], st["admit"]), 0) + 1
print("students per dept/batch:", {f"{d}-{y}": n for (d, y), n in sorted(by.items())})
print("faculty per dept:", {d: len(v) for d, v in by_dept.items()})
print(dict(students=len(students), faculty=len(faculty), courses=len(courses), past_sections=len(sec_rows), past_enrollments=len(enr_rows),
           fees=len(fee_rows), certs=len(cert_rows), hostel=len(host_rows), notes=len(note_rows), credits=TOTAL_CREDITS))
