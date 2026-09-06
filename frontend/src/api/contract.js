/**
 * CogniFaculty API contract — SINGLE SOURCE OF TRUTH.
 *
 * Every feature page codes against the shapes in this file. Do not inline a URL
 * string anywhere else in the app; import from `ENDPOINTS`.
 *
 * RESPONSE ENVELOPE
 * -----------------
 * The Laravel backend wraps every successful payload as `{ "data": <payload> }`.
 * `src/api/client.js` unwraps that envelope, so a hook receives the payload
 * directly. Every typedef below describes the UNWRAPPED payload.
 *
 * ERRORS
 * ------
 * Failures reject with an Error carrying `{ status, message, errors }`, where
 * `errors` is Laravel's `{ field: string[] }` validation bag (422) or null.
 *
 * @typedef {'low'|'medium'|'high'} Severity
 * @typedef {'pass'|'warning'|'critical'} Verdict
 * @typedef {'faculty'|'head_of_department'|'moderator'} Role
 * @typedef {'grading'|'syllabus'|'exam'|'student_risk'} AuditModule
 * @typedef {'C1'|'C2'|'C3'|'C4'|'C5'|'C6'} BloomLevel
 */

/** Enumerations mirrored from the backend migrations. Use these, never bare literals. */
export const SEVERITY = ['low', 'medium', 'high'];
export const VERDICT = ['pass', 'warning', 'critical'];
export const ROLES = ['faculty', 'head_of_department', 'moderator'];
export const AUDIT_MODULES = ['grading', 'syllabus', 'exam', 'student_risk'];
export const BLOOM_LEVELS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

/** Human labels for the role badge in the top bar. */
export const ROLE_LABELS = {
  faculty: 'Faculty',
  head_of_department: 'Head of Dept',
  moderator: 'Moderator',
};

/** Human labels for `module` on reports. */
export const MODULE_LABELS = {
  grading: 'Grading Parity',
  syllabus: 'Curriculum Harmonizer',
  exam: 'Exam Moderation',
  student_risk: 'Student Radar',
};

/**
 * All API paths, relative to `VITE_API_URL` (which already ends in `/api`).
 * Values are either a string or a function returning a string.
 */
export const ENDPOINTS = {
  // --- Auth -------------------------------------------------------------
  /** POST — body {@link LoginPayload} -> {@link AuthResponse} */
  login: '/login',
  /** POST — body {@link RegisterPayload} -> {@link AuthResponse} (201) */
  register: '/register',
  /** POST — body {@link DemoLoginPayload} -> {@link AuthResponse} */
  demoLogin: '/demo-login',
  /** POST — no body -> `{ message: string }` */
  logout: '/logout',
  /** GET -> `{ user: User }` */
  me: '/me',

  // --- Dashboard --------------------------------------------------------
  /** GET -> {@link DashboardSummary} */
  dashboardSummary: '/dashboard/summary',

  // --- Reference data ---------------------------------------------------
  /** GET -> {@link Course}[] */
  courses: '/courses',
  /** GET -> {@link Exam}[] */
  exams: '/exams',

  // --- Audits -----------------------------------------------------------
  /** POST — body `{ course_id: number }` -> {@link GradingDriftReport} */
  auditGradingDrift: '/audit/grading-drift',
  /** POST — body `{ course_a_id: number, course_b_id: number }` -> {@link SyllabusReport} */
  auditSyllabus: '/audit/syllabus',
  /** POST — body `{ exam_id: number }` -> {@link ExamModerationReport} */
  auditExamModeration: '/audit/exam-moderation',
  /** POST — body `{ course_id: number }` -> {@link VulnerableStudentsReport} */
  auditVulnerableStudents: '/audit/vulnerable-students',

  // --- Reports ----------------------------------------------------------
  /**
   * GET -> {@link Report}[]
   *
   * @param {{ module?: AuditModule, severity?: Severity }} [filters]
   * @returns {string}
   */
  reports: (filters = {}) => {
    const qs = new URLSearchParams();
    if (filters.module) qs.set('module', filters.module);
    if (filters.severity) qs.set('severity', filters.severity);
    const q = qs.toString();
    return q ? `/reports?${q}` : '/reports';
  },
};

/**
 * Stable React Query keys. Compose from here so an invalidation on one page
 * reaches another page's cached data.
 */
