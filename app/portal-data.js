/* VIT Academic Portal — mock university dataset + academic engines + persistent store.
   Exposes window.VIT. Pure logic; no DOM.
   With db-client.js loaded (window.VITDB → the MongoDB API in serve.py), the same objects are
   refilled from the database after sign-in and mutations are written back; otherwise the mock
   constants below + localStorage are used. */
(function () {
  'use strict';

  // ---------- grades ----------
  const GP = { 'A+': 10, A: 9, 'B+': 8, B: 7, C: 6, D: 5, P: 4, F: 0 };
  const RANK = ['F', 'P', 'D', 'C', 'B', 'B+', 'A', 'A+'];
  const gradeMeets = (have, need) => RANK.indexOf(have) >= RANK.indexOf(need);

  // ---------- deterministic prng ----------
  function lcg(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const m = (day, start, end, room, type) => ({ day, start, end, room, type });
  const toMin = (t) => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };

  // ---------- faculty ----------
  const FACULTY = {
    F01: { id: 'F01', name: 'Prof. Anaya Deshmukh', short: 'A. Deshmukh', email: 'anaya.deshmukh@vit.edu', dept: 'Computer Engineering', desig: 'Associate Professor', cabin: 'B-311' },
    F02: { id: 'F02', name: 'Dr. Rohan Kulkarni', short: 'R. Kulkarni', email: 'rohan.kulkarni@vit.edu', dept: 'Computer Engineering', desig: 'Professor', cabin: 'B-304' },
    F03: { id: 'F03', name: 'Prof. Meera Iyer', short: 'M. Iyer', email: 'meera.iyer@vit.edu', dept: 'Computer Engineering', desig: 'Assistant Professor', cabin: 'B-208' },
    F04: { id: 'F04', name: 'Dr. Samir Rane', short: 'S. Rane', email: 'samir.rane@vit.edu', dept: 'Computer Engineering', desig: 'Professor', cabin: 'B-301' },
    F05: { id: 'F05', name: 'Prof. Kavita Joshi', short: 'K. Joshi', email: 'kavita.joshi@vit.edu', dept: 'Mathematics', desig: 'Associate Professor', cabin: 'A-114' },
    F06: { id: 'F06', name: 'Dr. Nikhil Sathe', short: 'N. Sathe', email: 'nikhil.sathe@vit.edu', dept: 'Computer Engineering', desig: 'Assistant Professor', cabin: 'B-212' },
    F07: { id: 'F07', name: 'Prof. Leena Marathe', short: 'L. Marathe', email: 'leena.marathe@vit.edu', dept: 'Humanities', desig: 'Assistant Professor', cabin: 'C-102' }
  };

  // ---------- requirement buckets (B.Tech Computer Engineering, 120 credits) ----------
  const REQUIREMENTS = [
    { id: 'core', name: 'Professional Core', credits: 44, note: 'Compulsory departmental courses' },
    { id: 'pe', name: 'Professional Electives', credits: 18, note: 'Depth in a chosen specialisation' },
    { id: 'bsm', name: 'Basic Sciences & Mathematics', credits: 20, note: 'Mathematics, physics, statistics' },
    { id: 'es', name: 'Engineering Sciences', credits: 12, note: 'Cross-disciplinary engineering base' },
    { id: 'hss', name: 'Humanities & Social Sciences', credits: 10, note: 'Communication, ethics, economics' },
    { id: 'oe', name: 'Open Electives', credits: 9, note: 'Any department, breadth requirement' },
    { id: 'proj', name: 'Projects & Internship', credits: 7, note: 'Mini project, internship, capstone' }
  ];

  /* ---------- course catalogue ----------
     buckets: requirement ids this course can satisfy (several ⇒ the audit must choose)
     prereq: expression tree — {all:[…]} | {any:[…]} | {course, minGrade?}                     */
  const C = [
    // ——— completed, semesters I–III ———
    { code: 'CS101', name: 'Programming Fundamentals', credits: 4, sem: 1, cat: 'Mandatory', buckets: ['core'], fac: 'F02', desc: 'Imperative programming, control flow, functions, recursion and file I/O in C.', skills: ['C', 'Problem Solving', 'Recursion'] },
    { code: 'MA101', name: 'Engineering Mathematics I', credits: 4, sem: 1, cat: 'Mandatory', buckets: ['bsm'], fac: 'F05', desc: 'Calculus of one and several variables, sequences, series, matrices.', skills: ['Calculus', 'Linear Algebra'] },
    { code: 'PH101', name: 'Engineering Physics', credits: 3, sem: 1, cat: 'Mandatory', buckets: ['bsm', 'es'], fac: 'F05', desc: 'Waves, optics, semiconductor physics for engineers.', skills: ['Physics'] },
    { code: 'HS101', name: 'Communication Skills', credits: 2, sem: 1, cat: 'Mandatory', buckets: ['hss'], fac: 'F07', desc: 'Technical writing, presentation and professional communication.', skills: ['Communication', 'Technical Writing'] },
    { code: 'CS102', name: 'Digital Logic Design', credits: 3, sem: 1, cat: 'Mandatory', buckets: ['core', 'es'], fac: 'F04', desc: 'Boolean algebra, combinational and sequential circuit design.', skills: ['Digital Logic'] },
    { code: 'CS201', name: 'Data Structures', credits: 4, sem: 2, cat: 'Mandatory', buckets: ['core'], fac: 'F02', prereq: { course: 'CS101' }, desc: 'Lists, stacks, queues, trees, heaps, graphs and their complexity.', skills: ['Data Structures', 'Complexity Analysis', 'Algorithms'] },
    { code: 'MA102', name: 'Discrete Mathematics', credits: 4, sem: 2, cat: 'Mandatory', buckets: ['bsm', 'core'], fac: 'F05', desc: 'Logic, sets, relations, combinatorics, graph theory.', skills: ['Discrete Math', 'Proofs', 'Graph Theory'] },
    { code: 'CS202', name: 'Object Oriented Programming', credits: 3, sem: 2, cat: 'Mandatory', buckets: ['core'], fac: 'F03', prereq: { course: 'CS101' }, desc: 'Abstraction, inheritance, polymorphism and design principles in Java.', skills: ['Java', 'OOP', 'Design Patterns'] },
    { code: 'EE101', name: 'Basic Electronics', credits: 3, sem: 2, cat: 'Mandatory', buckets: ['es'], fac: 'F04', desc: 'Diodes, transistors, amplifiers and instrumentation basics.', skills: ['Electronics'] },
    { code: 'HS201', name: 'Universal Human Values', credits: 2, sem: 2, cat: 'Mandatory', buckets: ['hss'], fac: 'F07', desc: 'Ethics, harmony and professional responsibility.', skills: ['Ethics'] },
    { code: 'CS301', name: 'Database Management Systems', credits: 4, sem: 3, cat: 'Mandatory', buckets: ['core'], fac: 'F04', prereq: { course: 'CS201' }, desc: 'Relational model, SQL, normalisation, indexing, transactions.', skills: ['SQL', 'Data Modelling', 'Transactions', 'Databases'] },
    { code: 'CS303', name: 'Software Engineering', credits: 3, sem: 3, cat: 'Mandatory', buckets: ['core'], fac: 'F03', prereq: { course: 'CS202' }, desc: 'Requirements, architecture, testing, agile process and quality.', skills: ['Software Architecture', 'Testing', 'Agile'] },
    { code: 'CS203', name: 'Computer Organisation & Architecture', credits: 4, sem: 3, cat: 'Mandatory', buckets: ['core', 'es'], fac: 'F04', prereq: { course: 'CS102' }, desc: 'Datapath, pipelining, memory hierarchy and I/O organisation.', skills: ['Computer Architecture', 'Systems'] },
    { code: 'MA201', name: 'Probability & Statistics', credits: 4, sem: 3, cat: 'Mandatory', buckets: ['bsm', 'pe'], fac: 'F05', prereq: { course: 'MA101' }, desc: 'Random variables, distributions, estimation and hypothesis testing.', skills: ['Probability', 'Statistics', 'Data Analysis'] },
    { code: 'OE301', name: 'Design Thinking', credits: 3, sem: 3, cat: 'Open Elective', buckets: ['oe', 'hss'], fac: 'F07', desc: 'Human-centred problem framing, prototyping and validation.', skills: ['User Research', 'Prototyping', 'Product Thinking'] },
    { code: 'HS301', name: 'Engineering Economics', credits: 2, sem: 3, cat: 'Mandatory', buckets: ['hss'], fac: 'F07', desc: 'Cost analysis, depreciation, project evaluation.', skills: ['Economics'] },

    // ——— semester IV — currently registered ———
    { code: 'CS401', name: 'Design Systems', credits: 4, sem: 4, cat: 'Professional Core', buckets: ['core'], fac: 'F01', prereq: { all: [{ course: 'CS202' }, { course: 'OE301' }] }, desc: 'Component architecture, design tokens, accessibility and systematic UI engineering at scale.', skills: ['System Design', 'Architecture', 'Scalability', 'UI Engineering', 'Accessibility'], careers: ['Software Architect', 'Product Engineer', 'Design Engineer'], next: ['CS512', 'CS511'], sections: [{ id: 'A', fac: 'F01', seats: 12, capacity: 60, meetings: [m('Mon', '10:00', '11:00', 'B-204', 'Lecture'), m('Wed', '10:00', '11:00', 'B-204', 'Lecture'), m('Fri', '11:00', '13:00', 'Lab 3', 'Lab')] }] },
    { code: 'CS302', name: 'Operating Systems', credits: 4, sem: 4, cat: 'Professional Core', buckets: ['core'], fac: 'F02', prereq: { all: [{ course: 'CS201' }, { course: 'CS203' }] }, desc: 'Processes, scheduling, concurrency, memory management and file systems.', skills: ['Concurrency', 'Systems Programming', 'Linux'], careers: ['Systems Engineer', 'Backend Engineer'], next: ['CS502', 'CS418'], sections: [{ id: 'A', fac: 'F02', seats: 4, capacity: 60, meetings: [m('Tue', '12:00', '13:00', 'B-210', 'Lecture'), m('Thu', '12:00', '13:00', 'B-210', 'Lecture'), m('Sat', '09:00', '11:00', 'Lab 1', 'Lab')] }] },
    { code: 'CS305', name: 'Design & Analysis of Algorithms', credits: 4, sem: 4, cat: 'Professional Core', buckets: ['core'], fac: 'F06', prereq: { all: [{ course: 'CS201' }, { course: 'MA102' }] }, desc: 'Divide and conquer, greedy, dynamic programming, flows, NP-completeness.', skills: ['Algorithms', 'Optimisation', 'Complexity Analysis'], careers: ['Research Engineer', 'Backend Engineer'], next: ['CS414', 'CS513'], sections: [{ id: 'A', fac: 'F06', seats: 9, capacity: 60, meetings: [m('Mon', '09:00', '10:00', 'B-206', 'Lecture'), m('Wed', '09:00', '10:00', 'B-206', 'Lecture'), m('Thu', '09:00', '10:00', 'B-206', 'Tutorial')] }] },
    { code: 'CS309', name: 'Computer Networks', credits: 3, sem: 4, cat: 'Professional Core', buckets: ['core'], fac: 'F04', prereq: { course: 'CS203' }, desc: 'Layered architecture, TCP/IP, routing, congestion control and security basics.', skills: ['Networking', 'TCP/IP', 'Distributed Systems'], careers: ['Network Engineer', 'Cloud Engineer'], next: ['CS418', 'CS502'], sections: [{ id: 'A', fac: 'F04', seats: 15, capacity: 60, meetings: [m('Mon', '14:00', '15:00', 'B-201', 'Lecture'), m('Thu', '14:00', '15:00', 'B-201', 'Lecture')] }] },
    { code: 'HS401', name: 'Professional Ethics & Law', credits: 2, sem: 4, cat: 'Mandatory', buckets: ['hss'], fac: 'F07', desc: 'IP, contracts, engineering ethics and professional conduct.', skills: ['Ethics', 'IP Law'], sections: [{ id: 'A', fac: 'F07', seats: 22, capacity: 80, meetings: [m('Tue', '15:00', '16:00', 'C-105', 'Lecture')] }] },
    { code: 'CS403', name: 'Mini Project', credits: 1, sem: 4, cat: 'Mandatory', buckets: ['proj'], fac: 'F03', desc: 'Small team-built software artefact with review and demo.', skills: ['Project Delivery', 'Teamwork'], sections: [{ id: 'A', fac: 'F03', seats: 30, capacity: 60, meetings: [m('Fri', '15:00', '17:00', 'Lab 2', 'Project') ] }] },

    // ——— semester IV add/drop catalogue — open for registration ———
    { code: 'CS411', name: 'Theory of Computation', credits: 3, sem: 4, cat: 'Professional Elective', buckets: ['pe', 'bsm'], fac: 'F06', prereq: { course: 'MA102' }, desc: 'Automata, regular and context-free languages, decidability, reductions.', skills: ['Formal Languages', 'Automata', 'Proofs'], careers: ['Research Engineer', 'Compiler Engineer'], next: ['CS416'], sections: [{ id: 'A', fac: 'F06', seats: 18, capacity: 45, meetings: [m('Tue', '10:00', '11:00', 'B-207', 'Lecture'), m('Fri', '09:00', '10:00', 'B-207', 'Lecture')] }, { id: 'B', fac: 'F06', seats: 0, capacity: 45, waitlist: 7, meetings: [m('Wed', '15:00', '16:00', 'B-207', 'Lecture'), m('Sat', '11:00', '12:00', 'B-207', 'Lecture')] }] },
    { code: 'CS412', name: 'Web Systems Engineering', credits: 3, sem: 4, cat: 'Professional Elective', buckets: ['pe'], fac: 'F03', prereq: { any: [{ course: 'CS202' }, { course: 'CS303' }] }, desc: 'Client architecture, state modelling, APIs, caching and deployment pipelines.', skills: ['React', 'API Design', 'Caching', 'UI Engineering'], careers: ['Full Stack Engineer', 'Product Engineer'], next: ['CS511', 'CS418'], sections: [{ id: 'A', fac: 'F03', seats: 7, capacity: 40, meetings: [m('Mon', '10:30', '11:30', 'Lab 4', 'Studio'), m('Thu', '10:00', '11:00', 'Lab 4', 'Studio')] }, { id: 'B', fac: 'F03', seats: 11, capacity: 40, meetings: [m('Tue', '14:00', '15:00', 'Lab 4', 'Studio'), m('Fri', '14:00', '15:00', 'Lab 4', 'Studio')] }, { id: 'C', fac: 'F06', seats: 3, capacity: 40, meetings: [m('Wed', '16:00', '17:00', 'Lab 4', 'Studio'), m('Sat', '11:00', '12:00', 'Lab 4', 'Studio')] }] },
    { code: 'CS414', name: 'Machine Learning Systems', credits: 4, sem: 4, cat: 'Professional Elective', buckets: ['pe'], fac: 'F06', prereq: { any: [{ all: [{ course: 'MA201' }, { course: 'CS305' }] }, { course: 'CS413', minGrade: 'B+' }] }, desc: 'Feature pipelines, model training, evaluation and serving infrastructure.', skills: ['Machine Learning', 'Python', 'Data Pipelines'], careers: ['ML Engineer', 'Data Engineer'], next: ['CS513'], sections: [{ id: 'A', fac: 'F06', seats: 6, capacity: 40, meetings: [m('Tue', '09:00', '10:00', 'B-209', 'Lecture'), m('Thu', '15:00', '16:00', 'B-209', 'Lecture'), m('Sat', '11:00', '13:00', 'Lab 5', 'Lab')] }] },
    { code: 'CS416', name: 'Compiler Design', credits: 4, sem: 4, cat: 'Professional Elective', buckets: ['pe'], fac: 'F02', prereq: { all: [{ course: 'CS203' }, { course: 'CS411' }] }, desc: 'Lexing, parsing, semantic analysis, IR and code generation.', skills: ['Compilers', 'Parsing', 'Systems'], careers: ['Compiler Engineer', 'Systems Engineer'], next: [], sections: [{ id: 'A', fac: 'F02', seats: 20, capacity: 40, meetings: [m('Wed', '12:00', '13:00', 'B-205', 'Lecture'), m('Fri', '12:00', '13:00', 'B-205', 'Lecture')] }] },
    { code: 'CS418', name: 'Cloud Architecture', credits: 3, sem: 4, cat: 'Professional Elective', buckets: ['pe'], fac: 'F04', prereq: { any: [{ all: [{ course: 'CS302' }, { course: 'CS309' }] }, { course: 'CS303', minGrade: 'B+' }] }, desc: 'Virtualisation, containers, orchestration, IaC and cost-aware design.', skills: ['Cloud Deployment', 'Docker', 'Kubernetes', 'Scalability'], careers: ['Cloud Engineer', 'Platform Engineer', 'Software Architect'], next: ['CS502'], sections: [{ id: 'A', fac: 'F04', seats: 14, capacity: 40, meetings: [m('Tue', '16:00', '17:00', 'B-203', 'Lecture'), m('Thu', '16:00', '17:00', 'B-203', 'Lecture')] }] },
    { code: 'CS413', name: 'Applied Linear Algebra for Computing', credits: 3, sem: 4, cat: 'Professional Elective', buckets: ['pe', 'bsm'], fac: 'F05', prereq: { course: 'MA101' }, desc: 'Vector spaces, decompositions, least squares and numerical stability.', skills: ['Linear Algebra', 'Numerical Methods'], careers: ['ML Engineer', 'Research Engineer'], next: ['CS414'], sections: [{ id: 'A', fac: 'F05', seats: 21, capacity: 45, meetings: [m('Mon', '12:00', '13:00', 'A-108', 'Lecture'), m('Wed', '11:00', '12:00', 'A-108', 'Tutorial')] }] },
    { code: 'OE401', name: 'Behavioural Psychology', credits: 3, sem: 4, cat: 'Open Elective', buckets: ['oe', 'hss'], fac: 'F07', desc: 'Cognition, motivation and decision-making applied to product and team settings.', skills: ['Behavioural Science', 'User Research'], careers: ['Product Engineer', 'UX Researcher'], sections: [{ id: 'A', fac: 'F07', seats: 26, capacity: 90, meetings: [m('Wed', '14:00', '15:00', 'C-201', 'Lecture')] }] },
    { code: 'OE402', name: 'Technical Entrepreneurship', credits: 3, sem: 4, cat: 'Open Elective', buckets: ['oe'], fac: 'F07', desc: 'Venture design, unit economics, go-to-market for technical founders.', skills: ['Entrepreneurship', 'Product Thinking'], careers: ['Founder', 'Product Engineer'], sections: [{ id: 'A', fac: 'F07', seats: 0, capacity: 60, waitlist: 12, meetings: [m('Sat', '09:00', '11:00', 'C-203', 'Workshop')] }] },
    { code: 'SE401', name: 'Cloud Practitioner Skill Lab', credits: 2, sem: 4, cat: 'Skill Enhancement', buckets: ['pe'], fac: 'F04', desc: 'Hands-on lab track: provisioning, CI/CD, observability on managed cloud.', skills: ['Cloud Deployment', 'CI/CD', 'Observability'], careers: ['Cloud Engineer', 'Platform Engineer'], sections: [{ id: 'A', fac: 'F04', seats: 8, capacity: 30, meetings: [m('Fri', '10:00', '12:00', 'Lab 6', 'Lab')] }] },
    { code: 'SE402', name: 'Competitive Programming Lab', credits: 2, sem: 4, cat: 'Skill Enhancement', buckets: ['pe'], fac: 'F06', prereq: { course: 'CS201', minGrade: 'B+' }, desc: 'Contest problem solving, time-bound implementation, algorithmic patterns.', skills: ['Algorithms', 'Problem Solving'], careers: ['Software Engineer', 'Research Engineer'], sections: [{ id: 'A', fac: 'F06', seats: 5, capacity: 25, meetings: [m('Sat', '14:00', '16:00', 'Lab 1', 'Lab')] }] },

    // ——— future courses (graph + what-if only) ———
    { code: 'CS502', name: 'Distributed Systems', credits: 4, sem: 5, cat: 'Professional Elective', buckets: ['pe'], fac: 'F02', prereq: { all: [{ course: 'CS302' }, { course: 'CS309' }] }, desc: 'Consensus, replication, consistency models, fault tolerance.', skills: ['Distributed Systems', 'Consensus', 'Scalability'], careers: ['Software Architect', 'Backend Engineer', 'Platform Engineer'], next: [] },
    { code: 'CS511', name: 'Advanced Interface Engineering', credits: 3, sem: 5, cat: 'Professional Elective', buckets: ['pe'], fac: 'F01', prereq: { all: [{ course: 'CS401' }, { course: 'CS412' }] }, desc: 'Rendering performance, animation systems, design-system governance.', skills: ['UI Engineering', 'Performance', 'Design Systems'], careers: ['Product Engineer', 'Design Engineer'], next: [] },
    { code: 'CS512', name: 'Software Architecture Studio', credits: 4, sem: 5, cat: 'Professional Elective', buckets: ['pe'], fac: 'F01', prereq: { all: [{ course: 'CS401' }, { course: 'CS303' }] }, desc: 'Architectural decision records, trade-off analysis, large-system studio.', skills: ['Software Architecture', 'System Design', 'Trade-off Analysis'], careers: ['Software Architect', 'Staff Engineer'], next: [] },
    { code: 'CS513', name: 'Advanced Algorithms', credits: 3, sem: 5, cat: 'Professional Elective', buckets: ['pe'], fac: 'F06', prereq: { course: 'CS305', minGrade: 'B' }, desc: 'Randomisation, approximation, streaming and online algorithms.', skills: ['Algorithms', 'Optimisation'], careers: ['Research Engineer'], next: [] },
    { code: 'CS601', name: 'Internship', credits: 4, sem: 6, cat: 'Mandatory', buckets: ['proj'], fac: 'F03', desc: 'Supervised industry internship with report and evaluation.', skills: ['Industry Practice'], next: [] },
    { code: 'CS701', name: 'Capstone Project', credits: 2, sem: 7, cat: 'Mandatory', buckets: ['proj'], fac: 'F03', desc: 'Year-long capstone under faculty guidance.', skills: ['Project Delivery', 'Research'], next: [] }
  ];

  const BY_CODE = {};
  C.forEach(c => { BY_CODE[c.code] = c; if (!c.sections) c.sections = []; });
  const courseName = (code) => (BY_CODE[code] ? BY_CODE[code].name : code);

  // ---------- transcript ----------
  const TRANSCRIPT = [
    { sem: 1, term: 'Odd 2024-25', courses: [['CS101', 'A', 88], ['MA101', 'B+', 79], ['PH101', 'B', 71], ['HS101', 'A+', 93], ['CS102', 'B+', 82]] },
    { sem: 2, term: 'Even 2024-25', courses: [['CS201', 'A', 90], ['MA102', 'B+', 81], ['CS202', 'B+', 84], ['EE101', 'B', 68], ['HS201', 'A', 89]] },
    { sem: 3, term: 'Odd 2025-26', courses: [['CS301', 'B+', 83], ['CS303', 'C', 64], ['CS203', 'B+', 80], ['MA201', 'B', 72], ['OE301', 'A', 91], ['HS301', 'B+', 85]] }
  ];
  const COMPLETED = {};
  TRANSCRIPT.forEach(s => s.courses.forEach(([code, g]) => { COMPLETED[code] = g; }));

  const REGISTERED_INIT = [
    { code: 'CS401', section: 'A' }, { code: 'CS302', section: 'A' }, { code: 'CS305', section: 'A' },
    { code: 'CS309', section: 'A' }, { code: 'HS401', section: 'A' }, { code: 'CS403', section: 'A' }
  ];

  // ---------- student ----------
  const STUDENT = {
    prn: '12310457', name: 'VAISHNAVI BHAGWAT', first: 'Vaishnavi',
    programme: 'B.Tech Computer Engineering', dept: 'Computer Engineering', deptCode: 'CE',
    year: 'SY', division: 'A', batch: 'A2', sem: 4, semRoman: 'IV', ay: '2026-27',
    email: 'vaishnavi.bhagwat23@vit.edu', phone: '+91 98220 41xxx',
    dob: '14 Mar 2006', gender: 'Female', category: 'OPEN', admission: 'CAP Round I, 2023',
    mentor: 'Prof. Meera Iyer', totalCredits: 120,
    hostel: { allotted: true, name: 'Kaveri Hostel — Girls', block: 'C', room: 'C-214', floor: '2nd Floor', occupancy: 'Triple sharing', warden: 'Dr. Shubhangi Patil', wardenPhone: '+91 20 2437 3XXX', mess: 'Mess II — Vegetarian', checkIn: '22 Jun 2026' }
  };

  // ---------- attendance seed ----------
  const ATT_SEED = { CS401: [32, 37], CS302: [21, 30], CS305: [30, 34], CS309: [19, 22], HS401: [10, 11], CS403: [6, 6] };
  function buildAttendanceHistory() {
    const sessions = {};
    const start = new Date(2026, 6, 20); // 20 Jul 2026, semester start
    for (let d = 0; d < 52; d++) {
      const date = new Date(start.getTime() + d * 86400000);
      const dn = DAYS[date.getDay() - 1];
      if (!dn) continue;
      REGISTERED_INIT.forEach(r => {
        const co = BY_CODE[r.code]; if (!co) return;
        (co.sections.find(s => s.id === r.section) || { meetings: [] }).meetings.forEach(mt => {
          if (mt.day !== dn) return;
          (sessions[r.code] = sessions[r.code] || []).push({ date: date.toISOString().slice(0, 10), type: mt.type, time: mt.start });
        });
      });
    }
    const rows = [];
    Object.keys(sessions).forEach(code => {
      const list = sessions[code], total = list.length;
      const t = ATT_SEED[code] || [9, 10];
      const missing = total - Math.round(total * t[0] / t[1]);
      const excused = missing > 2 ? 1 : 0;
      const marks = new Array(total).fill('Present');
      for (let i = 0; i < missing; i++) marks[Math.floor((i + 0.5) * total / missing)] = i < missing - excused ? 'Absent' : 'Excused';
      list.forEach((s, i) => rows.push({ date: s.date, code, fac: BY_CODE[code].fac, type: s.type, status: marks[i], time: s.time }));
    });
    rows.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    return rows;
  }

  // ---------- lesson plans ----------
  const LESSON_PLANS = {
    CS401: { objectives: ['Model interface systems as composable, versioned components', 'Encode visual decisions as tokens and enforce them programmatically', 'Evaluate accessibility and performance trade-offs in system design'], modules: [
      { n: 1, title: 'Foundations', topics: [['Systems thinking for interfaces', '22 Jul', 1], ['Design tokens & theming', '25 Jul', 1], ['Component anatomy', '29 Jul', 1], ['Documentation as contract', '01 Aug', 1]] },
      { n: 2, title: 'Architecture', topics: [['Composition patterns', '05 Aug', 1], ['State ownership & data flow', '08 Aug', 1], ['Versioning & deprecation', '12 Aug', 1], ['Cross-platform parity', '19 Aug', 1]] },
      { n: 3, title: 'Design Systems in Practice', topics: [['Accessibility contracts', '22 Aug', 1], ['Motion & interaction grammar', '26 Aug', 1], ['Governance and adoption metrics', '02 Sep', 0], ['Systemic testing strategies', '09 Sep', 0]] },
      { n: 4, title: 'Advanced Systems', topics: [['Performance budgets', '16 Sep', 0], ['Multi-brand architecture', '23 Sep', 0], ['System migration case study', '30 Sep', 0], ['Capstone review', '07 Oct', 0]] }
    ] },
    CS302: { objectives: ['Reason about concurrency and scheduling trade-offs', 'Explain virtual memory and file system implementations'], modules: [
      { n: 1, title: 'Processes & Threads', topics: [['OS structure & system calls', '21 Jul', 1], ['Process lifecycle', '23 Jul', 1], ['Threads & context switching', '28 Jul', 1]] },
      { n: 2, title: 'Scheduling', topics: [['CPU scheduling algorithms', '04 Aug', 1], ['Real-time scheduling', '06 Aug', 1], ['Multiprocessor scheduling', '11 Aug', 1]] },
      { n: 3, title: 'Concurrency', topics: [['Critical sections & locks', '18 Aug', 1], ['Semaphores & monitors', '20 Aug', 1], ['Deadlock detection', '25 Aug', 0], ['Classic synchronisation problems', '27 Aug', 0]] },
      { n: 4, title: 'Memory & Storage', topics: [['Paging & segmentation', '01 Sep', 0], ['Virtual memory', '03 Sep', 0], ['File system implementation', '08 Sep', 0], ['I/O subsystems', '15 Sep', 0]] }
    ] },
    CS305: { objectives: ['Select and justify algorithmic strategies', 'Prove correctness and derive complexity bounds'], modules: [
      { n: 1, title: 'Analysis Toolkit', topics: [['Asymptotics & recurrences', '20 Jul', 1], ['Divide and conquer', '22 Jul', 1], ['Master theorem', '27 Jul', 1]] },
      { n: 2, title: 'Greedy & DP', topics: [['Greedy exchange arguments', '03 Aug', 1], ['Dynamic programming', '05 Aug', 1], ['DP on trees and graphs', '10 Aug', 1]] },
      { n: 3, title: 'Graphs & Flows', topics: [['Shortest paths', '17 Aug', 1], ['Max-flow / min-cut', '19 Aug', 1], ['Bipartite matching', '24 Aug', 0], ['Applications of flows', '26 Aug', 0]] },
      { n: 4, title: 'Intractability', topics: [['NP-completeness', '31 Aug', 0], ['Reductions', '02 Sep', 0], ['Approximation algorithms', '07 Sep', 0]] }
    ] },
    CS309: { objectives: ['Trace data through the protocol stack', 'Analyse congestion and routing behaviour'], modules: [
      { n: 1, title: 'Foundations', topics: [['Layering & service models', '20 Jul', 1], ['Physical & link layer', '23 Jul', 1]] },
      { n: 2, title: 'Network Layer', topics: [['IP addressing & subnetting', '30 Jul', 1], ['Routing algorithms', '06 Aug', 1], ['BGP & inter-domain routing', '13 Aug', 1]] },
      { n: 3, title: 'Transport Layer', topics: [['TCP mechanics', '20 Aug', 1], ['Congestion control', '27 Aug', 0], ['QUIC & modern transport', '03 Sep', 0]] },
      { n: 4, title: 'Applications & Security', topics: [['DNS & HTTP', '10 Sep', 0], ['TLS fundamentals', '17 Sep', 0]] }
    ] },
    HS401: { objectives: ['Apply ethical frameworks to engineering decisions'], modules: [
      { n: 1, title: 'Ethical Frameworks', topics: [['Professional codes of conduct', '21 Jul', 1], ['Case studies in engineering failure', '04 Aug', 1]] },
      { n: 2, title: 'Law & IP', topics: [['Contracts & liability', '18 Aug', 1], ['Patents, copyright, licensing', '01 Sep', 0], ['Data protection law', '15 Sep', 0]] }
    ] },
    CS403: { objectives: ['Deliver a working software artefact as a team'], modules: [
      { n: 1, title: 'Delivery', topics: [['Problem statement & scope review', '24 Jul', 1], ['Mid-review demo', '28 Aug', 1], ['Final demo & report', '02 Oct', 0]] }
    ] }
  };

  // ---------- academic calendar ----------
  const CALENDAR = [
    { date: '2026-07-20', end: '2026-07-20', title: 'Semester IV commences', kind: 'academic' },
    { date: '2026-07-27', end: '2026-08-07', title: 'Add / drop window — Semester IV', kind: 'registration' },
    { date: '2026-08-15', end: '2026-08-15', title: 'Independence Day', kind: 'holiday' },
    { date: '2026-08-26', end: '2026-08-26', title: 'Ganesh Chaturthi', kind: 'holiday' },
    { date: '2026-09-07', end: '2026-09-18', title: 'Semester IV subject registration window', kind: 'registration', detail: 'Students may add, drop or swap sections. Credit range 16–24.' },
    { date: '2026-09-14', end: '2026-09-19', title: 'In-semester examination I', kind: 'exam' },
    { date: '2026-09-25', end: '2026-09-25', title: 'Mentor–mentee review', kind: 'academic' },
    { date: '2026-10-02', end: '2026-10-02', title: 'Gandhi Jayanti', kind: 'holiday' },
    { date: '2026-10-12', end: '2026-10-17', title: 'In-semester examination II', kind: 'exam' },
    { date: '2026-10-20', end: '2026-10-24', title: 'Diwali break', kind: 'holiday' },
    { date: '2026-11-02', end: '2026-11-06', title: 'Practical & oral examinations', kind: 'exam' },
    { date: '2026-11-09', end: '2026-11-09', title: 'Last day of instruction', kind: 'academic' },
    { date: '2026-11-16', end: '2026-11-28', title: 'End-semester examination', kind: 'exam' },
    { date: '2026-12-01', end: '2026-12-20', title: 'Winter vacation', kind: 'vacation' },
    { date: '2026-12-22', end: '2026-12-22', title: 'Semester IV results declared', kind: 'academic' },
    { date: '2027-01-04', end: '2027-01-04', title: 'Semester V commences', kind: 'academic' },
    { date: '2027-01-04', end: '2027-01-15', title: 'Semester V registration window', kind: 'registration' },
    { date: '2027-01-26', end: '2027-01-26', title: 'Republic Day', kind: 'holiday' }
  ];

  // ---------- accounts ----------
  const FEES = {
    ay: '2026-27', total: 148500, heads: [
      { head: 'Tuition Fee', amount: 112000, status: 'PAID', date: '18 Jun 2026', receipt: 'VIT/26/TF/0084521', mode: 'Net Banking' },
      { head: 'Development Fee', amount: 14500, status: 'PAID', date: '18 Jun 2026', receipt: 'VIT/26/DF/0084522', mode: 'Net Banking' },
      { head: 'Hostel & Mess', amount: 12000, status: 'PAID', date: '22 Jun 2026', receipt: 'VIT/26/HM/0086110', mode: 'UPI' },
      { head: 'Examination Fee — Semester IV', amount: 6500, status: 'PENDING', due: '20 Sep 2026' },
      { head: 'Library & Laboratory', amount: 3500, status: 'PAID', date: '18 Jun 2026', receipt: 'VIT/26/LL/0084523', mode: 'Net Banking' }
    ]
  };

  // current term; refilled from the semester + calendar_event collections in live mode
  const TERM = { ay: '2026-27', name: 'Odd 2026-27', parity: 'Odd semester', start: '2026-07-20', end: '2026-12-31', startLabel: '20 July 2026', range: 'July – December 2026',
    exam: 'In-semester examination I', examRange: '14 – 19 September 2026' };

  const CERTIFICATES = [
    { id: 'c1', title: 'Advanced Python Programming', issuer: 'VIT Centre for Continuing Education', course: 'CS-CCE-118', date: '2026-05-14', hours: 60, verified: true, grade: 'A' },
    { id: 'c2', title: 'Relational Database Design', issuer: 'VIT Department of Computer Engineering', course: 'CS301-WS', date: '2026-02-27', hours: 30, verified: true, grade: 'A+' },
    { id: 'c3', title: 'Cloud Foundations Bootcamp', issuer: 'VIT Industry Partnership Cell', course: 'IPC-CF-04', date: '2025-12-09', hours: 24, verified: true, grade: 'B+' },
    { id: 'c4', title: 'National Level Hackathon — Finalist', issuer: 'VIT Technical Council', course: 'VITHACK-25', date: '2025-10-18', hours: 36, verified: true, grade: '—' },
    { id: 'c5', title: 'Human-Centred Design Workshop', issuer: 'VIT Design Studio', course: 'OE301-WS', date: '2025-08-30', hours: 16, verified: false, grade: 'A' }
  ];

  const HALL_TICKET = {
    exam: 'In-Semester Examination I — Semester IV', ay: '2026-27', seat: 'B-204-17', centre: 'VIT Pune — Bibwewadi Campus', block: 'Academic Block B',
    papers: [
      { code: 'CS401', date: '14 Sep 2026', day: 'Monday', time: '10:00 – 11:30', venue: 'B-204' },
      { code: 'CS305', date: '15 Sep 2026', day: 'Tuesday', time: '10:00 – 11:30', venue: 'B-206' },
      { code: 'CS302', date: '16 Sep 2026', day: 'Wednesday', time: '14:00 – 15:30', venue: 'B-210' },
      { code: 'CS309', date: '18 Sep 2026', day: 'Friday', time: '10:00 – 11:30', venue: 'B-201' },
      { code: 'HS401', date: '19 Sep 2026', day: 'Saturday', time: '10:00 – 11:00', venue: 'C-105' }
    ],
    instructions: ['Carry this hall ticket and your institute identity card to every paper.', 'Report to the examination hall 20 minutes before the scheduled time.', 'Electronic devices, including smart watches, are not permitted.', 'Non-programmable calculators are permitted for CS305 only.', 'Candidates will not be admitted after 15 minutes from commencement.']
  };

  const PPO = {
    status: 'Eligible — Awaiting Pre-Placement Cycle',
    cycle: 'PPO Cycle 2027 · opens 12 Jan 2027',
    eligibility: [
      { label: 'CGPA ≥ 7.00', ok: true, detail: 'Current CGPA 8.02' },
      { label: 'No active backlogs', ok: true, detail: '0 backlogs across 3 semesters' },
      { label: 'Attendance ≥ 75% aggregate', ok: null, detail: 'Recomputed at cycle open' },
      { label: 'Internship completed', ok: false, detail: 'Scheduled in Semester VI (CS601)' },
      { label: 'Training & Placement registration', ok: true, detail: 'Registered 04 Aug 2026' }
    ],
    dates: [
      { date: '12 Jan 2027', title: 'PPO registration opens', kind: 'registration' },
      { date: '02 Feb 2027', title: 'Aptitude & technical screening', kind: 'exam' },
      { date: '18 Feb 2027', title: 'Company pre-placement talks', kind: 'academic' },
      { date: '10 Mar 2027', title: 'Internship offer roll-out', kind: 'academic' }
    ],
    documents: [
      { name: 'Consolidated Grade Card (Sem I–III)', status: 'Verified' },
      { name: 'Resume — v4', status: 'Verified' },
      { name: 'Aadhaar & PAN', status: 'Verified' },
      { name: 'Internship Offer Letter', status: 'Not submitted' }
    ],
    applications: []
  };

  // ---------- faculty roster ----------
  const ROSTER_NAMES = ['AARAV JOSHI', 'ADITI KALE', 'ANANYA PATIL', 'ARJUN MEHTA', 'ATHARVA SHINDE', 'DEVANSH RAO', 'DIYA CHAVAN', 'EESHA NAIK', 'GAURI SALVI', 'HARSH VARDHAN', 'IRA BHOSALE', 'ISHAAN GUPTA', 'KABIR SHETTY', 'KHUSHI PAWAR', 'MANAV DESAI', 'MEGHA KADAM', 'NEEL SAWANT', 'NIDHI RANE', 'OM PRABHU', 'PRISHA MORE', 'RIYA GOKHALE', 'ROHIT AMBEKAR', 'SAANVI LIMAYE', 'SAI TENDULKAR', 'TANVI GHARGE', 'VAISHNAVI BHAGWAT', 'VEDANT KHOT', 'ZAID SHAIKH'];
  const ROSTER = ROSTER_NAMES.map((n, i) => ({ prn: String(12310430 + i * 3), name: n, roll: 'SEA' + String(i + 1).padStart(2, '0') }));
  // faculty view: each course taught this term with its own class list and attendance so far (mock: two demo courses)
  const TEACHING = ['CS401', 'CS412'].map(code => ({ code, name: courseName(code), section: 'A', sectionId: null,
    students: ROSTER.map((r, i) => ({ prn: r.prn, name: r.name, roll: r.roll, attended: 0, total: 0, pct: 64 + ((i * 37) % 34) })) }));

  // ---------- engines ----------
  function ctxOf(state) {
    const inProgress = {};
    state.registered.forEach(r => { inProgress[r.code] = true; });
    return { completed: state.completed, inProgress };
  }

  // recursive prerequisite expression evaluator → annotated tree
  function evalPrereq(expr, ctx) {
    if (!expr) return { type: 'none', ok: true };
    if (expr.course) {
      const grade = ctx.completed[expr.course];
      const prog = !!ctx.inProgress[expr.course];
      let status = 'missing';
      if (grade !== undefined) status = (!expr.minGrade || gradeMeets(grade, expr.minGrade)) ? 'met' : 'grade';
      else if (prog) status = 'progress';
      return { type: 'course', code: expr.course, name: courseName(expr.course), ok: status === 'met', status, minGrade: expr.minGrade || null, grade: grade || null };
    }
    if (expr.all) { const ch = expr.all.map(e => evalPrereq(e, ctx)); return { type: 'all', ok: ch.every(c => c.ok), children: ch }; }
    if (expr.any) { const ch = expr.any.map(e => evalPrereq(e, ctx)); return { type: 'any', ok: ch.some(c => c.ok), children: ch }; }
    return { type: 'none', ok: true };
  }

  // flatten the blocking leaves of a failed expression
  function blockers(node, out) {
    out = out || [];
    if (node.type === 'course') { if (!node.ok) out.push(node); return out; }
    if (node.type === 'all') { node.children.forEach(c => blockers(c, out)); return out; }
    if (node.type === 'any') {
      if (node.ok) return out;
      // report the cheapest branch: fewest blocking leaves
      let best = null;
      node.children.forEach(c => { const b = blockers(c, []); if (!best || b.length < best.length) best = b; });
      (best || []).forEach(b => out.push(b));
      return out;
    }
    return out;
  }

  function exprToText(expr) {
    if (!expr) return '';
    if (expr.course) return courseName(expr.course) + (expr.minGrade ? ' with Grade ' + expr.minGrade : '');
    if (expr.all) return '(' + expr.all.map(exprToText).join(' AND ') + ')';
    if (expr.any) return '(' + expr.any.map(exprToText).join(' OR ') + ')';
    return '';
  }

  const meetingsOf = (code, sectionId) => {
    const c = BY_CODE[code]; if (!c) return [];
    const s = c.sections.find(x => x.id === sectionId) || c.sections[0];
    return s ? s.meetings : [];
  };

  function overlaps(a, b) { return a.day === b.day && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end); }

  // conflicts of a candidate against the registered plan
  function conflictsFor(state, code, sectionId, skipCode) {
    const mine = meetingsOf(code, sectionId), out = [];
    state.registered.forEach(r => {
      if (r.code === code || r.code === skipCode) return;
      meetingsOf(r.code, r.section).forEach(om => {
        mine.forEach(mm => { if (overlaps(mm, om)) out.push({ with: r.code, withName: courseName(r.code), day: mm.day, a: mm, b: om }); });
      });
    });
    return out;
  }

  function planConflicts(state) {
    const out = [], reg = state.registered;
    for (let i = 0; i < reg.length; i++) for (let j = i + 1; j < reg.length; j++) {
      meetingsOf(reg[i].code, reg[i].section).forEach(am => meetingsOf(reg[j].code, reg[j].section).forEach(bm => {
        if (overlaps(am, bm)) out.push({ a: reg[i].code, b: reg[j].code, aName: courseName(reg[i].code), bName: courseName(reg[j].code), day: am.day, am, bm });
      }));
    }
    return out;
  }

  const creditsOf = (state) => state.registered.reduce((n, r) => n + (BY_CODE[r.code] ? BY_CODE[r.code].credits : 0), 0);
  function weeklyHours(state) {
    let mins = 0;
    state.registered.forEach(r => meetingsOf(r.code, r.section).forEach(mt => { mins += toMin(mt.end) - toMin(mt.start); }));
    return Math.round(mins / 60 * 10) / 10;
  }

  // attendance % per registered subject, derived from the history log
  function attendance(state) {
    const agg = {};
    state.registered.forEach(r => { agg[r.code] = { code: r.code, name: courseName(r.code), attended: 0, total: 0, fac: BY_CODE[r.code].fac }; });
    state.attendanceLog.forEach(row => {
      if (!agg[row.code]) return;
      agg[row.code].total++;
      if (row.status !== 'Absent') agg[row.code].attended++;
    });
    return Object.values(agg).map(a => Object.assign(a, { pct: a.total ? Math.round(a.attended / a.total * 100) : 0 }));
  }

  function attendanceTrend(state) {
    const log = state.attendanceLog.slice().reverse(), pts = [];
    let att = 0, tot = 0, week = -1;
    log.forEach(r => {
      const wk = Math.floor((new Date(r.date) - new Date(TERM.start || r.date)) / (7 * 86400000)); // weeks since the term began
      tot++; if (r.status !== 'Absent') att++;
      if (wk !== week) { week = wk; pts.push({ week: wk + 1, pct: Math.round(att / tot * 100) }); }
      else pts[pts.length - 1] = { week: wk + 1, pct: Math.round(att / tot * 100) };
    });
    return pts;
  }

  // ---------- degree audit: max-flow assignment (NOT greedy) ----------
  function degreeAudit(state, extraCodes) {
    const earned = Object.keys(state.completed).concat(extraCodes || []);
    const reqs = REQUIREMENTS.map(r => Object.assign({}, r, { assigned: 0, courses: [] }));
    const idx = {}; reqs.forEach((r, i) => { idx[r.id] = i; });

    // nodes: 0 = source, 1..n courses, n+1..n+m reqs, sink last
    const cs = earned.map(c => BY_CODE[c]).filter(Boolean);
    const n = cs.length, mm = reqs.length, S = 0, T = n + mm + 1, N = T + 1;
    const cap = Array.from({ length: N }, () => new Array(N).fill(0));
    cs.forEach((c, i) => {
      cap[S][1 + i] = c.credits;
      (c.buckets || []).forEach(b => { if (idx[b] !== undefined) cap[1 + i][1 + n + idx[b]] = c.credits; });
    });
    reqs.forEach((r, j) => { cap[1 + n + j][T] = r.credits; });

    let flow = 0;
    for (;;) { // Edmonds–Karp
      const prev = new Array(N).fill(-1); prev[S] = S;
      const q = [S];
      while (q.length) { const u = q.shift(); for (let v = 0; v < N; v++) if (prev[v] < 0 && cap[u][v] > 0) { prev[v] = u; q.push(v); } }
      if (prev[T] < 0) break;
      let push = Infinity;
      for (let v = T; v !== S; v = prev[v]) push = Math.min(push, cap[prev[v]][v]);
      for (let v = T; v !== S; v = prev[v]) { cap[prev[v]][v] -= push; cap[v][prev[v]] += push; }
      flow += push;
    }

    cs.forEach((c, i) => {
      for (let j = 0; j < mm; j++) {
        const used = cap[1 + n + j][1 + i]; // residual back-edge = assigned credits
        if (used > 0) reqs[j].courses.push({ code: c.code, name: c.name, credits: used, grade: state.completed[c.code] || 'IP', alsoFits: (c.buckets || []).filter(b => b !== reqs[j].id).map(b => (REQUIREMENTS.find(r => r.id === b) || {}).name).filter(Boolean) });
      }
    });
    reqs.forEach(r => { r.assigned = r.courses.reduce((s, c) => s + c.credits, 0); });
    const totalReq = REQUIREMENTS.reduce((s, r) => s + r.credits, 0);
    const multi = cs.filter(c => (c.buckets || []).length > 1).length;
    return { reqs, assigned: flow, totalReq, pct: Math.round(flow / totalReq * 100), multiCount: multi, unassigned: cs.reduce((s, c) => s + c.credits, 0) - flow };
  }

  function gpa(state) {
    let pts = 0, cr = 0;
    Object.keys(state.completed).forEach(code => {
      const c = BY_CODE[code]; if (!c) return;
      pts += GP[state.completed[code]] * c.credits; cr += c.credits;
    });
    if (window.VIT && window.VIT.gradeRelease.released) window.VIT.myMarks().forEach(m => { if (m.grade && !state.completed[m.code]) { pts += GP[m.grade] * m.credits; cr += m.credits; } });
    return { cgpa: cr ? Math.round(pts / cr * 100) / 100 : 0, credits: cr };
  }
  function sgpaOf(sem) {
    const s = TRANSCRIPT.find(t => t.sem === sem); if (!s) return 0;
    let p = 0, c = 0; s.courses.forEach(([code, g]) => { const co = BY_CODE[code]; p += GP[g] * co.credits; c += co.credits; });
    return Math.round(p / c * 100) / 100;
  }

  // what-if: which future courses does adding `codes` unlock?
  function whatIf(state, codes) {
    const completed = Object.assign({}, state.completed);
    state.registered.forEach(r => { if (!completed[r.code]) completed[r.code] = 'B+'; });
    codes.forEach(c => { completed[c] = 'B+'; });
    const ctx = { completed, inProgress: {} };
    const unlocked = C.filter(c => c.sem >= 5 && !completed[c.code] && evalPrereq(c.prereq, ctx).ok);
    const stillBlocked = C.filter(c => c.sem >= 5 && !completed[c.code] && !evalPrereq(c.prereq, ctx).ok)
      .map(c => ({ course: c, blockers: blockers(evalPrereq(c.prereq, ctx)) }));
    const audit = degreeAudit({ completed, registered: [] }, []);
    const remaining = audit.totalReq - audit.assigned;
    const semsNeeded = Math.ceil(remaining / 20);
    return { unlocked, stillBlocked, audit, remaining, gradSem: Math.min(8, 4 + semsNeeded), onTrack: 4 + semsNeeded <= 8 };
  }

  // career derivation from the academic record
  const CAREER_PATHS = [
    { name: 'Software Architect', skills: ['System Design', 'Software Architecture', 'Scalability', 'Distributed Systems', 'Trade-off Analysis'], demand: 'High', median: '₹28 LPA', next: ['CS512', 'CS502', 'CS418'] },
    { name: 'Full Stack Engineer', skills: ['React', 'API Design', 'Databases', 'UI Engineering', 'Caching'], demand: 'Very High', median: '₹18 LPA', next: ['CS412', 'CS511', 'CS418'] },
    { name: 'Product Engineer', skills: ['UI Engineering', 'Product Thinking', 'User Research', 'Design Systems'], demand: 'High', median: '₹21 LPA', next: ['CS511', 'CS412', 'OE401'] },
    { name: 'Systems Engineer', skills: ['Concurrency', 'Systems Programming', 'Computer Architecture', 'Networking'], demand: 'Moderate', median: '₹19 LPA', next: ['CS502', 'CS416'] },
    { name: 'Platform / Cloud Engineer', skills: ['Cloud Deployment', 'Docker', 'Kubernetes', 'Observability', 'CI/CD'], demand: 'Very High', median: '₹22 LPA', next: ['CS418', 'SE401', 'CS502'] },
    { name: 'ML Engineer', skills: ['Machine Learning', 'Python', 'Statistics', 'Linear Algebra', 'Data Pipelines'], demand: 'Very High', median: '₹24 LPA', next: ['CS414', 'CS413'] }
  ];

  function profile(state) {
    const skills = {};
    const add = (list, w) => (list || []).forEach(s => { skills[s] = (skills[s] || 0) + w; });
    Object.keys(state.completed).forEach(code => { const c = BY_CODE[code]; if (c) add(c.skills, GP[state.completed[code]] >= 8 ? 3 : 2); });
    state.registered.forEach(r => { const c = BY_CODE[r.code]; if (c) add(c.skills, 1.5); });
    const ranked = Object.entries(skills).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ skill: k, weight: v }));
    const paths = CAREER_PATHS.map(p => {
      const have = p.skills.filter(s => skills[s]), miss = p.skills.filter(s => !skills[s]);
      // follow-up courses = not yet taken, teach a missing skill (most overlap first); falls back to the path's own list
      const taken = c => state.completed[c.code] || state.registered.some(r => r.code === c.code);
      const picks = C.filter(c => !taken(c) && (c.skills || []).some(sk => miss.indexOf(sk) >= 0))
        .sort((a, b) => b.skills.filter(sk => miss.indexOf(sk) >= 0).length - a.skills.filter(sk => miss.indexOf(sk) >= 0).length).slice(0, 3).map(c => c.code);
      return Object.assign({}, p, { have, miss, next: picks.length ? picks : (p.next || []).filter(c => BY_CODE[c]), fit: Math.round(have.length / p.skills.length * 100) });
    }).sort((a, b) => b.fit - a.fit);
    const direction = state.registered.map(r => BY_CODE[r.code]).filter(c => c && c.cat !== 'Mandatory').map(c => c.name);
    return { skills: ranked, paths, direction };
  }

  // ---------- database backend (live mode): MongoDB via serve.py's /api ----------
  let db = null;                       // db-client (window.VITDB); null = mock mode
  // the server caps each response at 5000 rows, so page until a short page comes back
  async function fetchAll(t, f, from = 0) {
    let r = db.from(t).select('*'); if (f) r = f(r);
    const { data, error } = await r.range(from, from + 4999);
    if (error) throw error;
    return data.length < 5000 ? data : data.concat(await fetchAll(t, f, from + 5000));
  }
  const REQUESTS = [];                 // seat / waiver / swap requests (student: own; faculty: their courses)
  // monthly faculty feedback (see schema.sql): the form for the current month + what the signed-in user needs to see
  // forms = one per month (newest last); the raw submissions / ratings stay here and are summarised on demand
  const FEEDBACK = { forms: [], current: '', questions: [], items: [] };
  const FB = { subs: [], resp: [], mySecs: [], mentees: [] };
  const MARKS = {};                    // enroll_id → { CVV, MSE, ESE, ASSIGN }
  const SUBMITTED = {};                // faculty: section_id → true once final marks are submitted
  const MY_ENROLL = {};                // student: course code → enroll_id (current semester)
  const SECTION_COURSE = {};            // section_id → course code (current semester)
  const SECTION_ID = {};               // 'CS401|A' → section_id (current semester)
  const ENROLL = {};                   // 'prn|CS401' → enroll_id (current semester, the signed-in faculty's sections)
  const MY_SECTION = {};               // course code → the signed-in faculty's section_id
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const fmtDate = (iso) => { if (!iso) return ''; const [y, mo, d] = iso.slice(0, 10).split('-'); return d + ' ' + MON[mo - 1] + ' ' + y; };
  const MONFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayRange = (a, b) => { // '14 – 19 September 2026' (or both months when they differ)
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    if (a === b) return d1 + ' ' + MONFULL[m1 - 1] + ' ' + y1;
    return y1 === y2 && m1 === m2 ? d1 + ' – ' + d2 + ' ' + MONFULL[m1 - 1] + ' ' + y1 : fmtDate(a) + ' – ' + fmtDate(b);
  };
  const hm = (t) => (t || '').slice(0, 5);
  const letter = (gp) => Object.keys(GP).find(k => GP[k] === gp);
  const replace = (arr, items) => { arr.splice(0, arr.length, ...items); };
  const swap = (obj, src) => { Object.keys(obj).forEach(k => delete obj[k]); Object.assign(obj, src); };
  function ago(ts) {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    const d = Math.floor(s / 86400);
    return d === 1 ? 'Yesterday' : d + ' days ago';
  }

  // prerequisite rows → expression: rows in a group are AND-ed, groups are OR-ed
  function prereqOf(code, rows) {
    const groups = {};
    rows.filter(r => r.course_id === code).forEach(r => {
      const leaf = r.min_grade_point > 4 ? { course: r.prereq_course_id, minGrade: letter(r.min_grade_point) } : { course: r.prereq_course_id };
      (groups[r.group_no] = groups[r.group_no] || []).push(leaf);
    });
    const gs = Object.keys(groups).sort((a, b) => a - b).map(k => groups[k].length === 1 ? groups[k][0] : { all: groups[k] });
    return gs.length === 0 ? undefined : gs.length === 1 ? gs[0] : { any: gs };
  }

