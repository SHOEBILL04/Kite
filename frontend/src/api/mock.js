/**
 * Deterministic fixtures mirroring the seeded backend (see
 * `backend/database/seeders/DatabaseSeeder.php`).
 *
 * These are the numbers the demo tells a story with:
 *   - CSE 2101 Section A (Prof. Monir)  midterm mean 24.2 / sd 1.9  — lenient, compressed
 *   - CSE 2101 Section B (Dr. Hasan)    midterm mean 16.5 / sd 6.8  — harsh, erratic
 *   - Fall 2025 draft Final carries three planted defects plus a mark-sum error
 *   - STU_042, STU_017 and STU_091 are the three planted at-risk narratives
 *
 * Every page must render completely against this file alone (VITE_USE_MOCK=true).
 *
 * @typedef {import('./contract.js').User} User
 */

/* ==========================================================================
 * AUTH
 * ======================================================================= */

const TIMESTAMPS = { created_at: '2026-09-01T09:00:00.000000Z', updated_at: '2026-09-01T09:00:00.000000Z' };

/** @type {Record<string, User>} */
export const MOCK_USERS = {
  faculty: {
    id: 1,
    name: 'Prof. Monir',
    email: 'monir@aust.edu',
    role: 'faculty',
    department: 'CSE',
    avatar_seed: 'monir',
    ...TIMESTAMPS,
  },
  head_of_department: {
    id: 2,
    name: 'Dr. Amina',
    email: 'amina@aust.edu',
    role: 'head_of_department',
    department: 'CSE',
    avatar_seed: 'amina',
    ...TIMESTAMPS,
  },
  moderator: {
    id: 3,
    name: 'Sec. Moderator',
    email: 'moderator@aust.edu',
    role: 'moderator',
    department: 'CSE',
    avatar_seed: 'moderator',
    ...TIMESTAMPS,
  },
};

/** Seeded credentials, all with password `password`. */
export const MOCK_CREDENTIALS = {
  'monir@aust.edu': MOCK_USERS.faculty,
  'amina@aust.edu': MOCK_USERS.head_of_department,
  'moderator@aust.edu': MOCK_USERS.moderator,
  'hasan@aust.edu': {
    id: 4,
    name: 'Dr. Hasan',
    email: 'hasan@aust.edu',
    role: 'faculty',
    department: 'CSE',
    avatar_seed: 'hasan',
    ...TIMESTAMPS,
  },
};

export const MOCK_TOKEN = '1|mock-sanctum-token-cognifaculty';

/* ==========================================================================
 * REFERENCE DATA
 * ======================================================================= */

/** @type {import('./contract.js').Course[]} */
export const MOCK_COURSES = [
  { id: 1, code: 'CSE 2101', title: 'Data Structures', credits: 3.0, semester: 'Fall 2024' },
  { id: 2, code: 'CSE 2103', title: 'Algorithms', credits: 3.0, semester: 'Spring 2025' },
];

/** @type {import('./contract.js').Exam[]} */
export const MOCK_EXAMS = [
  {
    id: 1,
    course_id: 1,
    course_code: 'CSE 2101',
    semester: 'Fall 2024',
    exam_type: 'Final',
    status: 'approved',
    total_marks: 70,
  },
  {
    id: 2,
    course_id: 1,
    course_code: 'CSE 2101',
    semester: 'Fall 2025',
    exam_type: 'Final',
    status: 'draft',
    total_marks: 70,
  },
];

/* ==========================================================================
 * DASHBOARD
 * ======================================================================= */