export const QUERY_KEYS = {
  me: ['me'],
  dashboardSummary: ['dashboard', 'summary'],
  courses: ['courses'],
  exams: ['exams'],
  /** @param {{module?: AuditModule, severity?: Severity}} [filters] */
  reports: (filters = {}) => ['reports', filters.module ?? null, filters.severity ?? null],
  /** @param {number} courseId */
  gradingDrift: (courseId) => ['audit', 'grading-drift', courseId],
  /** @param {number} courseAId @param {number} courseBId */
  syllabus: (courseAId, courseBId) => ['audit', 'syllabus', courseAId, courseBId],
  /** @param {number} examId */
  examModeration: (examId) => ['audit', 'exam-moderation', examId],
  /** @param {number} courseId */
  vulnerableStudents: (courseId) => ['audit', 'vulnerable-students', courseId],
};

/* ==========================================================================
 * AUTH
 * ======================================================================= */

/**
 * @typedef {Object} User
 * @property {number} id
 * @property {string} name          e.g. "Prof. Monir"
 * @property {string} email
 * @property {Role} role
 * @property {string} department    e.g. "CSE"
 * @property {string} avatar_seed   seed for the avatar/initials chip
 * @property {string} created_at    ISO 8601
 * @property {string} updated_at    ISO 8601
 */

/**
 * @typedef {Object} AuthResponse
 * @property {User} user
 * @property {string} token         Sanctum plain-text bearer token
 */

/**
 * @typedef {Object} LoginPayload
 * @property {string} email
 * @property {string} password
 */

/**
 * @typedef {Object} RegisterPayload
 * @property {string} name
 * @property {string} email
 * @property {string} password
 * @property {string} password_confirmation
 * @property {Role} role
 * @property {string} [department]
 */

/**
 * @typedef {Object} DemoLoginPayload
 * @property {Role} role            One-click judge login; no password.
 */

/* ==========================================================================
 * DASHBOARD  —  GET /dashboard/summary
 * ======================================================================= */

/**
 * @typedef {Object} RecentReport
 * @property {number} id
 * @property {AuditModule} module
 * @property {string} title         short human headline
 * @property {Severity} severity
 * @property {string} subject       what was audited, e.g. "CSE 2101 · Section A vs B"
 * @property {string} created_at    ISO 8601
 */

/**
 * @typedef {Object} DashboardSummary
 * @property {number} audited_exams
 * @property {number} active_sections
 * @property {number} harmonization_alerts
 * @property {number} students_at_risk
 * @property {{low: number, medium: number, high: number}} severity_breakdown
 * @property {RecentReport[]} recent_reports
 */

/* ==========================================================================
 * REFERENCE DATA  —  GET /courses
 * ======================================================================= */

/**
 * @typedef {Object} Course
 * @property {number} id
 * @property {string} code          e.g. "CSE 2101"
 * @property {string} title         e.g. "Data Structures"
 * @property {number} credits
 * @property {string} semester      e.g. "Fall 2024"
 * @property {string} [syllabus_markdown] omitted from the index listing
 */

/**
 * @typedef {Object} Exam
 * @property {number} id
 * @property {number} course_id
 * @property {string} course_code
 * @property {string} semester
 * @property {'Mid'|'Final'} exam_type
 * @property {'draft'|'moderated'|'approved'} status
 * @property {number} total_marks   declared total printed on the paper
 */

/* ==========================================================================
 * AUDIT 1 — GRADING DRIFT   POST /audit/grading-drift  { course_id }
 * ======================================================================= */

/**
 * @typedef {Object} DistributionBucket
 * @property {string} bucket        mark band label, e.g. "21-25"
 * @property {number} count         students in the band
 */

/**
 * @typedef {Object} SectionStat
 * @property {string} section_name   e.g. "Section A"
 * @property {string} instructor     e.g. "Prof. Monir"
 * @property {number} n              students graded
 * @property {number} mean
 * @property {number} std_dev
 * @property {number} skewness       negative = left-skewed (clustered high)
 * @property {number} z_score        section mean vs cohort mean, in cohort SDs
 * @property {number} leniency_index 1.0 = cohort norm; >1 lenient, <1 harsh
 * @property {DistributionBucket[]} distribution  histogram, ordered low -> high
 */

/**
 * @typedef {Object} Insight
 * @property {string} title
 * @property {string} detail
 * @property {Severity} severity
 */

/**
 * @typedef {Object} Normalization
 * @property {string} section_name     section the shift applies to
 * @property {number} suggested_shift  marks to add (+) or subtract (-)
 * @property {string} rationale
 */

