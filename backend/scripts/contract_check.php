<?php
/**
 * Contract conformance harness.
 *
 * Validates every live endpoint against the typedefs in
 * frontend/src/api/contract.js. Temporary dev tool -- not part of the app.
 */
require __DIR__.'/../vendor/autoload.php';
$app = require_once __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$FAIL = [];
$OK = 0;

function hit(string $method, string $uri, array $body = []): array
{
    global $kernel;
    $req = Illuminate\Http\Request::create($uri, $method, $body);
    $req->headers->set('Accept', 'application/json');
    $res = $kernel->handle($req);
    $decoded = json_decode($res->getContent(), true);

    return [$res->getStatusCode(), $decoded];
}

function check(string $label, bool $cond, string $detail = ''): void
{
    global $FAIL, $OK;
    if ($cond) { $OK++; } else { $FAIL[] = $label.($detail ? " -- $detail" : ''); }
}

/** Assert every $keys exists on $obj. */
function keys(string $label, $obj, array $keys): void
{
    if (! is_array($obj)) { check($label, false, 'not an object'); return; }
    $missing = array_diff($keys, array_keys($obj));
    check($label, $missing === [], $missing ? 'missing: '.implode(',', $missing) : '');
}

function enum(string $label, $val, array $allowed): void
{
    check($label, in_array($val, $allowed, true), 'got '.json_encode($val).', allowed '.implode('|', $allowed));
}

$SEV = ['low', 'medium', 'high'];
$VERDICT = ['pass', 'warning', 'critical'];
$BLOOM = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

echo str_repeat('=', 72)."\nCONTRACT CONFORMANCE\n".str_repeat('=', 72)."\n";

// ---------------------------------------------------------------- courses
[$s, $b] = hit('GET', '/api/courses');
check('GET /courses 200', $s === 200, "got $s");
check('GET /courses envelope', isset($b['data']));
$courses = $b['data'] ?? [];
check('GET /courses non-empty', count($courses) > 0);
if ($courses) { keys('Course fields', $courses[0], ['id', 'code', 'title', 'credits', 'semester']); }

// ------------------------------------------------------------------ exams
[$s, $b] = hit('GET', '/api/exams');
check('GET /exams 200', $s === 200, "got $s");
$exams = $b['data'] ?? [];
check('GET /exams non-empty', count($exams) > 0);
if ($exams) {
    keys('Exam fields', $exams[0], ['id', 'course_id', 'course_code', 'semester', 'exam_type', 'status', 'total_marks']);
    enum('Exam.exam_type', $exams[0]['exam_type'] ?? null, ['Mid', 'Final']);
    enum('Exam.status', $exams[0]['status'] ?? null, ['draft', 'moderated', 'approved']);
}

// -------------------------------------------------------- exam questions
$examId = $exams[0]['id'] ?? 1;
[$s, $b] = hit('GET', "/api/exams/$examId/questions");
check('GET /exams/{id}/questions 200', $s === 200, "got $s");
$dq = $b['data'] ?? [];
check('DraftQuestion non-empty', count($dq) > 0);
if ($dq) {
    keys('DraftQuestion fields', $dq[0], ['q_number', 'text', 'marks', 'assigned_bloom_level', 'assigned_clo']);
    check('DraftQuestion.q_number is string', is_string($dq[0]['q_number'] ?? null));
    enum('DraftQuestion.assigned_bloom_level', $dq[0]['assigned_bloom_level'] ?? null, $BLOOM);
}

// -------------------------------------------------------------- dashboard
[$s, $b] = hit('GET', '/api/dashboard/summary');
check('GET /dashboard/summary 200', $s === 200, "got $s");
$d = $b['data'] ?? [];
keys('DashboardSummary fields', $d, ['audited_exams', 'active_sections', 'harmonization_alerts', 'students_at_risk', 'severity_breakdown', 'recent_reports']);
keys('severity_breakdown', $d['severity_breakdown'] ?? [], ['low', 'medium', 'high']);
foreach (($d['recent_reports'] ?? []) as $i => $r) {
    keys("RecentReport[$i]", $r, ['id', 'module', 'title', 'severity', 'subject', 'created_at']);
    enum("RecentReport[$i].severity", $r['severity'] ?? null, $SEV);
    enum("RecentReport[$i].module", $r['module'] ?? null, ['grading', 'syllabus', 'exam', 'student_risk']);
}

// ----------------------------------------------------------- grading drift
[$s, $b] = hit('POST', '/api/audit/grading-drift', ['course_id' => 1]);
check('POST /audit/grading-drift 200', $s === 200, "got $s");
$g = $b['data'] ?? [];
keys('GradingDriftReport fields', $g, ['drift_detected', 'severity', 'section_stats', 'insights', 'normalization', 'ai_summary']);
enum('GradingDriftReport.severity', $g['severity'] ?? null, $SEV);
check('drift_detected is bool', is_bool($g['drift_detected'] ?? null));
foreach (($g['section_stats'] ?? []) as $i => $st) {
    keys("SectionStat[$i]", $st, ['section_name', 'instructor', 'n', 'mean', 'std_dev', 'skewness', 'z_score', 'leniency_index', 'distribution']);
    foreach (($st['distribution'] ?? []) as $j => $bk) {
        keys("SectionStat[$i].distribution[$j]", $bk, ['bucket', 'count']);
    }
}
foreach (($g['insights'] ?? []) as $i => $ins) {
    keys("Insight[$i]", $ins, ['title', 'detail', 'severity']);
    enum("Insight[$i].severity", $ins['severity'] ?? null, $SEV);
}
keys('Normalization', $g['normalization'] ?? [], ['section_name', 'suggested_shift', 'rationale']);