/** @type {import('./contract.js').DashboardSummary} */
export const MOCK_DASHBOARD_SUMMARY = {
  audited_exams: 2,
  active_sections: 2,
  harmonization_alerts: 5,
  students_at_risk: 5,
  severity_breakdown: { low: 3, medium: 4, high: 5 },
  recent_reports: [
    {
      id: 104,
      module: 'grading',
      title: 'Severe grading drift between Section A and Section B',
      severity: 'high',
      subject: 'CSE 2101 · Section A vs Section B',
      created_at: '2026-09-05T14:22:00.000000Z',
    },
    {
      id: 103,
      module: 'exam',
      title: 'Draft Final fails moderation: 3 defects, mark sum off by 2',
      severity: 'high',
      subject: 'CSE 2101 · Fall 2025 Final (draft)',
      created_at: '2026-09-05T11:07:00.000000Z',
    },
    {
      id: 102,
      module: 'student_risk',
      title: '5 students flagged, 3 at high risk',
      severity: 'medium',
      subject: 'CSE 2101 · all sections',
      created_at: '2026-09-04T16:45:00.000000Z',
    },
    {
      id: 101,
      module: 'syllabus',
      title: '3 redundant topics, 2 missing prerequisites',
      severity: 'medium',
      subject: 'CSE 2101 → CSE 2103',
      created_at: '2026-09-04T09:31:00.000000Z',
    },
    {
      id: 100,
      module: 'exam',
      title: 'Fall 2024 Final cleared moderation',
      severity: 'low',
      subject: 'CSE 2101 · Fall 2024 Final (approved)',
      created_at: '2026-09-02T10:12:00.000000Z',
    },
  ],
};

/* ==========================================================================
 * AUDIT 1 — GRADING DRIFT
 * ======================================================================= */

/** @type {import('./contract.js').GradingDriftReport} */
export const MOCK_GRADING_DRIFT = {
  drift_detected: true,
  severity: 'high',
  section_stats: [
    {
      section_name: 'Section A',
      instructor: 'Prof. Monir',
      n: 20,
      mean: 24.2,
      std_dev: 1.9,
      skewness: -0.42,
      z_score: 0.94,
      leniency_index: 1.19,
      distribution: [
        { bucket: '0-5', count: 0 },
        { bucket: '6-10', count: 0 },
        { bucket: '11-15', count: 0 },
        { bucket: '16-20', count: 0 },
        { bucket: '21-25', count: 15 },
        { bucket: '26-30', count: 5 },
      ],
    },
    {
      section_name: 'Section B',
      instructor: 'Dr. Hasan',
      n: 20,
      mean: 16.5,
      std_dev: 6.8,
      skewness: 0.24,
      z_score: -0.94,
      leniency_index: 0.81,
      distribution: [
        { bucket: '0-5', count: 0 },
        { bucket: '6-10', count: 5 },
        { bucket: '11-15', count: 5 },
        { bucket: '16-20', count: 4 },
        { bucket: '21-25', count: 3 },
        { bucket: '26-30', count: 3 },
      ],
    },
  ],
  insights: [
    {
      title: '7.7-mark gap on a 30-mark midterm',
      detail:
        'Section A averages 24.2 against Section B at 16.5 — a 25.7 percentage-point spread. Quiz averages and attendance are statistically indistinguishable across the two sections, so intake ability does not explain the gap.',
      severity: 'high',
    },
    {
      title: 'Section A distribution is compressed',
      detail:
        'A standard deviation of 1.9 with every student inside the 21-30 band indicates ceiling-clustered marking. The section carries almost no discriminating power between its strongest and weakest students.',
      severity: 'high',
    },
    {
      title: 'Section B marking is erratic',
      detail:
        'A standard deviation of 6.8 — 3.6x Section A — spread across five mark bands suggests inconsistent rubric application rather than a genuinely wider ability range.',
      severity: 'medium',
    },
    {
      title: 'Cross-section CGPA impact',
      detail:
        'Two students with identical underlying quiz averages would land roughly one letter grade apart purely on section assignment.',
      severity: 'medium',
    },
  ],
  normalization: {
    section_name: 'Section B',
    suggested_shift: 3.9,
    rationale:
      'Shifting Section B up by 3.9 marks aligns both section means on the cohort mean of 20.4 while preserving within-section ranking. Section A should additionally be re-marked against the rubric, since a linear shift cannot restore the variance its compression destroyed.',
  },
  ai_summary:
    'Grading parity between the two CSE 2101 midterm sections has broken down. Section A (Prof. Monir) averages 24.2/30 with a standard deviation of 1.9, while Section B (Dr. Hasan) averages 16.5/30 with a standard deviation of 6.8. Because quiz performance and attendance are comparable across both cohorts, the 7.7-mark gap is attributable to marker behaviour, not student ability. Section A shows ceiling compression — no student scored below 21 — and Section B shows erratic dispersion across five bands. Recommended action: apply a +3.9 normalisation shift to Section B, and require a rubric-anchored re-mark of a Section A sample before final grades are published.',
};

