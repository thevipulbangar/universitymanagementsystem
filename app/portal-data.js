/* VIT Academic Portal — mock university dataset + academic engines + persistent store.
   Exposes window.VIT. Pure logic; no DOM.
   With window.SUPABASE_ANON_KEY set (config.js) and supabase-js loaded, the same objects are
   refilled from Supabase after sign-in and mutations are written back; otherwise the mock
   constants below + localStorage are used. */
(function () {
  'use strict';

  // ---------- grades ----------
  const GP = { O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, P: 4, F: 0 };
  const RANK = ['F', 'P', 'C', 'B', 'B+', 'A', 'A+', 'O'];
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
    { sem: 1, term: 'Odd 2024-25', courses: [['CS101', 'A+', 88], ['MA101', 'A', 79], ['PH101', 'B+', 71], ['HS101', 'O', 93], ['CS102', 'A', 82]] },
    { sem: 2, term: 'Even 2024-25', courses: [['CS201', 'A+', 90], ['MA102', 'A', 81], ['CS202', 'A', 84], ['EE101', 'B+', 68], ['HS201', 'A+', 89]] },
    { sem: 3, term: 'Odd 2025-26', courses: [['CS301', 'A', 83], ['CS303', 'B', 64], ['CS203', 'A', 80], ['MA201', 'B+', 72], ['OE301', 'A+', 91], ['HS301', 'A', 85]] }
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
    year: 'SE', division: 'A', batch: 'A2', sem: 4, semRoman: 'IV', ay: '2026-27',
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
      const wk = Math.floor((new Date(r.date) - new Date('2026-07-20')) / (7 * 86400000));
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
    CERTIFICATES.forEach(ct => { if (ct.verified) add([ct.title.split(' ').slice(-2).join(' ')], 0); });
    add(['Python'], 2); add(['React'], 2); // certificate-derived
    const ranked = Object.entries(skills).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ skill: k, weight: v }));
    const paths = CAREER_PATHS.map(p => {
      const have = p.skills.filter(s => skills[s]), miss = p.skills.filter(s => !skills[s]);
      return Object.assign({}, p, { have, miss, fit: Math.round(have.length / p.skills.length * 100) });
    }).sort((a, b) => b.fit - a.fit);
    const direction = state.registered.map(r => BY_CODE[r.code]).filter(c => c && c.cat !== 'Mandatory').map(c => c.name);
    return { skills: ranked, paths, direction };
  }

  // ---------- Supabase backend (live mode) ----------
  let sb = null;                       // supabase client; null = mock mode
  const SECTION_ID = {};               // 'CS401|A' → section_id (current semester)
  const ENROLL = {};                   // 'prn|CS401' → enroll_id (current semester, the signed-in faculty's sections)
  const MY_SECTION = {};               // course code → the signed-in faculty's section_id
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const fmtDate = (iso) => { if (!iso) return ''; const [y, mo, d] = iso.slice(0, 10).split('-'); return d + ' ' + MON[mo - 1] + ' ' + y; };
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

  // Load everything the signed-in user may read (RLS scopes it) and refill the objects VIT exposes, in place.
  async function load() {
    const sess = (await sb.auth.getSession()).data.session;
    if (!sess) throw new Error('Not signed in.');
    const uid = sess.user.id;
    const q = (t, f) => { let r = sb.from(t).select('*'); if (f) r = f(r); return r.then(({ data, error }) => { if (error) throw error; return data || []; }); };
    // admin first; the table only exists once supabase/admin.sql has run, so an error just means "not an admin"
    const adm = await sb.from('admin').select('*').eq('user_id', uid).then(r => (r.error ? [] : r.data || []), () => []);
    const admin = adm.find(a => a.user_id === uid);
    if (admin) {
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
    // Note: faculty read every enrollment row and filter client-side; add a server-side filter if the table gets large
    const [courses, prereqs, cats, preqs, sections, meetings, enrolls, trans, att, plans, progress, cal, fees, certs, hostels, tickets, papers, notes, subs] = await Promise.all([
      q('course'), q('prerequisite', r => r.order('group_no')), q('requirement_category'), q('program_requirement'),
      q('section', r => r.order('section_code')), q('section_meeting', r => r.order('id')), q('enrollment', r => r.order('enroll_id')),
      own('transcript', r => r.order('sem_id')), own('attendance'), q('lesson_plan'), q('lesson_progress'),
      q('calendar_event', r => r.order('start_on')), own('fee', r => r.order('id')), own('certificate', r => r.order('issued_on', { ascending: false })),
      own('hostel_allotment'), own('hall_ticket'), q('exam_paper', r => r.order('held_on')),
      q('notification', r => r.order('created_at', { ascending: false })), me ? q('attendance_submission', r => r.order('created_at', { ascending: false })) : Promise.resolve([])
    ]);
    const deptName = (id) => (depts.find(d => d.dept_id === id) || {}).dept_name || id;

    swap(FACULTY, Object.fromEntries(facs.map(f => [f.faculty_id, { id: f.faculty_id, name: f.name, short: f.short_name, email: f.email, dept: deptName(f.dept_id), desig: f.designation, cabin: f.cabin }])));
    replace(REQUIREMENTS, cats.map(c => ({ id: c.category, name: c.name, credits: c.credits, note: c.note })));

    const progId = stu ? stu.program_id : (progs.find(p => p.dept_id === me.dept_id) || progs[0] || {}).program_id;
    const buckets = {};
    preqs.filter(r => r.program_id === progId).forEach(r => { (buckets[r.course_id] = buckets[r.course_id] || []).push(r.category); });

    const secById = {};
    sections.forEach(s => { secById[s.section_id] = s; });
    const curSecs = sections.filter(s => s.sem_id === cur.sem_id);
    [SECTION_ID, ENROLL, MY_SECTION].forEach(o => swap(o, {}));
    curSecs.forEach(s => {
      SECTION_ID[s.course_id + '|' + s.section_code] = s.section_id;
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
      if (stu && e.student_id === stu.student_id && e.grade_point == null) registered.push({ code: s.course_id, section: s.section_code });
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

    const ay = fees.some(f => f.year === cur.year) ? cur.year : (fees.length ? fees[fees.length - 1].year : cur.year);
    const heads = fees.filter(f => f.year === ay).map(f => f.status === 'PAID'
      ? { head: f.head, amount: f.amount, status: f.status, date: fmtDate(f.paid_on), receipt: f.receipt, mode: f.mode }
      : { head: f.head, amount: f.amount, status: f.status, due: fmtDate(f.due_on) });
    swap(FEES, { ay, total: heads.reduce((s, h) => s + h.amount, 0), heads });

    replace(CERTIFICATES, certs.map(c => ({ id: 'c' + c.id, title: c.title, issuer: c.issuer, course: c.ref_code, date: c.issued_on, hours: c.hours, verified: c.verified, grade: c.grade })));

    // hall ticket: this semester's papers for the courses the user takes (student) or teaches (faculty)
    const ht = tickets.filter(t => t.sem_id === cur.sem_id).pop();
    const exam = ht ? ht.exam : (papers.find(p => p.sem_id === cur.sem_id) || {}).exam;
    const mine = me ? Object.keys(MY_SECTION) : registered.map(r => r.code);
    swap(HALL_TICKET, {
      exam: exam || '', ay: cur.year, seat: ht ? ht.seat : '', centre: ht ? ht.centre : '', block: ht ? ht.block : '',
      papers: papers.filter(p => p.sem_id === cur.sem_id && p.exam === exam && mine.indexOf(p.course_id) >= 0)
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

    const today = new Date().toISOString().slice(0, 10);
    swap(VIT.registrationWindow, { open: !!cur.reg_opens && today >= cur.reg_opens && today <= cur.reg_closes, opens: cur.reg_opens, closes: cur.reg_closes, min: cur.min_credits, max: cur.credit_cap });

    state = {
      role: me ? 'faculty' : 'student', facultyId: me ? me.faculty_id : null,
      completed, registered, attendanceLog, lessonDone: lessonDoneOf(),
      facultySubmissions: subs.filter(s => s.faculty_id === me.faculty_id && secById[s.section_id])
        .map(s => ({ code: secById[s.section_id].course_id, date: s.held_on, present: s.present, total: s.total, at: new Date(s.created_at).getTime() })),
      notifications: notes.map(n => ({ id: 'n' + n.id, title: n.title, body: n.body, kind: n.kind, time: ago(n.created_at), read: n.read })),
      toasts: state.toasts
    };
  }

  // Optimistic write: local state is already updated; on failure undo it and tell the user.
  function sync(call, revert, title) {
    if (!sb) return;
    Promise.resolve().then(call).then(r => { if (r && r.error) throw r.error; })
      .catch(e => { revert(); VIT.toast({ kind: 'err', title, body: e.message }); });
  }

  // ---------- admin console: generic table access (RLS lets only admins write) ----------
  const errText = (e) => [e.message, e.details, e.hint ? '(' + e.hint + ')' : '', e.code ? '[' + e.code + ']' : ''].filter(Boolean).join(' ');
  const must = (p) => Promise.resolve(p).then(r => { if (r.error) throw new Error(errText(r.error)); return r; });
  const needLive = () => { if (!sb) throw new Error('Admin console needs the live database — set SUPABASE_ANON_KEY in app/config.js.'); };
  let signupClient = null;
  const ADMIN = {
    // → { rows, count }; supabase returns at most 1000 rows per request
    async list(table, opts) {
      needLive();
      let r = sb.from(table).select('*', { count: 'exact' });
      ((opts && opts.order) || []).forEach(c => { r = r.order(c); });
      const res = await must(r.limit((opts && opts.limit) || 1000));
      return { rows: res.data || [], count: res.count == null ? (res.data || []).length : res.count };
    },
    async insert(table, values) { needLive(); return (await must(sb.from(table).insert(values).select())).data[0]; },
    async update(table, pk, values) {
      needLive();
      const res = await must(sb.from(table).update(values).match(pk).select());
      if (!res.data || !res.data.length) throw new Error('No row was updated — it may have been deleted, or you lack permission.');
      return res.data[0];
    },
    async remove(table, pk) {
      needLive();
      const res = await must(sb.from(table).delete().match(pk).select());
      if (!res.data || !res.data.length) throw new Error('No row was deleted — it may already be gone, or you lack permission.');
    },
    // Creates the Supabase Auth user on a throwaway client so the admin's own session is kept.
    // The pending_login row lets the auth trigger (admin.sql) link it to the student/faculty row with that email.
    async createLogin(email, password) {
      needLive();
      await must(sb.from('pending_login').upsert({ email: email.toLowerCase(), created_at: new Date().toISOString() }));
      signupClient = signupClient || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'admin-signup' } });
      const { data, error } = await signupClient.auth.signUp({ email, password });
      if (error) throw new Error(errText(error));
      if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('A login already exists for ' + email + '.');
      return { userId: data.user && data.user.id, needsConfirm: !data.session };
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
    if (sb) return; // live mode: Supabase is the store
    try { localStorage.setItem(KEY, JSON.stringify(Object.assign({}, state, { toasts: [] }))); } catch (e) { /* ignore */ }
  }
  function emit() { persist(); subs.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

  const VIT = {
    DAYS, GP, RANK, gradeMeets, toMin,
    courses: C, byCode: BY_CODE, courseName, faculty: FACULTY, requirements: REQUIREMENTS,
    student: STUDENT, transcript: TRANSCRIPT, lessonPlans: LESSON_PLANS, calendar: CALENDAR,
    fees: FEES, certificates: CERTIFICATES, hallTicket: HALL_TICKET, ppo: PPO, roster: ROSTER,
    careerPaths: CAREER_PATHS,
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
    audit: (extra) => degreeAudit(state, extra),
    gpa: () => gpa(state),
    sgpa: sgpaOf,
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
    get live() { return !!sb; },
    admin: ADMIN,
    // Portal login: mock mode just sets the role; live mode authenticates by email and loads the data.
    async signIn(email, pw, role) {
      if (!sb) { VIT.login(role); return; }
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      try { await load(); } catch (e) { sb.auth.signOut(); throw e; }
      emit();
    },
    login(role) { state.role = role; emit(); },
    logout() { if (sb) sb.auth.signOut(); state.role = null; emit(); },
    register(code, sectionId) {
      if (state.registered.some(r => r.code === code)) return;
      const section = sectionId || (BY_CODE[code].sections[0] || {}).id || 'A';
      state.registered = state.registered.concat([{ code, section }]);
      const s = (BY_CODE[code].sections || []).find(x => x.id === sectionId); if (s && s.seats > 0) s.seats--;
      emit();
      sync(() => sb.rpc('register_section', { p_section: SECTION_ID[code + '|' + section] }),
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
      if (r) sync(() => sb.rpc('drop_section', { p_section: SECTION_ID[code + '|' + r.section] }),
        () => { Object.assign(state, prev); if (s) s.seats--; }, 'Could not drop ' + code);
    },
    swapSection(code, sectionId) {
      const from = (state.registered.find(r => r.code === code) || {}).section;
      state.registered = state.registered.map(r => r.code === code ? { code, section: sectionId } : r);
      emit();
      sync(() => sb.rpc('swap_section', { p_from: SECTION_ID[code + '|' + from], p_to: SECTION_ID[code + '|' + sectionId] }),
        () => { state.registered = state.registered.map(r => r.code === code ? { code, section: from } : r); }, 'Could not swap section for ' + code);
    },
    submitAttendance(code, date, marks, facId) {
      const type = 'Lecture';
      if (sb) facId = state.facultyId; // RLS only accepts the signed-in faculty
      const prev = { attendanceLog: state.attendanceLog, facultySubmissions: state.facultySubmissions };
      Object.keys(marks).forEach(prn => {
        if (prn !== STUDENT.prn) return; // only the demo student's own record feeds the student view
        state.attendanceLog = [{ date, code, fac: facId, type, status: marks[prn], time: '10:00' }].concat(state.attendanceLog);
      });
      const present = Object.values(marks).filter(v => v === 'Present').length;
      state.facultySubmissions = [{ code, date, present, total: Object.keys(marks).length, at: Date.now() }].concat(state.facultySubmissions);
      VIT.notify({ title: 'Attendance recorded — ' + courseName(code), body: present + ' of ' + Object.keys(marks).length + ' present · ' + date, kind: 'academic' }, true);
      emit();
      // Note: two inserts, not one transaction; wrap in an RPC if a half-saved roll call matters
      const rows = Object.keys(marks).filter(prn => ENROLL[prn + '|' + code])
        .map(prn => ({ enroll_id: ENROLL[prn + '|' + code], faculty_id: facId, held_on: date, held_at: '10:00', type, status: marks[prn] }));
      sync(() => (rows.length ? sb.from('attendance').insert(rows) : Promise.resolve({})).then(r => r.error ? r
        : sb.from('attendance_submission').insert({ section_id: MY_SECTION[code] || SECTION_ID[code + '|A'], faculty_id: facId, held_on: date, present, total: Object.keys(marks).length })),
        () => Object.assign(state, prev), 'Attendance not saved — ' + code);
    },
    toggleTopic(code, mod, topic) {
      const k = code + '|' + mod + '|' + topic;
      state.lessonDone[k] = !state.lessonDone[k];
      emit();
      sync(() => sb.from('lesson_progress').upsert({ course_id: code, module_n: mod, topic, done: state.lessonDone[k], updated_at: new Date().toISOString() }),
        () => { state.lessonDone[k] = !state.lessonDone[k]; }, 'Lesson progress not saved');
    },
    notify(n, localOnly) {
      const item = Object.assign({ id: 'n' + Date.now(), time: 'Just now', read: false }, n);
      state.notifications = [item].concat(state.notifications);
      emit();
      // faculty announcements go to everyone (student_id null); student-side notices stay local
      if (!localOnly && state.role === 'faculty') sync(() => sb.from('notification').insert({ title: n.title, body: n.body, kind: n.kind }),
        () => { state.notifications = state.notifications.filter(x => x !== item); }, 'Announcement not sent');
    },
    markAllRead() {
      const prev = state.notifications;
      state.notifications = state.notifications.map(n => Object.assign({}, n, { read: true })); emit();
      sync(() => sb.from('notification').update({ read: true }).eq('read', false), () => { state.notifications = prev; }, 'Could not mark notifications read');
    },
    toast(t) {
      const id = 't' + Date.now() + Math.random();
      state.toasts = state.toasts.concat([Object.assign({ id }, t)]);
      emit();
      setTimeout(() => { state.toasts = state.toasts.filter(x => x.id !== id); emit(); }, t.ms || 4200);
    },

    // helpers
    fmtINR: (n) => '₹' + n.toLocaleString('en-IN'),
    today: () => new Date(),
    dayName: () => DAYS[new Date().getDay() - 1] || null,
    todayClasses() {
      const dn = DAYS[new Date().getDay() - 1];
      if (!dn) return [];
      const out = [];
      state.registered.forEach(r => meetingsOf(r.code, r.section).forEach(mt => { if (mt.day === dn) out.push(Object.assign({}, mt, { code: r.code, name: courseName(r.code), fac: BY_CODE[r.code].fac, section: r.section })); }));
      return out.sort((a, b) => toMin(a.start) - toMin(b.start));
    },
    weekGrid(scope) {
      // scope: 'my' | 'class' | 'batch'
      const rows = [];
      if (scope === 'my') state.registered.forEach(r => meetingsOf(r.code, r.section).forEach(mt => rows.push(Object.assign({}, mt, { code: r.code, name: courseName(r.code), fac: BY_CODE[r.code].fac, section: r.section }))));
      else {
        const base = ['CS401', 'CS302', 'CS305', 'CS309', 'HS401', 'CS403'];
        base.forEach(code => meetingsOf(code, 'A').forEach(mt => rows.push(Object.assign({}, mt, { code, name: courseName(code), fac: BY_CODE[code].fac, section: 'A' }))));
        if (scope === 'batch') {
          rows.length = 0;
          base.forEach(code => meetingsOf(code, 'A').forEach(mt => { if (mt.type !== 'Lab') return; rows.push(Object.assign({}, mt, { code, name: courseName(code), fac: BY_CODE[code].fac, section: 'A2' })); }));
          [['CS305', m('Tue', '11:00', '13:00', 'Lab 2', 'Tutorial')], ['CS309', m('Wed', '11:00', '13:00', 'Lab 4', 'Lab')], ['CS401', m('Thu', '15:00', '17:00', 'Lab 3', 'Studio')]].forEach(([code, mt]) => rows.push(Object.assign({}, mt, { code, name: courseName(code), fac: BY_CODE[code].fac, section: 'A2' })));
        }
      }
      return rows;
    }
  };

  function publish() { window.VIT = VIT; window.dispatchEvent(new Event('vit-ready')); }
  function waitFor(test, ms) {
    const t0 = Date.now();
    return new Promise(res => (function poll() { if (test()) res(true); else if (Date.now() - t0 > ms) res(false); else setTimeout(poll, 25); })());
  }

  // config.js and supabase-js are injected by the dc runtime as async scripts, so they may run after this file.
  if ('SUPABASE_ANON_KEY' in window && !window.SUPABASE_ANON_KEY) publish(); // no backend configured: mock mode, as before
  else {
    waitFor(() => 'SUPABASE_ANON_KEY' in window, 2000)
      .then(() => !!window.SUPABASE_ANON_KEY && waitFor(() => window.supabase && window.supabase.createClient, 10000))
      .then(ok => {
        if (!ok) return; // no key or supabase-js failed to load → mock mode
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        state = initial(); // ignore anything persisted by mock mode
        // existing session → load before publishing, so Portal shows "Loading academic records…" instead of the login form
        return sb.auth.getSession().then(r => r.data.session && load()).catch(e => { console.error(e); state.role = null; });
      })
      .then(publish);
  }
})();