// --------------------------------------------------------------- syllabus
[$s, $b] = hit('POST', '/api/audit/syllabus', ['course_a_id' => 1, 'course_b_id' => 2]);
check('POST /audit/syllabus 200', $s === 200, "got $s");
$y = $b['data'] ?? [];
keys('SyllabusReport fields', $y, ['alignment_score', 'redundant_topics', 'missing_prerequisites', 'bloom_coverage', 'actionable_changes', 'ai_summary']);
keys('bloom_coverage', $y['bloom_coverage'] ?? [], $BLOOM);
check('actionable_changes is string[]', is_array($y['actionable_changes'] ?? null) && (! ($y['actionable_changes'] ?? []) || is_string($y['actionable_changes'][0])));
foreach (($y['redundant_topics'] ?? []) as $i => $t) {
    keys("RedundantTopic[$i]", $t, ['topic', 'course_a_ref', 'course_b_ref', 'similarity']);
}
foreach (($y['missing_prerequisites'] ?? []) as $i => $p) {
    keys("MissingPrerequisite[$i]", $p, ['concept', 'assumed_in', 'never_introduced_in', 'severity']);
    enum("MissingPrerequisite[$i].severity", $p['severity'] ?? null, $SEV);
}

// -------------------------------------------------------- exam moderation
[$s, $b] = hit('POST', '/api/audit/exam-moderation', ['exam_id' => $examId]);
check('POST /audit/exam-moderation 200', $s === 200, "got $s");
$e = $b['data'] ?? [];
keys('ExamModerationReport fields', $e, ['mark_sum_valid', 'calculated_total', 'declared_total', 'questions', 'duplicates', 'cognitive_balance', 'ai_summary']);
check('mark_sum_valid is bool', is_bool($e['mark_sum_valid'] ?? null));
foreach (($e['questions'] ?? []) as $i => $q) {
    keys("ModeratedQuestion[$i]", $q, ['q_number', 'text', 'marks', 'assigned_bloom_level', 'detected_bloom_level', 'verdict', 'flags']);
    enum("ModeratedQuestion[$i].verdict", $q['verdict'] ?? null, $VERDICT);
    enum("ModeratedQuestion[$i].assigned_bloom_level", $q['assigned_bloom_level'] ?? null, $BLOOM);
    enum("ModeratedQuestion[$i].detected_bloom_level", $q['detected_bloom_level'] ?? null, $BLOOM);
    check("ModeratedQuestion[$i].q_number is string", is_string($q['q_number'] ?? null));
    foreach (($q['flags'] ?? []) as $j => $f) {
        keys("ModeratedQuestion[$i].flags[$j]", $f, ['type', 'message']);
    }
}
foreach (($e['duplicates'] ?? []) as $i => $dup) {
    keys("DuplicateQuestion[$i]", $dup, ['draft_q', 'matched_year', 'matched_text', 'similarity_score', 'rewrite_suggestion']);
}
keys('CognitiveBalance', $e['cognitive_balance'] ?? [], ['lower_order_pct', 'higher_order_pct', 'verdict']);
enum('CognitiveBalance.verdict', $e['cognitive_balance']['verdict'] ?? null, $VERDICT);

// ---------------------------------------------------- vulnerable students
[$s, $b] = hit('POST', '/api/audit/vulnerable-students', ['course_id' => 1]);
check('POST /audit/vulnerable-students 200', $s === 200, "got $s");
$v = $b['data'] ?? [];
keys('VulnerableStudentsReport fields', $v, ['at_risk_count', 'students']);
foreach (($v['students'] ?? []) as $i => $st) {
    keys("AtRiskStudent[$i]", $st, ['student_hash', 'section_name', 'risk_level', 'risk_score', 'ml_probability', 'attendance_pct', 'quiz_trend', 'midterm_pct', 'triggers', 'recommended_action', 'narrative']);
    enum("AtRiskStudent[$i].risk_level", $st['risk_level'] ?? null, $SEV);
    check("AtRiskStudent[$i].quiz_trend has 3", count($st['quiz_trend'] ?? []) === 3);
}

// ---------------------------------------------------------------- reports
[$s, $b] = hit('GET', '/api/reports');
check('GET /reports 200', $s === 200, "got $s");
foreach (($b['data'] ?? []) as $i => $r) {
    keys("Report[$i]", $r, ['id', 'module', 'title', 'severity', 'subject', 'created_at']);
    enum("Report[$i].severity", $r['severity'] ?? null, $SEV);
}

// ------------------------------------------------------------------ result
echo "\npassed: $OK\n";
if ($FAIL) {
    echo 'FAILED: '.count($FAIL)."\n";
    foreach ($FAIL as $f) { echo "  ✗ $f\n"; }
    exit(1);
}
echo "ALL CONFORMANT\n";
exit(0);