/* ==========================================================================
 * AUDIT 2 — SYLLABUS HARMONIZATION
 * ======================================================================= */

/** @type {import('./contract.js').SyllabusReport} */
export const MOCK_SYLLABUS = {
  alignment_score: 62,
  redundant_topics: [
    {
      topic: 'Asymptotic notation (O, Ω, Θ) and complexity analysis',
      course_a_ref: 'CSE 2101 · Week 1',
      course_b_ref: 'CSE 2103 · Week 1',
      similarity: 0.94,
    },
    {
      topic: 'Graph traversal: BFS and DFS',
      course_a_ref: 'CSE 2101 · Week 11',
      course_b_ref: 'CSE 2103 · Week 6',
      similarity: 0.91,
    },
    {
      topic: 'Recursion, call-stack dynamics and divide-and-conquer formulation',
      course_a_ref: 'CSE 2101 · Week 7',
      course_b_ref: 'CSE 2103 · Week 2',
      similarity: 0.87,
    },
  ],
  missing_prerequisites: [
    {
      concept: 'Binary heaps and heapsort',
      assumed_in: 'CSE 2103 · Week 5 (Binomial and Fibonacci heaps)',
      never_introduced_in: 'CSE 2101',
      severity: 'high',
    },
    {
      concept: 'Basic amortized analysis (aggregate method)',
      assumed_in: 'CSE 2103 · Week 4 (Potential and accounting methods)',
      never_introduced_in: 'CSE 2101',
      severity: 'medium',
    },
  ],
  bloom_coverage: { C1: 4, C2: 7, C3: 9, C4: 6, C5: 2, C6: 1 },
  actionable_changes: [
    'Drop the Week 1 asymptotic-notation review from CSE 2103 and open directly with the Master Theorem; reclaim the week for amortized analysis.',
    'Introduce binary heaps and heapsort in CSE 2101 Week 6, alongside the priority-queue ADT that already appears there.',
    'Compress the CSE 2103 Week 6 BFS/DFS block into a single directed-graph refresher; the undirected case is fully covered in CSE 2101 Week 11.',
    'Move recursion fundamentals out of CSE 2103 Week 2 and cross-reference CSE 2101 Week 7 instead.',
    'Add one C5/C6 design assessment to CSE 2103; higher-order coverage across the pair is thin at three topics.',
  ],
  ai_summary:
    'CSE 2101 and CSE 2103 align at 62/100. Three topic blocks are taught twice — asymptotic notation, recursion, and BFS/DFS — consuming roughly three of the twelve weeks in CSE 2103 on material already assessed in CSE 2101. Against that redundancy sit two genuine gaps: CSE 2103 assumes binary heaps and basic amortized analysis, neither of which appears anywhere in the CSE 2101 syllabus, so students meet Fibonacci heaps without ever having built a binary one. Reallocating the three redundant weeks to those prerequisites would close both gaps without extending either course.',
};

/* ==========================================================================
 * AUDIT 3 — EXAM MODERATION  (CSE 2101 Fall 2025 Final, draft)
 * ======================================================================= */