/**
 * @typedef {Object} GradingDriftReport
 * @property {boolean} drift_detected
 * @property {Severity} severity
 * @property {SectionStat[]} section_stats
 * @property {Insight[]} insights
 * @property {Normalization} normalization
 * @property {string} ai_summary
 */

/* ==========================================================================
 * AUDIT 2 — SYLLABUS   POST /audit/syllabus  { course_a_id, course_b_id }
 * ======================================================================= */

/**
 * @typedef {Object} RedundantTopic
 * @property {string} topic
 * @property {string} course_a_ref  where it appears in A, e.g. "CSE 2101 · Week 7"
 * @property {string} course_b_ref
 * @property {number} similarity    0..1
 */

/**
 * @typedef {Object} MissingPrerequisite
 * @property {string} concept
 * @property {string} assumed_in           course that presumes the concept
 * @property {string} never_introduced_in  course that should have taught it
 * @property {Severity} severity
 */

/**
 * @typedef {Object} SyllabusReport
 * @property {number} alignment_score  0..100, higher = better aligned
 * @property {RedundantTopic[]} redundant_topics
 * @property {MissingPrerequisite[]} missing_prerequisites
 * @property {{C1:number,C2:number,C3:number,C4:number,C5:number,C6:number}} bloom_coverage
 *           integer topic counts per Bloom level across both syllabi
 * @property {string[]} actionable_changes
 * @property {string} ai_summary
 */

/* ==========================================================================
 * AUDIT 3 — EXAM MODERATION   POST /audit/exam-moderation  { exam_id }
 * ======================================================================= */

/**
 * @typedef {Object} QuestionFlag
 * @property {string} type     machine-readable slug, e.g. "verb_mismatch"
 * @property {string} message  analyst-facing sentence
 */

/**
 * @typedef {Object} ModeratedQuestion
 * @property {string} q_number                   e.g. "2(a)" — string, not a number
 * @property {string} text
 * @property {number} marks
 * @property {BloomLevel} assigned_bloom_level   what the paper claims
 * @property {BloomLevel} detected_bloom_level   what the analysis infers
 * @property {Verdict} verdict
 * @property {QuestionFlag[]} flags              empty array when verdict is 'pass'
 */

/**
 * @typedef {Object} DuplicateQuestion
 * @property {string} draft_q           q_number in the draft paper
 * @property {string} matched_year      e.g. "Fall 2024 Final"
 * @property {string} matched_text
 * @property {number} similarity_score  0..1
 * @property {string} rewrite_suggestion
 */

/**
 * @typedef {Object} CognitiveBalance
 * @property {number} lower_order_pct   C1-C3 share of marks, 0..100
 * @property {number} higher_order_pct  C4-C6 share of marks, 0..100
 * @property {Verdict} verdict
 */

/**
 * @typedef {Object} ExamModerationReport
 * @property {boolean} mark_sum_valid
 * @property {number} calculated_total  sum of question marks
 * @property {number} declared_total    total printed on the paper
 * @property {ModeratedQuestion[]} questions
 * @property {DuplicateQuestion[]} duplicates
 * @property {CognitiveBalance} cognitive_balance
 * @property {string} ai_summary
 */

/* ==========================================================================
 * AUDIT 4 — VULNERABLE STUDENTS   POST /audit/vulnerable-students { course_id }
 * ======================================================================= */

/**
 * @typedef {Object} AtRiskStudent
 * @property {string} student_hash    anonymised id, e.g. "STU_042"
 * @property {string} section_name
 * @property {Severity} risk_level    low | medium | high
 * @property {number} risk_score      0..100, higher = worse
 * @property {number} ml_probability  0..1 model confidence of failure
 * @property {number} attendance_pct  0..100
 * @property {number[]} quiz_trend    exactly three quiz percentages: [q1, q2, q3]
 * @property {number} midterm_pct     0..100
 * @property {string[]} triggers      short rule labels that fired
 * @property {string} recommended_action
 * @property {string} narrative       one-paragraph explanation
 */

/**
 * @typedef {Object} VulnerableStudentsReport
 * @property {number} at_risk_count
 * @property {AtRiskStudent[]} students  ordered highest risk first
 */

/* ==========================================================================
 * REPORTS  —  GET /reports?module=&severity=
 * ======================================================================= */

/**
 * @typedef {Object} Report
 * @property {number} id
 * @property {AuditModule} module
 * @property {string} title
 * @property {string} subject
 * @property {Severity} severity
 * @property {string} ai_summary
 * @property {number} anomaly_count
 * @property {boolean} from_cache
 * @property {string} created_at  ISO 8601
 */
