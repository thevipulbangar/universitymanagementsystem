"""Seeds career_path and ppo_event (idempotent). Run once: python data/seed_extras.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import mongo_db as M

PATHS = [
    ("Software Architect", ["Software Engineering", "Distributed Systems", "Cloud Computing", "Operating Systems", "Design and Analysis of Algorithms"], "High", "₹28 LPA"),
    ("Full Stack Engineer", ["Web Technologies", "Full Stack Development Laboratory", "Database Management Systems", "Object-Oriented Programming", "Data Structures"], "Very High", "₹18 LPA"),
    ("Systems Engineer", ["Operating Systems", "Computer Networks", "Computer Architecture", "Digital Logic and Computer Organization", "Compiler Design"], "Moderate", "₹19 LPA"),
    ("Cloud / Platform Engineer", ["Cloud Computing", "Computer Networks", "Distributed Systems", "Information Security", "Operating Systems"], "Very High", "₹22 LPA"),
    ("ML Engineer", ["Machine Learning", "Deep Learning", "Introduction to Machine Learning", "Probability and Statistics", "Artificial Intelligence"], "Very High", "₹24 LPA"),
    ("Data Engineer", ["Big Data Analytics", "Database Management Systems", "Data Warehousing and Mining", "Big Data Technologies", "Data Structures"], "High", "₹20 LPA"),
    ("Security Engineer", ["Information Security", "Computer Networks", "Blockchain Technology", "Operating Systems", "Cloud Computing"], "High", "₹21 LPA"),
]
EVENTS = [("2027-01-12", "PPO registration opens", "registration"), ("2027-02-02", "Aptitude & technical screening", "exam"),
          ("2027-02-18", "Company pre-placement talks", "academic"), ("2027-03-10", "Internship offer roll-out", "academic")]
M.db.career_path.delete_many({}); M.db.ppo_event.delete_many({}); M.db.counters.delete_one({"_id": "ppo_event"})
M.db.career_path.insert_many([dict(name=n, skills=s, demand=d, median=m) for n, s, d, m in PATHS])
ids = M.next_ids("ppo_event", len(EVENTS))
M.db.ppo_event.insert_many([dict(id=i, on_date=d, title=t, kind=k) for i, (d, t, k) in zip(ids, EVENTS)])
print("career_path", M.db.career_path.count_documents({}), "ppo_event", M.db.ppo_event.count_documents({}))

# monthly feedback questions (rated 1 = strongly disagree … 5 = strongly agree)
QS = [("completion", "The syllabus is being completed at a good pace, on schedule."),
      ("doubts", "My doubts are resolved clearly, in class or during office hours."),
      ("career", "The faculty connects the subject to careers and gives useful guidance."),
      ("clarity", "Concepts are explained clearly, with good examples."),
      ("punctuality", "Classes start and end on time and are held regularly."),
      ("material", "Notes, assignments and reference material are helpful."),
      ("approachability", "The faculty is approachable and encourages questions."),
      ("evaluation", "Tests and assignments are fair and feedback comes on time.")]
if not M.db.feedback_question.count_documents({}):
    ids = M.next_ids("feedback_question", len(QS))
    M.db.feedback_question.insert_many([dict(id=i, category=c, text=t) for i, (c, t) in zip(ids, QS)])
M.ensure_feedback_form()
print("feedback_question", M.db.feedback_question.count_documents({}), "forms", M.db.feedback_form.count_documents({}))