/** @type {import('./contract.js').ExamModerationReport} */
export const MOCK_EXAM_MODERATION = {
  mark_sum_valid: false,
  calculated_total: 72,
  declared_total: 70,
  questions: [
    {
      q_number: '1',
      text: 'Illustrate the internal pointer updates required to delete a node from the middle of a doubly linked list without causing memory leakage.',
      marks: 10,
      assigned_bloom_level: 'C2',
      detected_bloom_level: 'C2',
      verdict: 'pass',
      flags: [],
    },
    {
      q_number: '2(a)',
      text: 'State the definition of an AVL tree and list the mathematical condition defining the balance factor of any arbitrary node.',
      marks: 8,
      assigned_bloom_level: 'C4',
      detected_bloom_level: 'C1',
      verdict: 'critical',
      flags: [
        {
          type: 'verb_mismatch',
          message:
            'Stem verbs "State" and "list" are C1 recall, but the question is tagged C4 (Analyse). Three Bloom levels of overstatement.',
        },
        {
          type: 'clo_inflation',
          message:
            'CLO2 analytical coverage is credited 8 marks by this tagging while the task requires only recall.',
        },
      ],
    },
    {
      q_number: '3',
      text: 'Construct a circular queue of size 6 using an array. Show the exact front and rear index pointers after 4 enqueue and 2 dequeue operations.',
      marks: 10,
      assigned_bloom_level: 'C3',
      detected_bloom_level: 'C3',
      verdict: 'pass',
      flags: [],
    },
    {
      q_number: '4',
      text: 'Given an undirected graph with 7 vertices and edges {(1,2),(1,3),(2,4),(2,5),(3,6),(3,7),(5,7)}, trace both Breadth-First Search (BFS) and Depth-First Search (DFS) traversals starting from vertex 1. Show the detailed state of the queue and stack data structures at every vertex visitation step.',
      marks: 10,
      assigned_bloom_level: 'C3',
      detected_bloom_level: 'C3',
      verdict: 'critical',
      flags: [
        {
          type: 'duplicate_question',
          message:
            'Verbatim match against Fall 2024 Final Q4 (similarity 0.97), including the identical edge set. The paper is in circulation.',
        },
      ],
    },
    {
      q_number: '5(b)',
      text: 'Derive and prove the time complexity of collision resolution by double hashing using probabilistic Bernoulli trial assumptions across an infinite key domain.',
      marks: 2,
      assigned_bloom_level: 'C4',
      detected_bloom_level: 'C5',
      verdict: 'warning',
      flags: [
        {
          type: 'unfeasible_marks',
          message:
            'A derive-and-prove task at C5 allocated 2 marks. Comparable proof questions in this paper average 10 marks; expected allocation is 8-10.',
        },
        {
          type: 'time_budget',
          message:
            'Estimated 18-22 minutes of work for 2.8% of the paper total — the mark-per-minute ratio is the worst on the paper.',
        },
      ],
    },
    {
      q_number: '6',
      text: 'Compute the depth, height, and sibling relationships of all nodes in a complete binary tree containing 15 keys stored sequentially in an array.',
      marks: 12,
      assigned_bloom_level: 'C3',
      detected_bloom_level: 'C3',
      verdict: 'pass',
      flags: [],
    },
    {
      q_number: '7',
      text: 'Deconstruct the worst-case time complexity of BST deletion when the target node possesses two children, accounting for in-order successor swapping.',
      marks: 10,
      assigned_bloom_level: 'C4',
      detected_bloom_level: 'C4',
      verdict: 'pass',
      flags: [],
    },
    {
      q_number: '8',
      text: 'Analyze the memory footprint and edge-traversal cache locality of adjacency matrix versus adjacency list representations for dense graphs with V > 10,000.',
      marks: 10,
      assigned_bloom_level: 'C4',
      detected_bloom_level: 'C4',
      verdict: 'pass',
      flags: [],
    },
  ],
  duplicates: [
    {
      draft_q: '4',
      matched_year: 'Fall 2024 Final',
      matched_text:
        'Given an undirected graph with 7 vertices and edges {(1,2),(1,3),(2,4),(2,5),(3,6),(3,7),(5,7)}, trace both Breadth-First Search (BFS) and Depth-First Search (DFS) traversals starting from vertex 1. Show the detailed state of the queue and stack data structures at every vertex visitation step.',
      similarity_score: 0.97,
      rewrite_suggestion:
        'Keep the traversal task but change the instance and the target skill: use a directed graph on 8 vertices with edges {(1,2),(1,4),(2,3),(3,1),(4,5),(5,6),(6,4),(2,7),(7,8)}, ask for the DFS forest with discovery/finish times, and have the student classify each edge as tree, back, forward, or cross.',
    },
  ],
  cognitive_balance: {
    lower_order_pct: 58.3,
    higher_order_pct: 41.7,
    verdict: 'warning',
  },
  ai_summary:
    'The Fall 2025 draft Final is not ready for approval. Question marks sum to 72 against a declared total of 70, so every script would be graded on an inconsistent denominator. Q4 is a 0.97 verbatim match against the Fall 2024 Final, a paper students already hold. Q2(a) asks students to "state" and "list" — pure C1 recall — while carrying a C4 tag, inflating the paper apparent analytical weight by 8 marks. Q5(b) allocates 2 marks to a derive-and-prove task worth an estimated 20 minutes. Cognitive balance is 58.3% lower-order to 41.7% higher-order, with no C5 or C6 question anywhere on the paper, so the highest-order CLOs go unassessed this semester.',
};