const blankUser = (name, email, dept, code, ay) => swap(STUDENT, { prn: '', name, first: name.split(' ').filter(w => !/^(Dr\.|Prof\.)$/.test(w))[0] || name, programme: '', dept, deptCode: code, year: '', division: '', batch: '', sem: 0, semRoman: '', ay, email, phone: '', dob: '', gender: '', category: '', admission: '', mentor: '', totalCredits: 0, hostel: { allotted: false } });
  // Load everything the signed-in user may read (RLS scopes it) and refill the objects VIT exposes, in place.
  async function load() {
    const sess = (await db.auth.getSession()).data.session;
    if (!sess) throw new Error('Not signed in.');
    const uid = sess.user.id;
    const q = fetchAll;
    // admin first; the admin collection only returns the caller's own row, so an error just means "not an admin"
    const adm = await db.from('admin').select('*').eq('user_id', uid).then(r => (r.error ? [] : r.data || []), () => []);
    const admin = adm.find(a => a.user_id === uid);
    if (admin) {
      blankUser(admin.name, admin.email, '', '', TERM.ay);
      state = { role: 'admin', facultyId: null, admin: { id: admin.admin_id, name: admin.name, email: admin.email },
        completed: {}, registered: [], attendanceLog: [], lessonDone: {}, facultySubmissions: [], notifications: [], toasts: state.toasts };
      return;
    }
    const [facs, sems, studs, depts, progs] = await Promise.all([q('faculty'), q('semester', r => r.order('sem_id')), q('student'), q('department'), q('program')]);
    const me = facs.find(f => f.user_id === uid);
    const stu = me ? null : studs.find(s => s.user_id === uid);
    if (!me && !stu) throw new Error('This account is not linked to a student or faculty record.');
    const cur = sems[sems.length - 1] || {}; // current semester = max sem_id
    const own = (t, f) => me ? Promise.resolve([]) : q(t, f);
    // faculty only need enrolments in their own sections this term (the table holds every student's history)
    const mySecIds = me ? (await q('section', r => r.eq('faculty_id', me.faculty_id).eq('sem_id', cur.sem_id))).map(s => s.section_id) : [];
    const [courses, prereqs, cats, preqs, sections, meetings, enrolls, trans, att, plans, progress, cal, fees, certs, hostels, tickets, papers, notes, subs] = await Promise.all([
      q('course'), q('prerequisite', r => r.order('group_no')), q('requirement_category'), q('program_requirement'),
      q('section', r => r.order('section_code')), q('section_meeting', r => r.order('id')),
      me ? (mySecIds.length ? q('enrollment', r => r.in('section_id', mySecIds)) : Promise.resolve([])) : q('enrollment', r => r.order('enroll_id')),
      own('transcript', r => r.order('sem_id')), own('attendance'), q('lesson_plan'), q('lesson_progress'),
      q('calendar_event', r => r.order('start_on')), own('fee', r => r.order('id')), own('certificate', r => r.order('issued_on', { ascending: false })),
      own('hostel_allotment'), own('hall_ticket'), q('exam_paper', r => r.order('held_on')),
      q('notification', r => r.order('created_at', { ascending: false })), me ? q('attendance_submission', r => r.order('created_at', { ascending: false })) : Promise.resolve([])
    ]);
    const [cpaths, ppoEvents, ppoApps, reqs] = await Promise.all([q('career_path'), q('ppo_event', r => r.order('on_date')), own('ppo_application', r => r.order('id')), q('request', r => r.order('id'))]);
    if (cpaths.length) replace(CAREER_PATHS, cpaths.map(p => ({ name: p.name, skills: p.skills, demand: p.demand, median: p.median })));
    const deptName = (id) => (depts.find(d => d.dept_id === id) || {}).dept_name || id;

    swap(FACULTY, Object.fromEntries(facs.map(f => [f.faculty_id, { id: f.faculty_id, name: f.name, short: f.short_name, email: f.email, dept: deptName(f.dept_id), desig: f.designation, cabin: f.cabin }])));
    replace(REQUIREMENTS, cats.map(c => ({ id: c.category, name: c.name, credits: c.credits, note: c.note })));

    if (me) blankUser(me.name, me.email, deptName(me.dept_id), me.dept_id, cur.year);
    const progId = stu ? stu.program_id : (progs.find(p => p.dept_id === me.dept_id) || progs[0] || {}).program_id;
    const buckets = {};
    preqs.filter(r => r.program_id === progId).forEach(r => { (buckets[r.course_id] = buckets[r.course_id] || []).push(r.category); });

    const secById = {};
    sections.forEach(s => { secById[s.section_id] = s; });
    const curSecs = sections.filter(s => s.sem_id === cur.sem_id);
    [SECTION_ID, ENROLL, MY_SECTION, SECTION_COURSE, MARKS, MY_ENROLL, SUBMITTED].forEach(o => swap(o, {}));
    curSecs.forEach(s => {
      SECTION_ID[s.course_id + '|' + s.section_code] = s.section_id; SECTION_COURSE[s.section_id] = s.course_id;
      if (me && s.faculty_id === me.faculty_id && !MY_SECTION[s.course_id]) MY_SECTION[s.course_id] = s.section_id;
    });
    replace(C, courses.map(c => {
      const o = {
        code: c.course_id, name: c.title, credits: c.credits, sem: c.sem_no, cat: c.course_type, buckets: buckets[c.course_id] || [],
        fac: c.coordinator_id, desc: c.description, skills: c.skills || [],
        sections: curSecs.filter(s => s.course_id === c.course_id).map(s => ({
          id: s.section_code, fac: s.faculty_id, seats: s.seats, capacity: s.capacity,
          meetings: meetings.filter(mt => mt.section_id === s.section_id).map(mt => m(mt.day, hm(mt.start_time), hm(mt.end_time), mt.room, mt.type))
        }))
      };
      const p = prereqOf(c.course_id, prereqs); if (p) o.prereq = p;
      if (c.careers && c.careers.length) o.careers = c.careers;
      if (c.next && c.next.length) o.next = c.next;
      return o;
    }));
    swap(BY_CODE, {});
    C.forEach(c => { BY_CODE[c.code] = c; });

    // transcript view → [{sem, term, courses:[[code, grade, marks]]}], sem = order of term
    const bySem = {};
    trans.forEach(t => { (bySem[t.sem_id] = bySem[t.sem_id] || { term: t.term_name, courses: [] }).courses.push([t.course_id, t.grade, t.marks]); });
    replace(TRANSCRIPT, Object.keys(bySem).sort((a, b) => a - b).map((k, i) => ({ sem: i + 1, term: bySem[k].term, courses: bySem[k].courses })));
    const completed = {};
    TRANSCRIPT.forEach(s => s.courses.forEach(([code, g]) => { completed[code] = g; }));

    const registered = [], enrollCode = {};
    enrolls.forEach(e => {
      const s = secById[e.section_id]; if (!s) return;
      enrollCode[e.enroll_id] = s.course_id;
      if (s.sem_id !== cur.sem_id) return;
      if (me && s.faculty_id === me.faculty_id) ENROLL[e.student_id + '|' + s.course_id] = e.enroll_id; // RLS: faculty mark only their own sections
      if (stu && e.student_id === stu.student_id && e.grade_point == null) { registered.push({ code: s.course_id, section: s.section_code }); MY_ENROLL[s.course_id] = e.enroll_id; }
    });
    const attendanceLog = att.filter(a => enrollCode[a.enroll_id])
      .map(a => ({ date: a.held_on, code: enrollCode[a.enroll_id], fac: a.faculty_id, type: a.type, status: a.status, time: hm(a.held_at) }))
      .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

    const done = {};
    progress.forEach(p => { done[p.course_id + '|' + p.module_n + '|' + p.topic] = p.done; });
    swap(LESSON_PLANS, Object.fromEntries(plans.map(p => [p.course_id, {
      objectives: p.objectives,
      modules: p.modules.map(mo => ({ n: mo.n, title: mo.title, topics: mo.topics.map(t => [t[0], t[1], done[p.course_id + '|' + mo.n + '|' + t[0]] ? 1 : 0]) }))
    }])));

    replace(CALENDAR, cal.map(e => Object.assign({ date: e.start_on, end: e.end_on, title: e.title, kind: e.kind }, e.detail ? { detail: e.detail } : {})));

    const evs = cal.filter(e => e.sem_id === cur.sem_id);
    if (evs.length) {
      const lo = evs.map(e => e.start_on).sort()[0], hi = evs.map(e => e.end_on).sort().pop();
      const ex = evs.filter(e => e.kind === 'exam').sort((a, b) => (a.start_on < b.start_on ? -1 : 1))[0];
      const [ly, lm] = lo.split('-').map(Number), [hy, hm2] = hi.split('-').map(Number);
      swap(TERM, { ay: cur.year, name: cur.term_name, parity: cur.term_name.split(' ')[0] + ' semester', start: lo, end: hi, startLabel: dayRange(lo, lo),
        range: ly === hy ? MONFULL[lm - 1] + ' – ' + MONFULL[hm2 - 1] + ' ' + hy : MONFULL[lm - 1] + ' ' + ly + ' – ' + MONFULL[hm2 - 1] + ' ' + hy,
        exam: ex ? ex.title : '', examRange: ex ? dayRange(ex.start_on, ex.end_on) : '' });
    } else swap(TERM, { ay: cur.year, name: cur.term_name, parity: cur.term_name.split(' ')[0] + ' semester', start: '', end: '', startLabel: '', range: '', exam: '', examRange: '' });

    const ay = fees.some(f => f.year === cur.year) ? cur.year : (fees.length ? fees[fees.length - 1].year : cur.year);
    const heads = fees.filter(f => f.year === ay).map(f => f.status === 'PAID'
      ? { id: f.id, head: f.head, amount: f.amount, status: f.status, date: fmtDate(f.paid_on), receipt: f.receipt, mode: f.mode }
      : { id: f.id, head: f.head, amount: f.amount, status: f.status, due: fmtDate(f.due_on) });
    swap(FEES, { ay, total: heads.reduce((s, h) => s + h.amount, 0), heads });

    replace(CERTIFICATES, certs.map(c => ({ id: 'c' + c.id, title: c.title, issuer: c.issuer, course: c.ref_code, date: c.issued_on, hours: c.hours, verified: c.verified, grade: c.grade })));

    // hall ticket: this semester's papers for the courses the user takes (student) or teaches (faculty)
    const ht = tickets.filter(t => t.sem_id === cur.sem_id).pop();
    const exam = ht ? ht.exam : (papers.find(p => p.sem_id === cur.sem_id) || {}).exam;
    const mine = me ? Object.keys(MY_SECTION) : registered.map(r => r.code);
    swap(HALL_TICKET, {
      exam: exam || '', ay: cur.year, seat: ht ? ht.seat : '', centre: ht ? ht.centre : '', block: ht ? ht.block : '',
      papers: papers.filter(p => p.sem_id === cur.sem_id && (me || p.exam === exam) && mine.indexOf(p.course_id) >= 0)  // faculty: papers of every course they teach
        .map(p => ({ code: p.course_id, date: fmtDate(p.held_on), day: WEEKDAY[new Date(p.held_on + 'T00:00:00').getDay()], time: p.time_slot, venue: p.venue })),
      instructions: ht ? ht.instructions : []
    });

    if (stu) {
      const prog = progs.find(p => p.program_id === stu.program_id) || {};
      const h = hostels[0];
      swap(STUDENT, {
        prn: stu.student_id, name: stu.name, first: stu.first_name, programme: prog.program_name, dept: deptName(stu.dept_id), deptCode: stu.dept_id,
        year: stu.year, division: stu.division, batch: stu.batch, sem: stu.current_sem, semRoman: ROMAN[stu.current_sem - 1], ay: cur.year,
        email: stu.email, phone: stu.phone, dob: fmtDate(stu.dob), gender: stu.gender, category: stu.category, admission: stu.admission,
        mentor: (FACULTY[stu.mentor_id] || {}).name, totalCredits: prog.total_credits,
        hostel: h ? { allotted: true, name: h.hostel, block: h.block, room: h.room, floor: h.floor, occupancy: h.occupancy, warden: h.warden, wardenPhone: h.warden_phone, mess: h.mess, checkIn: fmtDate(h.check_in) } : { allotted: false }
      });
    }

    // faculty roster = students enrolled in the faculty's sections this semester
    const mySecs = curSecs.filter(s => me && s.faculty_id === me.faculty_id).map(s => s.section_id);
    const prns = new Set(enrolls.filter(e => mySecs.indexOf(e.section_id) >= 0).map(e => e.student_id));
    replace(ROSTER, studs.filter(s => prns.has(s.student_id)).sort((a, b) => a.name < b.name ? -1 : 1).map(s => ({ prn: s.student_id, name: s.name, roll: s.roll })));
    const myEnrolls = enrolls.filter(e => mySecs.indexOf(e.section_id) >= 0);
    (me ? (myEnrolls.length ? await q('assessment', r => r.in('enroll_id', myEnrolls.map(e => e.enroll_id))) : []) : await q('assessment'))
      .forEach(a => { (MARKS[a.enroll_id] = MARKS[a.enroll_id] || {})[a.component] = a.marks; });
    if (me) (await q('marks_submission')).forEach(m => { SUBMITTED[m.section_id] = true; });
    const tally = {};
    (myEnrolls.length ? await q('attendance', r => r.in('enroll_id', myEnrolls.map(e => e.enroll_id))) : []).forEach(a => {
      const t = tally[a.enroll_id] = tally[a.enroll_id] || { att: 0, tot: 0 }; t.tot++; if (a.status !== 'Absent') t.att++;
    });
    const stuById = {};
    studs.forEach(x => { stuById[x.student_id] = x; });
    replace(TEACHING, curSecs.filter(x => mySecs.indexOf(x.section_id) >= 0).map(x => ({
      code: x.course_id, name: (BY_CODE[x.course_id] || {}).name || x.course_id, section: x.section_code, sectionId: x.section_id,
      students: myEnrolls.filter(e => e.section_id === x.section_id).map(e => {
        const p = stuById[e.student_id] || {}, t = tally[e.enroll_id] || { att: 0, tot: 0 };
        return { prn: e.student_id, enrollId: e.enroll_id, name: p.name || e.student_id, roll: p.roll || '', attended: t.att, total: t.tot, pct: t.tot ? Math.round(t.att / t.tot * 100) : 0 };
      }).sort((a, b) => (a.roll < b.roll ? -1 : a.roll > b.roll ? 1 : 0))
    })).sort((a, b) => (a.code < b.code ? -1 : 1)));

    const today = new Date().toISOString().slice(0, 10);
    const regc = stu ? (await own('reg_confirmation')).find(r => r.sem_id === cur.sem_id) : null;
    swap(VIT.regConfirm, { confirmed: !!regc, at: regc ? regc.confirmed_at : null });
    swap(VIT.gradeRelease, { date: cur.grades_release || null, released: !!cur.grades_release && today >= cur.grades_release });
    swap(VIT.registrationWindow, { open: !!cur.reg_opens && today >= cur.reg_opens && today <= cur.reg_closes, opens: cur.reg_opens, closes: cur.reg_closes, min: cur.min_credits, max: cur.credit_cap });

    const stuName = Object.fromEntries(studs.map(x => [x.student_id, x.name]));
    replace(REQUESTS, reqs.map(r => ({ id: r.id, prn: r.student_id, student: stuName[r.student_id] || r.student_id, code: r.course_id, kind: r.kind, reason: r.reason || '', status: r.status })));

    // ---- monthly feedback ----
    const [fbQ, fbForms] = await Promise.all([q('feedback_question', r => r.order('id')), q('feedback_form', r => r.order('month'))]);
    const myMentees = me ? studs.filter(x => x.mentor_id === me.faculty_id).sort((a, b) => (a.division + a.roll < b.division + b.roll ? -1 : 1)) : [];
    const fbSubs = stu ? await q('feedback_submission') : me ? (await Promise.all([
      mySecIds.length ? q('feedback_submission', r => r.in('section_id', mySecIds)) : [], myMentees.length ? q('feedback_submission', r => r.in('student_id', myMentees.map(x => x.student_id))) : []])).flat() : [];
    const fbResp = me ? await q('feedback_response') : [];
    const menteeEnr = myMentees.length ? await q('enrollment', r => r.in('student_id', myMentees.map(x => x.student_id))) : [];
    const facName = (id) => (FACULTY[id] || {}).name || id;
    const pad = (n) => String(n).padStart(2, '0');
    const forms = fbForms.map((f, i) => {
      const y = +f.month.slice(0, 4), mo = +f.month.slice(5), last = new Date(y, mo, 0).getDate();
      return { month: f.month, number: i + 1, label: MONFULL[mo - 1] + ' ' + y, ay: mo >= 7 ? y + '-' + String(y + 1).slice(2) : (y - 1) + '-' + String(y).slice(2),
        start: '01-' + pad(mo) + '-' + y + ' 10:00 AM', end: pad(last) + '-' + pad(mo) + '-' + y + ' 06:00 PM' };
    });
    FB.subs = fbSubs; FB.resp = fbResp;
    FB.mySecs = me ? curSecs.filter(x => x.faculty_id === me.faculty_id).map(x => ({ sectionId: x.section_id, code: x.course_id, name: (BY_CODE[x.course_id] || {}).name || x.course_id, section: x.section_code })).sort((a, b) => (a.code < b.code ? -1 : 1)) : [];
    FB.mentees = myMentees.map(x => ({ prn: x.student_id, name: x.name, roll: x.roll, division: x.division,
      secs: menteeEnr.filter(e => e.student_id === x.student_id && (secById[e.section_id] || {}).sem_id === cur.sem_id).map(e => e.section_id) }));
    swap(FEEDBACK, {
      forms, current: forms.length ? forms[forms.length - 1].month : '', questions: fbQ,
      items: stu ? registered.map(r => ({ sectionId: SECTION_ID[r.code + '|' + r.section], code: r.code, name: (BY_CODE[r.code] || {}).name || r.code, facultyId: (secById[SECTION_ID[r.code + '|' + r.section]] || {}).faculty_id }))
        .filter(x => x.sectionId).map(x => Object.assign(x, { facultyName: facName(x.facultyId) })) : []
    });

    state = {
      role: me ? 'faculty' : 'student', facultyId: me ? me.faculty_id : null,
      hodOf: me ? (depts.find(d => d.hod_name === me.name) || {}).dept_id || null : null,
      completed, registered, attendanceLog, lessonDone: lessonDoneOf(),
      facultySubmissions: subs.filter(s => s.faculty_id === me.faculty_id && secById[s.section_id])
        .map(s => ({ code: secById[s.section_id].course_id, date: s.held_on, present: s.present, total: s.total, at: new Date(s.created_at).getTime() })),
      notifications: notes.map(n => ({ id: 'n' + n.id, title: n.title, body: n.body, kind: n.kind, time: ago(n.created_at), read: n.read })),
      toasts: state.toasts
    };
    if (stu) buildPpo(ppoEvents, ppoApps);
  }

  // PPO page from real records: eligibility is computed, dates come from ppo_event, applications from ppo_application
  function buildPpo(events, apps) {
    const g = gpa(state), att = attendance(state), tot = att.reduce((n, a) => n + a.total, 0), got = att.reduce((n, a) => n + a.attended, 0);
    const backlogs = Object.keys(state.completed).filter(c => state.completed[c] === 'F').length;
    const intern = Object.keys(state.completed).some(c => BY_CODE[c] && /internship/i.test(BY_CODE[c].name));
    const eligibility = [
      { label: 'CGPA ≥ 7.00', ok: g.cgpa >= 7, detail: 'Current CGPA ' + g.cgpa.toFixed(2) },
      { label: 'No active backlogs', ok: backlogs === 0, detail: backlogs + ' backlog' + (backlogs === 1 ? '' : 's') },
      { label: 'Attendance ≥ 75% aggregate', ok: tot ? got / tot >= 0.75 : null, detail: tot ? Math.round(got / tot * 100) + '% this term' : 'No sessions recorded yet' },
      { label: 'Internship completed', ok: intern, detail: intern ? 'Internship course passed' : 'Not completed yet' }
    ];
    const first = events[0];
    swap(PPO, {
      status: eligibility.some(e => e.ok === false) ? 'Not yet eligible' : eligibility.some(e => e.ok === null) ? 'Eligibility pending' : 'Eligible',
      cycle: first ? 'PPO cycle · opens ' + fmtDate(first.on_date) : 'No PPO cycle scheduled',
      eligibility, dates: events.map(e => ({ date: fmtDate(e.on_date), title: e.title, kind: e.kind })),
      documents: [
        { name: 'Consolidated Grade Card', status: TRANSCRIPT.length ? 'Verified' : 'Not available' },
        { name: 'Certificates', status: CERTIFICATES.some(c => c.verified) ? 'Verified' : 'Not submitted' },
        { name: 'Internship Offer Letter', status: apps.some(a => a.status === 'Offer') ? 'Verified' : 'Not submitted' }
      ],
      applications: apps.map(a => ({ id: a.id, company: a.company, role: a.role, status: a.status, date: fmtDate(a.created_at) })),
      eligible: eligibility.every(e => e.ok !== false)
    });
  }

  // Optimistic write: local state is already updated; on failure undo it and tell the user.
  function sync(call, revert, title) {
    if (!db) return;
    Promise.resolve().then(call).then(r => { if (r && r.error) throw r.error; })
      .catch(e => { revert(); VIT.toast({ kind: 'err', title, body: e.message }); });
  }

  // ---------- admin console: generic table access (RLS lets only admins write) ----------
  const errText = (e) => [e.message, e.details, e.hint ? '(' + e.hint + ')' : '', e.code ? '[' + e.code + ']' : ''].filter(Boolean).join(' ');
  const must = (p) => Promise.resolve(p).then(r => { if (r.error) throw new Error(errText(r.error)); return r; });
  const needLive = () => { if (!db) throw new Error('Admin console needs the database — open the portal through serve.py (python serve.py).'); };

  // ---------- timetable generator (same rules as data/build_timetable.py) ----------
  // Students with the same course list form a cohort, split into ceil(n / capacity) class groups; each group gets a
  // section of every course. Faculty come from the course's department, least-loaded first, ≤ maxHours a week, never two
  // groups of one course. Hard: no group / faculty / lab-room clash, a subject at most once a day. Soft: 4-credit subjects
  // share a day as rarely as possible. Lectures = min(credits, 3) one-hour slots; laboratory / project = one 2-hour block.
  const sectionLetters = (n) => { let s = ''; for (n += 1; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }; // 0→A, 26→AA
  const TT_SLOTS = [['09:00', '10:00'], ['10:00', '11:00'], ['11:15', '12:15'], ['12:15', '13:15'], ['14:00', '15:00'], ['15:00', '16:00']];
  const TT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const TT_PAIRS = [[4, 5], [2, 3], [0, 1]]; // 2-hour blocks, afternoon first
  function planTimetable({ students, faculty, courses, reqs }, opts) {
    const cap = (opts && opts.capacity) || 60, maxH = (opts && opts.maxHours) || 18, tries = (opts && opts.tries) || 300;
    const CO = Object.fromEntries(courses.map(c => [c.course_id, c]));
    const progCourses = {};
    reqs.forEach(r => { (progCourses[r.program_id] = progCourses[r.program_id] || new Set()).add(r.course_id); });
    const listOf = st => Array.from(progCourses[st.program_id] || []).filter(c => CO[c] && CO[c].sem_no === st.current_sem).sort();
    const isBlock = c => /laboratory|project|\blab$/i.test(c.title);
    const blocksOf = c => isBlock(c) ? [[2, /lab/i.test(c.title) ? 'Lab' : 'Project']] : Array(Math.min(3, c.credits)).fill([1, 'Lecture']);
    const important = c => c.credits >= 4;

    const cohorts = {};
    students.forEach(st => { const cl = listOf(st); if (cl.length) (cohorts[cl.join(',')] = cohorts[cl.join(',')] || []).push(st); });
    const groups = [];
    Object.values(cohorts).sort((a, b) => a[0].current_sem - b[0].current_sem || (a[0].program_id < b[0].program_id ? -1 : 1)).forEach(sts => {
      sts.sort((a, b) => ((a.division || '') + (a.roll || '') + a.student_id < (b.division || '') + (b.roll || '') + b.student_id ? -1 : 1));
      const k = Math.ceil(sts.length / cap), size = Math.ceil(sts.length / k);
      const progs = Array.from(new Set(sts.map(s => s.program_id.replace('BTECH-', '')))).sort();
      const label = (sts[0].year || 'S' + sts[0].current_sem) + ' ' + (progs.length <= 2 ? progs.join('/') : 'common');
      for (let i = 0; i < k; i++) groups.push({ name: label + (k > 1 ? ' G' + (i + 1) : ''), students: sts.slice(i * size, (i + 1) * size), courses: listOf(sts[0]) });
    });
    const sections = [], codeN = {};
    groups.forEach((g, gi) => g.courses.forEach(c => {
      codeN[c] = (codeN[c] || 0) + 1;
      sections.push({ course: c, group: gi, code: sectionLetters(codeN[c] - 1), blocks: blocksOf(CO[c]), dept: CO[c].dept_id });
    }));
    const pool = {};
    faculty.forEach(f => { (pool[f.dept_id] = pool[f.dept_id] || []).push(f.faculty_id); });
    const missing = Array.from(new Set(sections.filter(s => !pool[s.dept]).map(s => s.dept)));
    if (missing.length) throw new Error('No faculty in department ' + missing.join(', ') + ' — add faculty before generating.');
    const home = groups.map((g, gi) => CO[g.courses[0]].dept_id + '-' + (101 + gi));

    function attempt(seed) {
      const rnd = lcg(seed * 7919 + 1);
      const busyG = {}, busyF = {}, busyR = {}, dayCourse = {}, impDay = {}, loadG = {}, loadF = {}, hours = {}, taught = {}, plan = [];
      const has = (o, k, cell) => o[k] && o[k].has(cell), add = (o, k, cell) => { (o[k] = o[k] || new Set()).add(cell); };
      const order = sections.map((s, i) => [i, -s.blocks.reduce((n, b) => n + b[0], 0), rnd()]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
      for (const i of order) {
        const s = sections[i], g = s.group, c = CO[s.course], need = s.blocks.reduce((n, b) => n + b[0], 0);
        const cands = pool[s.dept].map(f => [f, (taught[f] && taught[f].has(s.course)) ? 1 : 0, hours[f] || 0, rnd()])
          .sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3]).map(x => x[0]);
        let placed = null;
        for (const f of cands) {
          if ((hours[f] || 0) + need > maxH) continue;
          const mtg = [], used = new Set();
          for (const [len, type] of s.blocks) {
            let best = null;
            for (let d = 0; d < 5; d++) {
              if (used.has(d) || has(dayCourse, g, s.course + d)) continue;
              for (const slots of (len === 2 ? TT_PAIRS : TT_SLOTS.map((_, x) => [x]))) {
                const room = len === 2 && type === 'Lab' ? s.dept + '-LAB' + (1 + g % 3) : home[g];
                if (slots.some(x => has(busyG, g, d + ':' + x) || has(busyF, f, d + ':' + x) || (type === 'Lab' && has(busyR, room, d + ':' + x)))) continue;
                const cost = (important(c) ? 12 * (impDay[g + ':' + d] || 0) : 0) + 2 * (loadG[g + ':' + d] || 0) + (loadF[f + ':' + d] || 0)
                           + (len === 2 ? 0 : 0.3 * slots[0]) + rnd() * 0.5;
                if (!best || cost < best.cost) best = { cost, d, slots, room, type };
              }
            }
            if (!best) break;
            used.add(best.d); mtg.push(best);
          }
          if (mtg.length === s.blocks.length) { placed = { f, mtg }; break; }
        }
        if (!placed) return null;
        placed.mtg.forEach(({ d, slots, room, type }) => {
          slots.forEach(x => { add(busyG, g, d + ':' + x); add(busyF, placed.f, d + ':' + x); if (type === 'Lab') add(busyR, room, d + ':' + x); });
          add(dayCourse, g, s.course + d);
          loadG[g + ':' + d] = (loadG[g + ':' + d] || 0) + slots.length; loadF[placed.f + ':' + d] = (loadF[placed.f + ':' + d] || 0) + slots.length;
          if (important(c)) impDay[g + ':' + d] = (impDay[g + ':' + d] || 0) + 1;
        });
        hours[placed.f] = (hours[placed.f] || 0) + need; add(taught, placed.f, s.course); plan[i] = placed;
      }
      return { plan, hours, impDay };
    }
    let res = null;
    for (let seed = 0; seed < tries && !res; seed++) res = attempt(seed);
    if (!res) throw new Error('Could not build a clash-free timetable — add faculty or raise the weekly hour limit.');

    // independent re-check of the hard rules
    const seen = new Set();
    res.plan.forEach((p, i) => {
      const s = sections[i];
      if (new Set(p.mtg.map(m => m.d)).size !== p.mtg.length) throw new Error(s.course + ' meets twice a day');
      p.mtg.forEach(m => m.slots.forEach(x => ['g' + s.group, 'f' + p.f].concat(m.type === 'Lab' ? ['r' + m.room] : []).forEach(k => {
        const key = k + '@' + m.d + ':' + x; if (seen.has(key)) throw new Error('Clash at ' + key); seen.add(key);
      })));
    });

    const deptStudents = {};
    students.forEach(st => { deptStudents[st.dept_id] = (deptStudents[st.dept_id] || 0) + 1; });
    const depts = Object.keys(pool).sort().map(d => {
      const h = pool[d].map(f => res.hours[f] || 0), secs = sections.filter(s => s.dept === d).length;
      return { dept: d, students: deptStudents[d] || 0, sections: secs, faculty: pool[d].length, used: h.filter(Boolean).length,
               minH: Math.min(...h), maxH: Math.max(...h), avgH: Math.round(h.reduce((a, b) => a + b, 0) / h.length * 10) / 10 };
    });
    const out = sections.map((s, i) => ({
      course: s.course, code: s.code, faculty: res.plan[i].f, group: s.group, students: groups[s.group].students.map(st => st.student_id),
      meetings: res.plan[i].mtg.map(m => ({ day: TT_DAYS[m.d], start: TT_SLOTS[m.slots[0]][0], end: TT_SLOTS[m.slots[m.slots.length - 1]][1], room: m.room, type: m.type }))
    }));
    return { capacity: cap, groups: groups.map(g => ({ name: g.name, size: g.students.length })), sections: out, depts,
             maxHours: Math.max(0, ...Object.values(res.hours)), sharedImportantDays: Object.values(res.impDay).filter(v => v > 1).length };
  }

  // Admin activity log → MongoDB through serve.py's /api/activity (best-effort: never blocks or fails an admin action)
  async function api(method, body, query) {
    const session = (await db.auth.getSession()).data.session;
    if (!session) throw new Error('Not signed in.');
    const res = await fetch('/api/activity' + (query || ''), { method, headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', Authorization: 'Bearer ' + session.access_token }, body: body && JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Activity log request failed (' + res.status + ')');
    return out;
  }
  const logActivity = (action, table, detail) => { api('POST', { action, table, detail }).catch(() => {}); };

  const ADMIN = {
    // → { rows, count }: pages past PostgREST's 1000-row cap, up to opts.limit rows (count is always the full total)
    async list(table, opts) {
      needLive();
      const cap = (opts && opts.limit) || 20000;
      const head = await must(db.from(table).select('*', { count: 'exact', head: true }));
      const rows = [];
      while (rows.length < Math.min(cap, head.count)) {
        let r = db.from(table).select('*');
        ((opts && opts.order) || []).forEach(c => { r = r.order(c); });
        const page = (await must(r.range(rows.length, rows.length + 999))).data;
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return { rows: rows.slice(0, cap), count: head.count };
    },
    async insert(table, values) {
      needLive();
      const row = (await must(db.from(table).insert(values).select())).data[0];
      logActivity('insert', table, values);
      return row;
    },
    async update(table, pk, values) {
      needLive();
      const res = await must(db.from(table).update(values).match(pk).select());
      if (!res.data || !res.data.length) throw new Error('No row was updated — it may have been deleted, or you lack permission.');
      logActivity('update', table, { key: pk, changes: values });
      return res.data[0];
    },
    async remove(table, pk) {
      needLive();
      const res = await must(db.from(table).delete().match(pk).select());
      if (!res.data || !res.data.length) throw new Error('No row was deleted — it may already be gone, or you lack permission.');
      logActivity('delete', table, { key: pk });
    },
    // Plans the current term (highest sem_id) from live data; nothing is written.
    async timetablePlan(opts) {
      needLive();
      const [students, faculty, courses, reqs, sems] = await Promise.all(['student', 'faculty', 'course', 'program_requirement', 'semester'].map(t => fetchAll(t)));
      if (!sems.length) throw new Error('Add a semester first.');
      const cur = sems.reduce((a, b) => (b.sem_id > a.sem_id ? b : a));
      return Object.assign(planTimetable({ students, faculty, courses, reqs }, opts), { semId: cur.sem_id, term: cur.term_name });
    },
    // Writes a plan. Sections are matched by (course, section letter) and updated in place; students whose group moved
    // have their enrolment re-pointed, so attendance already marked is kept. Only enrolments that no longer fit any
    // planned section are removed (with their attendance). progress(text) is called as it goes.
    async timetableApply(plan, progress) {
      needLive();
      const tick = progress || (() => {}), sem = plan.semId;
      const run = async (items, fn, label) => {  // small parallel batches
        for (let i = 0; i < items.length; i += 8) { tick(label + ' ' + Math.min(i + 8, items.length) + ' / ' + items.length); await Promise.all(items.slice(i, i + 8).map(fn)); }
      };
      const existing = await fetchAll('section', r => r.eq('sem_id', sem));
      const byKey = Object.fromEntries(existing.map(s => [s.course_id + '|' + s.section_code, s]));
      const idOf = {};
      await run(plan.sections, async s => {
        const m0 = s.meetings.slice().sort((a, b) => TT_DAYS.indexOf(a.day) - TT_DAYS.indexOf(b.day) || (a.start < b.start ? -1 : 1))[0];
        const vals = { faculty_id: s.faculty, day: m0.day, start_time: m0.start, end_time: m0.end, room: m0.room, capacity: plan.capacity, seats: Math.max(0, plan.capacity - s.students.length) };
        const old = byKey[s.course + '|' + s.code];
        const row = old ? (await must(db.from('section').update(vals).eq('section_id', old.section_id).select())).data[0]
                        : (await must(db.from('section').insert(Object.assign({ course_id: s.course, sem_id: sem, section_code: s.code }, vals)).select())).data[0];
        idOf[s.course + '|' + s.code] = row.section_id;
      }, 'Sections');
      const ids = Object.values(idOf);
      tick('Timetable slots');
      for (let i = 0; i < ids.length; i += 100) await must(db.from('section_meeting').delete().in('section_id', ids.slice(i, i + 100)));
      const mrows = [];
      plan.sections.forEach(s => s.meetings.forEach(m => mrows.push({ section_id: idOf[s.course + '|' + s.code], day: m.day, start_time: m.start, end_time: m.end, room: m.room, type: m.type })));
      for (let i = 0; i < mrows.length; i += 500) await must(db.from('section_meeting').insert(mrows.slice(i, i + 500)));

      // enrolments: one per (student, course) in the planned section
      const allIds = Array.from(new Set(existing.map(s => s.section_id).concat(ids)));
      let enr = [];
      for (let i = 0; i < allIds.length; i += 100) enr = enr.concat(await fetchAll('enrollment', r => r.in('section_id', allIds.slice(i, i + 100))));
      const courseOfSec = {};
      existing.forEach(s => { courseOfSec[s.section_id] = s.course_id; });
      plan.sections.forEach(s => { courseOfSec[idOf[s.course + '|' + s.code]] = s.course; });
      const want = {};
      plan.sections.forEach(s => s.students.forEach(st => { want[st + '|' + s.course] = idOf[s.course + '|' + s.code]; }));
      const moves = [], drops = [], have = new Set();
      enr.forEach(e => {
        const k = e.student_id + '|' + courseOfSec[e.section_id];
        if (!want[k] || have.has(k)) drops.push(e.enroll_id);
        else { have.add(k); if (e.section_id !== want[k]) moves.push([e.enroll_id, want[k]]); }
      });
      const adds = Object.keys(want).filter(k => !have.has(k)).map(k => ({ student_id: k.split('|')[0], section_id: want[k] }));
      for (let i = 0; i < drops.length; i += 100) await must(db.from('enrollment').delete().in('enroll_id', drops.slice(i, i + 100)));
      await run(moves, ([id, sec]) => must(db.from('enrollment').update({ section_id: sec }).eq('enroll_id', id)), 'Moving students');
      for (let i = 0; i < adds.length; i += 500) { tick('Enrolling ' + Math.min(i + 500, adds.length) + ' / ' + adds.length); await must(db.from('enrollment').insert(adds.slice(i, i + 500))); }

      // sections that are no longer planned (e.g. fewer groups now)
      const stale = existing.filter(s => ids.indexOf(s.section_id) < 0).map(s => s.section_id);
      if (stale.length) {
        tick('Removing ' + stale.length + ' unused sections');
        await must(db.from('attendance_submission').delete().in('section_id', stale));
        await must(db.from('section').delete().in('section_id', stale));
      }
      const summary = { term: plan.term, sections: ids.length, meetings: mrows.length, moved: moves.length, added: adds.length, dropped: drops.length, removedSections: stale.length };
      logActivity('generate timetable', 'section', summary);
      return summary;
    },
    // Creates (or resets) a confirmed login and links it to the row with that email — admin_set_login in admin.sql.
    async createLogin(email, password) {
      needLive();
      const uid = (await must(db.rpc('admin_set_login', { p_email: email, p_password: password }))).data;
      logActivity('set password', 'auth', { email }); // never the password itself
      return uid;
    },
    // latest MongoDB activity entries, newest first → { entries, total }
    activity(limit) { needLive(); return api('GET', null, '?limit=' + (limit || 200)); },
    // faculty control
    async facultyOverview() { needLive(); return (await must(db.rpc('faculty_overview', {}))).data || []; },
    async facultyAction(id, action, password) {
      needLive();
      await must(db.rpc('admin_faculty', { p_faculty: id, p_action: action, p_password: password }));
      logActivity(action === 'password' ? 'set password' : action.replace('_', ' '), 'faculty', { faculty_id: id }); // never the password itself
    }
  };

  // ---------- store ----------
  const KEY = 'vit-portal-v3';
  const lessonDoneOf = () => { const d = {}; Object.keys(LESSON_PLANS).forEach(code => { LESSON_PLANS[code].modules.forEach(mo => mo.topics.forEach(t => { d[code + '|' + mo.n + '|' + t[0]] = !!t[2]; })); }); return d; };
  const initial = () => ({
    role: null, // 'student' | 'faculty' | 'admin'
    completed: Object.assign({}, COMPLETED),
    registered: REGISTERED_INIT.map(r => Object.assign({}, r)),
    attendanceLog: buildAttendanceHistory(),
    lessonDone: lessonDoneOf(),
    facultySubmissions: [],
    notifications: [
      { id: 'n1', title: 'Subject registration closes 18 September', body: 'Add/drop for Semester IV is open. 18 of 24 credits registered.', kind: 'registration', time: '2h ago', read: false },
      { id: 'n2', title: 'Attendance below threshold — Operating Systems', body: 'Your attendance is 70%. Institute minimum is 75% to appear for the end-semester examination.', kind: 'warning', time: '6h ago', read: false },
      { id: 'n3', title: 'Grade card for Semester III published', body: 'SGPA 7.65 · CGPA 8.02. Available under Examination → Grade Card.', kind: 'academic', time: 'Yesterday', read: true },
      { id: 'n4', title: 'Examination fee pending — ₹6,500', body: 'Due 20 September 2026. Hall tickets are released after payment.', kind: 'accounts', time: '2 days ago', read: true }
    ],
    toasts: []
  });

  let state = initial();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.registered) state = Object.assign(state, saved, { toasts: [] });
  } catch (e) { /* ignore */ }

  const subs = new Set();
  function persist() {
    if (db) return; // live mode: the database is the store
    try { localStorage.setItem(KEY, JSON.stringify(Object.assign({}, state, { toasts: [] }))); } catch (e) { /* ignore */ }
  }
  function emit() { persist(); subs.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

  const VIT = {
    DAYS, GP, RANK, gradeMeets, toMin,
    courses: C, byCode: BY_CODE, courseName, faculty: FACULTY, requirements: REQUIREMENTS,
    term: TERM, student: STUDENT, transcript: TRANSCRIPT, lessonPlans: LESSON_PLANS, calendar: CALENDAR,
    fees: FEES, certificates: CERTIFICATES, hallTicket: HALL_TICKET, ppo: PPO, roster: ROSTER, teaching: TEACHING,
    careerPaths: CAREER_PATHS,
    gradeRelease: { date: null, released: false },
    regConfirm: { confirmed: false, at: null },
    // semester fee heads still unpaid (exam fees are due later and don't block registration)
    feesPending: () => FEES.heads.filter(h => h.status !== 'PAID' && !/^Examination/.test(h.head)),
    async confirmRegistration() {
      const r = await db.rpc('confirm_registration', {});
      if (r.error) throw new Error(r.error.message);
      Object.assign(VIT.regConfirm, { confirmed: true, at: r.data.confirmed_at }); emit();
    },
    registrationWindow: { open: true, opens: '2026-09-07', closes: '2026-09-18', min: 16, max: 24 },

    get state() { return state; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    reset() { state = initial(); emit(); },

    // derived
    ctx: () => ctxOf(state),
    evalPrereq: (expr) => evalPrereq(expr, ctxOf(state)),
    evalFor: (code) => evalPrereq(BY_CODE[code] && BY_CODE[code].prereq, ctxOf(state)),
    blockers, exprToText, meetingsOf, overlaps,
    conflictsFor: (code, sec, skip) => conflictsFor(state, code, sec, skip),
    planConflicts: () => planConflicts(state),
    credits: () => creditsOf(state),
    weeklyHours: () => weeklyHours(state),
    attendance: () => attendance(state),
    attendanceTrend: () => attendanceTrend(state),
    gpa: () => gpa(state),
    sgpa: sgpaOf,
    // this term, from released grades
    termSgpa: () => { const ms = VIT.myMarks().filter(m => m.grade), cr = ms.reduce((n, m) => n + m.credits, 0); return cr ? Math.round(ms.reduce((n, m) => n + GP[m.grade] * m.credits, 0) / cr * 100) / 100 : null; },
    whatIf: (codes) => whatIf(state, codes),
    profile: () => profile(state),
    isRegistered: (code) => state.registered.some(r => r.code === code),
    sectionOf: (code) => (state.registered.find(r => r.code === code) || {}).section,
    lessonProgress(code) {
      const p = LESSON_PLANS[code]; if (!p) return { done: 0, total: 0, pct: 0 };
      let done = 0, total = 0;
      p.modules.forEach(mo => mo.topics.forEach(t => { total++; if (state.lessonDone[code + '|' + mo.n + '|' + t[0]]) done++; }));
      return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
    },
    topicDone: (code, mod, topic) => !!state.lessonDone[code + '|' + mod + '|' + topic],
    alternatives(code) {
      const c = BY_CODE[code]; if (!c) return [];
      return c.sections.map(s => Object.assign({}, s, { conflicts: conflictsFor(state, code, s.id) })).filter(s => s.seats > 0 && s.conflicts.length === 0);
    },

    // mutations
    get live() { return !!db; },
    admin: ADMIN,
    // Portal login: mock mode just sets the role; live mode authenticates by email and loads the data.
    async signIn(email, pw, role) {
      if (!db) { VIT.login(role); return; }
      const { error } = await db.auth.signInWithPassword({ email, password: pw, role });
      if (error) throw error;
      try { await load(); } catch (e) { db.auth.signOut(); throw e; }
      if (role && state.role !== role) { // wrong sign-in page for this account (admin accounts cannot sign in here at all)
        const was = state.role; db.auth.signOut(); state = initial();
        throw new Error(was === 'admin' ? 'Administrator sign-in is not available on this portal.' : was === 'faculty' ? 'This is a faculty account. Use the faculty sign-in page.' : 'This is a student account. Use the student sign-in page.');
      }
      emit();
    },
    login(role) { state.role = role; emit(); },
    logout() { if (db) db.auth.signOut(); state.role = null; emit(); },
    // --- monthly feedback helpers ---
    feedbackDone: (month, sectionId) => FB.subs.some(x => x.month === month && x.section_id === sectionId && (!STUDENT.prn || x.student_id === STUDENT.prn)),
    // anonymous averages for the signed-in faculty's sections in one month
    feedbackResults(month) {
      const nQ = FEEDBACK.questions.length;
      const avg = (rows) => rows.length ? Math.round(rows.reduce((n, x) => n + x.rating, 0) / rows.length * 100) / 100 : 0;
      return FB.mySecs.map(x => {
        const rows = FB.resp.filter(r => r.month === month && r.section_id === x.sectionId);
        return Object.assign({}, x, { responses: new Set(FB.subs.filter(y => y.month === month && y.section_id === x.sectionId).map(y => y.student_id)).size, avg: avg(rows),
          perQ: FEEDBACK.questions.map(qq => ({ id: qq.id, category: qq.category, text: qq.text, avg: avg(rows.filter(r => r.question_id === qq.id)) })) });
      });
    },
    // class teacher (= mentor): which of my students have / have not submitted for each of their courses in a month
    feedbackMentees(month) {
      return FB.mentees.map(x => {
        const have = new Set(FB.subs.filter(y => y.month === month && y.student_id === x.prn).map(y => y.section_id));
        const pending = x.secs.filter(id => !have.has(id)).map(id => (SECTION_COURSE[id] || id));
        return { prn: x.prn, name: x.name, roll: x.roll, division: x.division, total: x.secs.length, done: x.secs.length - pending.length, pending };
      });
    },
    // ratings = { [questionId]: 1..5 } for one section in the current month (server checks enrolment, completeness and duplicates)
    submitFeedback(sectionId, ratings) {
      const it = FEEDBACK.items.find(x => x.sectionId === sectionId), month = FEEDBACK.current; if (!it || VIT.feedbackDone(month, sectionId)) return;
      const rec = { month, student_id: STUDENT.prn, section_id: sectionId }; FB.subs.push(rec); emit();
      sync(() => db.rpc('submit_feedback', { p_section: sectionId, p_ratings: ratings }), () => { FB.subs.splice(FB.subs.indexOf(rec), 1); }, 'Feedback not saved — ' + it.code);
      VIT.toast({ title: 'Feedback submitted', body: it.name + ' · ' + it.facultyName + '. Thank you.', kind: 'ok' });
    },
    // change the signed-in user's own password (server checks the current one and the rules)
    // Heads of Department only (server-checked): set the current term's add / drop window
    // continuous assessment: [id, label, out of]
    COMPONENTS: [['CVV', 'CVV', 12.5], ['MSE', 'Mid-semester exam', 25], ['ESE', 'End-semester exam', 50], ['ASSIGN', 'Assignments', 12.5]],
    // total out of 100 → letter grade
    gradeOf: (t) => t >= 91 ? 'A+' : t >= 81 ? 'A' : t >= 71 ? 'B+' : t >= 61 ? 'B' : t >= 51 ? 'C' : t >= 45 ? 'D' : t >= 40 ? 'P' : 'F',
    isSubmitted: (sectionId) => !!SUBMITTED[sectionId],
    async submitMarks(sectionId) {
      const r = await db.rpc('submit_marks', { p_section: sectionId });
      if (r.error) throw new Error(r.error.message);
      SUBMITTED[sectionId] = true; emit();
    },
    async gradesStatus() {
      const r = await db.rpc('grades_status', {});
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
    async setGradesRelease(date, force) {
      const r = await db.rpc('set_grades_release', { p_date: date, p_force: !!force });
      if (r.error) throw new Error(r.error.message);
      const today = new Date().toISOString().slice(0, 10);
      Object.assign(VIT.gradeRelease, { date, released: today >= date }); emit();
    },
    marksOf: (enrollId) => MARKS[enrollId] || {},
    // student: this term's marks per registered course
    myMarks: () => state.registered.map(r => {
      const mk = MARKS[MY_ENROLL[r.code]] || {}, got = Object.keys(mk);
      const total = got.reduce((n, k) => n + mk[k], 0), full = got.length === VIT.COMPONENTS.length;
      return { code: r.code, name: courseName(r.code), credits: (BY_CODE[r.code] || {}).credits || 0, marks: mk, total, outOf: VIT.COMPONENTS.filter(c => got.indexOf(c[0]) >= 0).reduce((n, c) => n + c[2], 0),
        grade: full && VIT.gradeRelease.released ? VIT.gradeOf(total) : null };
    }),
    // faculty: save one component for one of their sections. vals = { prn: number | '' }
    async saveMarks(sectionId, component, vals) {
      const r = await db.rpc('save_marks', { p_section: sectionId, p_component: component, p_marks: vals });
      if (r.error) throw new Error(r.error.message);
      const cls = TEACHING.find(t => t.sectionId === sectionId);
      if (cls) cls.students.forEach(x => { if (!(x.prn in vals)) return; const m = MARKS[x.enrollId] = MARKS[x.enrollId] || {}; if (vals[x.prn] === '' || vals[x.prn] == null) delete m[component]; else m[component] = +vals[x.prn]; });
      emit();
      return r.data;
    },
    // class teacher: mentees' marks progress; publish = issue marksheets to everyone whose marks are complete
    async classMarksheets(publish) {
      const r = await db.rpc('class_marksheets', { p_publish: !!publish });
      if (r.error) throw new Error(r.error.message);
      return r.data || [];
    },
    async setRegWindow(opens, closes) {
      const r = await db.rpc('set_reg_window', { p_opens: opens, p_closes: closes });
      if (r.error) throw new Error(r.error.message);
      const today = new Date().toISOString().slice(0, 10);
      Object.assign(VIT.registrationWindow, { opens, closes, open: today >= opens && today <= closes });
      emit();
    },
    async changePassword(oldPw, newPw) {
      if (!db) throw new Error('Password changes need the portal server.');
      const r = await db.rpc('change_password', { p_old: oldPw, p_new: newPw });
      if (r.error) throw new Error(r.error.message);
    },
    ppoRegister() {
      const item = { id: 'tmp', company: 'Training & Placement Cell', role: 'PPO registration', status: 'Registered', date: fmtDate(new Date().toISOString()) };
      PPO.applications = PPO.applications.concat([item]); emit();
      sync(() => db.from('ppo_application').insert({ student_id: STUDENT.prn, company: item.company, role: item.role, status: item.status }),
        () => { PPO.applications = PPO.applications.filter(x => x !== item); }, 'Could not register for the PPO cycle');
    },
    requestFor(code, kind, reason) {
      const item = { id: 'tmp' + Date.now(), prn: STUDENT.prn, student: STUDENT.name, code, kind, reason: reason || '', status: 'Pending' };
      REQUESTS.push(item); emit();
      sync(() => db.from('request').insert({ student_id: STUDENT.prn, course_id: code, kind, reason: item.reason }), () => { REQUESTS.splice(REQUESTS.indexOf(item), 1); }, 'Request not sent — ' + code);
    },
    decideRequest(id, status) {
      const r = REQUESTS.find(x => x.id === id); if (!r) return;
      const prev = r.status; r.status = status; emit();
      sync(() => db.from('request').update({ status }).eq('id', id).then(res => res.error ? res : db.from('notification').insert({ student_id: r.prn, kind: 'registration',
        title: courseName(r.code) + ' — your ' + r.kind + ' request was ' + status.toLowerCase(), body: 'Decided by ' + ((FACULTY[state.facultyId] || {}).name || 'course faculty') + '.' + (status === 'Approved' ? ' You can now register for this course while the registration window is open.' : '') })),
        () => { r.status = prev; }, 'Could not update the request');
    },
    // Downloads a small printable HTML document (open it and "Print → Save as PDF"). rows = [[label, value], …]
    saveDoc(filename, title, rows) {
      const esc = (x) => String(x == null ? '' : x).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
      const html = '<!doctype html><meta charset="utf-8"><title>' + esc(title) + '</title><body style="font-family:Georgia,serif;max-width:720px;margin:40px auto;color:#161D22">' +
        '<h2 style="margin:0">VIT — ' + esc(title) + '</h2><p style="color:#6B757E">' + esc(STUDENT.name) + (STUDENT.prn ? ' · PRN ' + esc(STUDENT.prn) : '') + ' · generated ' + esc(fmtDate(new Date().toISOString())) + '</p>' +
        '<table style="width:100%;border-collapse:collapse">' + rows.map(r => '<tr>' + r.map(c => '<td style="border-bottom:1px solid #ddd;padding:8px 6px">' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table></body>';
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = filename + '.html';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    // Test payment recorded in the database (no external gateway): marks the fee head PAID and issues a receipt number.
    payFee(head) {
      const h = FEES.heads.find(x => x.head === head && x.status === 'PENDING'); if (!h) return;
      const prev = Object.assign({}, h), iso = new Date().toISOString().slice(0, 10), receipt = 'VIT/' + iso.slice(2, 4) + '/PT/' + String(Date.now()).slice(-7);
      Object.assign(h, { status: 'PAID', date: fmtDate(iso), receipt, mode: 'Portal (test payment)' }); delete h.due; emit();
      sync(() => db.from('fee').update({ status: 'PAID', paid_on: iso, receipt, mode: h.mode }).eq('id', h.id), () => { Object.keys(h).forEach(k => delete h[k]); Object.assign(h, prev); }, 'Payment not recorded — ' + head);
    },
    hasApproval: (code, kind) => REQUESTS.some(r => r.prn === STUDENT.prn && r.code === code && r.kind === kind && r.status === 'Approved'),
    register(code, sectionId) {
      if (state.registered.some(r => r.code === code)) return;
      const section = sectionId || (BY_CODE[code].sections[0] || {}).id || 'A';
      state.registered = state.registered.concat([{ code, section }]);
      const s = (BY_CODE[code].sections || []).find(x => x.id === sectionId); if (s && s.seats > 0) s.seats--;
      emit();
      sync(() => db.rpc('register_section', { p_section: SECTION_ID[code + '|' + section] }),
        () => { state.registered = state.registered.filter(x => x.code !== code); if (s) s.seats++; }, 'Could not register ' + code);
    },
    drop(code) {
      const r = state.registered.find(x => x.code === code);
      const s = r && (BY_CODE[code].sections || []).find(x => x.id === r.section);
      if (s) s.seats++;
      const prev = { registered: state.registered, attendanceLog: state.attendanceLog };
      state.registered = state.registered.filter(x => x.code !== code);
      state.attendanceLog = state.attendanceLog.filter(x => x.code !== code);
      emit();
      if (r) sync(() => db.rpc('drop_section', { p_section: SECTION_ID[code + '|' + r.section] }),
        () => { Object.assign(state, prev); if (s) s.seats--; }, 'Could not drop ' + code);
    },
    swapSection(code, sectionId) {
      const from = (state.registered.find(r => r.code === code) || {}).section;
      state.registered = state.registered.map(r => r.code === code ? { code, section: sectionId } : r);
      emit();
      sync(() => db.rpc('swap_section', { p_from: SECTION_ID[code + '|' + from], p_to: SECTION_ID[code + '|' + sectionId] }),
        () => { state.registered = state.registered.map(r => r.code === code ? { code, section: from } : r); }, 'Could not swap section for ' + code);
    },
    async submitAttendance(code, date, marks, facId, time, type) {
      time = (time || '10:00').slice(0, 5) + ':00'; type = type || 'Lecture';
      if (db) {
        facId = state.facultyId; // RLS only accepts the signed-in faculty
        const rows = Object.keys(marks).filter(prn => ENROLL[prn + '|' + code])
          .map(prn => ({ enroll_id: ENROLL[prn + '|' + code], faculty_id: facId, held_on: date, held_at: time, type, status: marks[prn] }));
        const present = Object.values(marks).filter(v => v === 'Present').length;
        const r = rows.length ? await db.from('attendance').insert(rows) : {};
        if (r.error) throw new Error(r.error.message);
        await db.from('attendance_submission').insert({ section_id: MY_SECTION[code] || SECTION_ID[code + '|A'], faculty_id: facId, held_on: date, present, total: Object.keys(marks).length });
      }
      Object.keys(marks).forEach(prn => {
        if (prn !== STUDENT.prn) return; // only the signed-in student's own record feeds the student view
        state.attendanceLog = [{ date, code, fac: facId, type, status: marks[prn], time: time.slice(0, 5) }].concat(state.attendanceLog);
      });
      const present = Object.values(marks).filter(v => v === 'Present').length;
      state.facultySubmissions = [{ code, date, present, total: Object.keys(marks).length, at: Date.now() }].concat(state.facultySubmissions);
      const cls = TEACHING.find(t => t.code === code);
      if (cls) cls.students.forEach(x => { if (marks[x.prn]) { x.total++; if (marks[x.prn] !== 'Absent') x.attended++; x.pct = Math.round(x.attended / x.total * 100); } });
      VIT.notify({ title: 'Attendance recorded — ' + courseName(code), body: present + ' of ' + Object.keys(marks).length + ' present · ' + date + ' ' + time.slice(0, 5), kind: 'academic' }, true);
      emit();
    },
    toggleTopic(code, mod, topic) {
      const k = code + '|' + mod + '|' + topic;
      state.lessonDone[k] = !state.lessonDone[k];
      emit();
      sync(() => db.from('lesson_progress').upsert({ course_id: code, module_n: mod, topic, done: state.lessonDone[k], updated_at: new Date().toISOString() }),
        () => { state.lessonDone[k] = !state.lessonDone[k]; }, 'Lesson progress not saved');
    },
    notify(n, localOnly) {
      const item = Object.assign({ id: 'n' + Date.now(), time: 'Just now', read: false }, n);
      state.notifications = [item].concat(state.notifications);
      emit();
      // faculty announcements go to everyone (student_id null); student-side notices stay local
      if (!localOnly && state.role === 'faculty') sync(() => db.from('notification').insert({ title: n.title, body: n.body, kind: n.kind }),
        () => { state.notifications = state.notifications.filter(x => x !== item); }, 'Announcement not sent');
    },
    markAllRead() {
      const prev = state.notifications;
      state.notifications = state.notifications.map(n => Object.assign({}, n, { read: true })); emit();
      sync(() => db.from('notification').update({ read: true }).eq('read', false), () => { state.notifications = prev; }, 'Could not mark notifications read');
    },
    toast(t) {
      const id = 't' + Date.now() + Math.random();
      state.toasts = state.toasts.concat([Object.assign({ id }, t)]);
      emit();
      setTimeout(() => { state.toasts = state.toasts.filter(x => x.id !== id); emit(); }, t.ms || 4200);
    },

    // helpers
    fmtDate, dayRange, requests: REQUESTS, feedback: FEEDBACK,
    fmtINR: (n) => '₹' + n.toLocaleString('en-IN'),
    today: () => new Date(),
    dayName: () => DAYS[new Date().getDay() - 1] || null,
    // classes run from the term start to the "Last day of instruction", except on holiday / exam / vacation days
    isTeachingDay(iso) {
      iso = iso || new Date().toISOString().slice(0, 10);
      const last = CALENDAR.find(e => /^last day of instruction/i.test(e.title));
      if ((TERM.start && iso < TERM.start) || (last && iso > last.date)) return false;
      return !CALENDAR.some(e => ['holiday', 'exam', 'vacation'].indexOf(e.kind) >= 0 && iso >= e.date && iso <= (e.end || e.date));
    },
    todayClasses() {
      const dn = DAYS[new Date().getDay() - 1];
      if (!dn || !VIT.isTeachingDay()) return [];
      const out = [];
      state.registered.forEach(r => meetingsOf(r.code, r.section).forEach(mt => { if (mt.day === dn) out.push(Object.assign({}, mt, { code: r.code, name: courseName(r.code), fac: BY_CODE[r.code].fac, section: r.section })); }));
      return out.sort((a, b) => toMin(a.start) - toMin(b.start));
    },
    // scope: 'my' | 'class' | 'batch'. Students of one cohort group share their sections, so 'class' = the registered
    // sections; 'batch' keeps only the practical sessions (everything that isn't a lecture).
    weekGrid(scope) {
      const rows = [];
      state.registered.forEach(r => meetingsOf(r.code, r.section).forEach(mt => {
        if (scope === 'batch' && mt.type === 'Lecture') return;
        rows.push(Object.assign({}, mt, { code: r.code, name: courseName(r.code), fac: BY_CODE[r.code].fac, section: r.section }));
      }));
      return rows;
    }
  };

  function publish() { window.VIT = VIT; window.dispatchEvent(new Event('vit-ready')); }
  function waitFor(test, ms) {
    const t0 = Date.now();
    return new Promise(res => (function poll() { if (test()) res(true); else if (Date.now() - t0 > ms) res(false); else setTimeout(poll, 25); })());
  }

  // db-client.js is injected by the dc runtime as an async script, so it may run after this file.
  {
    waitFor(() => window.VITDB, 3000)
      .then(ok => {
        if (!ok) return; // no db-client → mock mode
        db = window.VITDB;
        state = initial(); // ignore anything persisted by mock mode
        // existing session → load before publishing, so Portal shows "Loading academic records…" instead of the login form
        return db.auth.getSession().then(r => r.data.session && load()).catch(e => { console.error(e); state.role = null; });
      })
      .then(publish);
  }
})();