/* ==========================================================================
 * AUDIT 4 — VULNERABLE STUDENTS
 * ======================================================================= */

/** @type {import('./contract.js').VulnerableStudentsReport} */
export const MOCK_VULNERABLE_STUDENTS = {
  at_risk_count: 5,
  students: [
    {
      student_hash: 'STU_042',
      section_name: 'Section A',
      risk_level: 'high',
      risk_score: 87,
      ml_probability: 0.84,
      attendance_pct: 82,
      quiz_trend: [85, 71, 38],
      midterm_pct: 41.0,
      triggers: ['Quiz collapse -47 pts', 'Midterm below section floor', 'Attendance decay'],
      recommended_action:
        'Schedule a one-to-one within the week. The trajectory, not the level, is the signal — this student was performing above the section mean six weeks ago.',
      narrative:
        'STU_042 opened the semester at 85% on Quiz 1, sat comfortably above the Section A mean, and then fell to 71% and 38% across the next two quizzes — a 47-point collapse inside six weeks. Attendance slipped to 82% over the same window and one assignment came in late. The midterm at 41% is the lowest in Section A, a section where the marker floor is otherwise 21/30. A drop this steep from this starting point is characteristic of an external disruption rather than an academic ceiling, and it is the strongest intervention candidate in the cohort.',
    },
    {
      student_hash: 'STU_017',
      section_name: 'Section B',
      risk_level: 'high',
      risk_score: 79,
      ml_probability: 0.76,
      attendance_pct: 54,
      quiz_trend: [60, 58, 55],
      midterm_pct: 49.0,
      triggers: ['Attendance 54%', '4 late assignments', 'Flat sub-60% quiz band'],
      recommended_action:
        'Refer to student affairs alongside academic support. At 54% attendance the university engagement threshold is already breached.',
      narrative:
        'STU_017 has attended just 54% of sessions and has submitted four assignments late — the highest delay count in either section. Quiz performance is flat and low at 60%, 58% and 55%, and the midterm landed at 49%. Unlike STU_042 there is no collapse here; the pattern is sustained disengagement from the start of term. Attendance is the dominant feature in the risk model for this student, which makes contact and re-engagement the intervention, not extra tutoring.',
    },
    {
      student_hash: 'STU_091',
      section_name: 'Section B',
      risk_level: 'high',
      risk_score: 71,
      ml_probability: 0.68,
      attendance_pct: 91,
      quiz_trend: [88, 84, 86],
      midterm_pct: 44.0,
      triggers: ['Midterm-vs-coursework anomaly', 'Exam performance outlier'],
      recommended_action:
        'Review the script manually before assuming an ability gap; check for exam anxiety, a missed section, or a marking error.',
      narrative:
        'STU_091 is the anomaly in the cohort. Attendance sits at 91% and quiz scores hold steady at 88%, 84% and 86% — top-quartile coursework by any measure — yet the midterm came back at 44%. The gap between sustained coursework performance and a single exam result is 42 points, far outside what quiz variance predicts. This profile is not consistent with an ability gap; the plausible explanations are exam conditions, an unanswered section, or a marking or transcription error on the script. Manual review should precede any academic intervention.',
    },
    {
      student_hash: 'STU_SEC_B_003',
      section_name: 'Section B',
      risk_level: 'medium',
      risk_score: 64,
      ml_probability: 0.58,
      attendance_pct: 70,
      quiz_trend: [55, 52, 48],
      midterm_pct: 20.0,
      triggers: ['Midterm 20%', 'Declining quiz trend', 'Attendance below 75%'],
      recommended_action:
        'Enrol in the supplementary problem-solving session; monitor Quiz 4 as the checkpoint.',
      narrative:
        'STU_SEC_B_003 has been below the pass line all semester, with quizzes drifting from 55% to 48% and a midterm of 20%. Attendance at 70% compounds the trend. Unlike the flagged high-risk cases the signal here is consistent under-performance rather than a discontinuity, which responds better to structured tutoring than to a welfare referral.',
    },
    {
      student_hash: 'STU_SEC_B_004',
      section_name: 'Section B',
      risk_level: 'medium',
      risk_score: 57,
      ml_probability: 0.51,
      attendance_pct: 72,
      quiz_trend: [62, 60, 58],
      midterm_pct: 23.3,
      triggers: ['Midterm 23.3%', 'Attendance below 75%'],
      recommended_action: 'Assign targeted practice on tree and graph traversal before the final.',
      narrative:
        'STU_SEC_B_004 holds a stable but low quiz band around 60% and scored 23.3% on the midterm. Attendance at 72% is marginal. The gap between quiz and exam performance suggests the difficulty is with timed synthesis rather than with the material itself, so timed practice under exam conditions is the more useful intervention.',
    },
  ],
};

/* ==========================================================================
 * REPORTS
 * ======================================================================= */

/** @type {import('./contract.js').Report[]} */
export const MOCK_REPORTS = [
  {
    id: 104,
    module: 'grading',
    title: 'Severe grading drift between Section A and Section B',
    subject: 'CSE 2101 · Section A vs Section B',
    severity: 'high',
    ai_summary: MOCK_GRADING_DRIFT.ai_summary,
    anomaly_count: 4,
    from_cache: false,
    created_at: '2026-09-05T14:22:00.000000Z',
  },
  {
    id: 103,
    module: 'exam',
    title: 'Draft Final fails moderation: 3 defects, mark sum off by 2',
    subject: 'CSE 2101 · Fall 2025 Final (draft)',
    severity: 'high',
    ai_summary: MOCK_EXAM_MODERATION.ai_summary,
    anomaly_count: 5,
    from_cache: false,
    created_at: '2026-09-05T11:07:00.000000Z',
  },
  {
    id: 102,
    module: 'student_risk',
    title: '5 students flagged, 3 at high risk',
    subject: 'CSE 2101 · all sections',
    severity: 'medium',
    ai_summary:
      'Five students in CSE 2101 cross the risk threshold, three of them at high risk. STU_042 shows a 47-point quiz collapse, STU_017 sustained disengagement at 54% attendance, and STU_091 an exam-versus-coursework anomaly that warrants script review before any academic intervention.',
    anomaly_count: 5,
    from_cache: true,
    created_at: '2026-09-04T16:45:00.000000Z',
  },
  {
    id: 101,
    module: 'syllabus',
    title: '3 redundant topics, 2 missing prerequisites',
    subject: 'CSE 2101 → CSE 2103',
    severity: 'medium',
    ai_summary: MOCK_SYLLABUS.ai_summary,
    anomaly_count: 5,
    from_cache: false,
    created_at: '2026-09-04T09:31:00.000000Z',
  },
  {
    id: 100,
    module: 'exam',
    title: 'Fall 2024 Final cleared moderation',
    subject: 'CSE 2101 · Fall 2024 Final (approved)',
    severity: 'low',
    ai_summary:
      'The Fall 2024 Final passes every moderation check. Marks sum to the declared 70, Bloom tags match detected levels on all eight questions, and cognitive balance sits at 51% lower-order to 49% higher-order with C5 and C6 both represented.',
    anomaly_count: 0,
    from_cache: true,
    created_at: '2026-09-02T10:12:00.000000Z',
  },
  {
    id: 99,
    module: 'grading',
    title: 'Section variance within tolerance',
    subject: 'CSE 2103 · Section A vs Section B',
    severity: 'low',
    ai_summary:
      'CSE 2103 section means differ by 1.2 marks with comparable dispersion. No normalisation is warranted.',
    anomaly_count: 0,
    from_cache: true,
    created_at: '2026-08-29T13:05:00.000000Z',
  },
];

/* ==========================================================================
 * MOCK ROUTER
 * ======================================================================= */

/**
 * Build the exact response body `client.js` would have received from the API,
 * envelope included, so mock and live modes are indistinguishable downstream.
 *
 * @param {string} method  lowercase HTTP verb
 * @param {string} url     path relative to VITE_API_URL, query string included
 * @param {Record<string, any>} [body]
 * @returns {{ data: any }}
 * @throws {{ status: number, message: string, errors: Record<string, string[]>|null }}
 */
export function resolveMock(method, url, body = {}) {
  const [path, search = ''] = url.split('?');
  const params = new URLSearchParams(search);
  const key = `${method.toLowerCase()} ${path}`;

  switch (key) {
    case 'post /login': {
      const user = MOCK_CREDENTIALS[String(body.email ?? '').toLowerCase()];
      if (!user || body.password !== 'password') {
        throw {
          status: 401,
          message: 'Invalid credentials.',
          errors: { email: ['The provided credentials do not match our records.'] },
        };
      }
      return { data: { user, token: MOCK_TOKEN } };
    }

    case 'post /demo-login': {
      const user = MOCK_USERS[body.role];
      if (!user) {
        throw {
          status: 404,
          message: 'No demo user found for the requested role.',
          errors: { role: [`No seeded user exists for role '${body.role}'.`] },
        };
      }
      return { data: { user, token: MOCK_TOKEN } };
    }

    case 'post /register':
      return {
        data: {
          user: {
            id: 99,
            name: body.name ?? 'New User',
            email: body.email ?? 'new@aust.edu',
            role: body.role ?? 'faculty',
            department: body.department ?? 'CSE',
            avatar_seed: body.name ?? 'new',
            ...TIMESTAMPS,
          },
          token: MOCK_TOKEN,
        },
      };

    case 'post /logout':
      return { data: { message: 'Logged out successfully.' } };

    case 'get /me':
      return { data: { user: MOCK_USERS.faculty } };

    case 'get /dashboard/summary':
      return { data: MOCK_DASHBOARD_SUMMARY };

    case 'get /courses':
      return { data: MOCK_COURSES };

    case 'get /exams':
      return { data: MOCK_EXAMS };

    case 'post /audit/grading-drift':
      return { data: MOCK_GRADING_DRIFT };

    case 'post /audit/syllabus':
      return { data: MOCK_SYLLABUS };

    case 'post /audit/exam-moderation':
      return { data: MOCK_EXAM_MODERATION };

    case 'post /audit/vulnerable-students':
      return { data: MOCK_VULNERABLE_STUDENTS };

    case 'get /reports': {
      const moduleFilter = params.get('module');
      const severityFilter = params.get('severity');
      const rows = MOCK_REPORTS.filter(
        (r) =>
          (!moduleFilter || r.module === moduleFilter) &&
          (!severityFilter || r.severity === severityFilter)
      );
      return { data: rows };
    }

    default:
      throw { status: 404, message: `No mock handler for ${key}`, errors: null };
  }
}
