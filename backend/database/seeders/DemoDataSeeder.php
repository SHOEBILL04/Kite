<?php

namespace Database\Seeders;

use App\Models\AuditReport;
use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\GradingBatch;
use App\Models\GradingSubmission;
use App\Models\SectionGrade;
use App\Models\Student;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Demo data for the modules the core seeder leaves thin.
 *
 * DatabaseSeeder builds the one scripted story every judge is walked through:
 * CSE 2101 Section A vs B, one draft paper, one syllabus pair. Everything else
 * a dropdown offers — the second course, a third section, a clean paper that
 * should pass, a batch that has already been audited — used to resolve to an
 * empty table. This seeder fills those in so no menu leads to a dead end.
 *
 * It runs LAST, after DatabaseSeeder has truncated students, grades and
 * batches, and it only ever adds rows with ids above the scripted ones. That
 * matters: ai:warm and demo:verify both reach for the first two rows of
 * `Course::orderBy('id')` and for the first draft exam, so the scripted demo
 * keeps pointing at exactly what it pointed at before.
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $monir = User::where('email', 'monir@aust.edu')->firstOrFail();
        $hasan = User::where('email', 'hasan@aust.edu')->firstOrFail();
        $amina = User::where('email', 'amina@aust.edu')->firstOrFail();

        // A third teacher, so a three-section batch has three real owners and
        // the per-faculty leniency table is more than a two-row comparison.
        $nusrat = User::updateOrCreate(
            ['email' => 'nusrat@aust.edu'],
            [
                'name' => 'Ms. Nusrat',
                'password' => Hash::make('password'),
                'role' => 'faculty',
                'department' => 'CSE',
                'avatar_seed' => 'nusrat',
            ]
        );

        $cse2103 = Course::where('code', 'CSE 2103')->firstOrFail();

        [$cse3103, $cse4101] = $this->seedCourses();

        $this->seedAlgorithmsExams($cse2103);
        $this->seedDatabaseExam($cse3103);

        $this->seedAlgorithmsCohort($cse2103, $monir, $hasan, $nusrat, $amina);
        $this->seedDatabaseCohort($cse3103, $monir, $hasan, $amina);
        $this->seedSoftwareEngineeringCohort($cse4101);

        $this->seedReportHistory($cse2103, $cse3103);
    }

    /**
     * A second syllabus pair, so the harmonizer is not a one-trick demo.
     *
     * The planted faults mirror the CSE 2101 -> CSE 2103 pair in kind but not
     * in wording: two re-teaches the engine should flag as redundant, and two
     * assumptions the prerequisite never establishes.
     *
     * @return array{0: Course, 1: Course}
     */
    private function seedCourses(): array
    {
        $syllabusCSE3103 = <<<'MD'
# CSE 3103: Database Systems
**Credits:** 3.0 | **Prerequisites:** Data Structures (CSE 2101)

### Course Overview
Relational data modelling, query languages, physical storage, and the query
processing costs a multi-user database is expected to answer for.

### Weekly Topic Breakdown
- **Week 1:** Database landscape: file systems vs DBMS, the three-schema architecture, logical and physical data independence.
- **Week 2:** Entity-Relationship modelling: entities, weak entities, relationship cardinality, participation constraints, ER-to-relational mapping.
- **Week 3:** The Relational Model: relations, keys (super, candidate, primary, foreign), entity and referential integrity constraints.
- **Week 4:** Relational Algebra: selection, projection, set operations, joins (theta, equi, natural, outer), division.
- **Week 5:** SQL I: DDL, constraints, INSERT/UPDATE/DELETE, SELECT fundamentals, NULL semantics and three-valued logic.
- **Week 6:** SQL II: joins, aggregation with GROUP BY/HAVING, correlated and uncorrelated subqueries, common table expressions.
- **Week 7:** Functional Dependencies: Armstrong's axioms, attribute closure, candidate key derivation, canonical cover.
- **Week 8:** Normalization: 1NF, 2NF, 3NF, BCNF, lossless-join and dependency-preserving decomposition.
- **Week 9:** Physical Storage: pages, records, buffer management, and the cost model for sequential versus random I/O.
- **Week 10:** Indexing: B+ tree structure and maintenance, clustered versus unclustered indexes, hash indexes.
- **Week 11:** Query Processing: join algorithms (nested loop, block nested loop, sort-merge, hash join) and their I/O costs.
- **Week 12:** Views, stored procedures, triggers, and the SQL privilege model (GRANT/REVOKE).
MD;

        $syllabusCSE4101 = <<<'MD'
# CSE 4101: Software Engineering
**Credits:** 3.0 | **Prerequisites:** Database Systems (CSE 3103)

### Course Overview
Engineering software that survives more than one release: process, design,
testing, and the operational concerns of a deployed system.

### Weekly Topic Breakdown
- **Week 1:** Software process models: waterfall, incremental, spiral, and agile (Scrum, Kanban) with their characteristic failure modes.
- **Week 2:** Requirements Engineering: elicitation, functional versus non-functional requirements, use cases, user stories, acceptance criteria.
- **Week 3:** Entity-Relationship modelling for application data: entities, cardinality, participation, and ER-to-table mapping for the team project schema. *(PLANTED RE-TEACH: fully covered in CSE 3103 Week 2)*
- **Week 4:** Normalization of the project database to BCNF, with lossless decomposition worked through on the team schema. *(PLANTED RE-TEACH: fully covered in CSE 3103 Week 8)*
- **Week 5:** Architectural design: layering, client-server, microservices, event-driven styles, and architecture trade-off analysis.
- **Week 6:** Design principles and patterns: SOLID, coupling and cohesion, creational and structural patterns, refactoring to patterns.
- **Week 7:** Transaction boundaries in service design: choosing isolation levels, reasoning about ACID guarantees across service calls, and compensating for lost updates and write skew. *(PLANTED GAP: assumes ACID, isolation levels and concurrency control, none of which CSE 3103 covers)*
- **Week 8:** Distributed data and failure recovery: write-ahead logging in service persistence, checkpointing, and replay after a crash. *(PLANTED GAP: assumes recovery and WAL, never introduced in the prerequisite)*
- **Week 9:** Testing I: unit testing, test doubles, equivalence partitioning, boundary value analysis, coverage criteria.
- **Week 10:** Testing II: integration, system and regression testing, the test automation pyramid, continuous integration pipelines.
- **Week 11:** Configuration management, versioning strategies, code review practice, and release engineering.
- **Week 12:** Maintenance, technical debt, effort estimation (COCOMO, story points), and post-incident review.
MD;

        $cse3103 = Course::updateOrCreate(
            ['code' => 'CSE 3103'],
            [
                'title' => 'Database Systems',
                'credits' => 3.0,
                'semester' => 'Fall 2025',
                'syllabus_markdown' => $syllabusCSE3103,
            ]
        );

        $cse4101 = Course::updateOrCreate(
            ['code' => 'CSE 4101'],
            [
                'title' => 'Software Engineering',
                'credits' => 3.0,
                'semester' => 'Spring 2026',
                'syllabus_markdown' => $syllabusCSE4101,
            ]
        );

        return [$cse3103, $cse4101];
    }

    /**
     * Replaces an exam's question set wholesale, so re-running the seeder does
     * not stack duplicates onto a paper.
     */
    private function replaceQuestions(Exam $exam, array $questions, bool $isPastPaper): void
    {
        ExamQuestion::where('exam_id', $exam->id)->delete();

        foreach ($questions as $q) {
            ExamQuestion::create([
                'exam_id' => $exam->id,
                'q_number' => $q[0],
                'text' => $q[1],
                'marks' => $q[2],
                'assigned_bloom_level' => $q[3],
                'assigned_clo' => $q[4],
                'is_past_paper' => $isPastPaper,
            ]);
        }
    }

    /**
     * CSE 2103 gets its own past paper and its own faulty draft.
     *
     * The scripted demo audits the CSE 2101 draft. This gives the exam module a
     * second paper to run on with a different mix of faults, which is what a
     * judge asking "does it only work on the one you prepared?" is testing.
     */
    private function seedAlgorithmsExams(Course $course): void
    {
        $past = Exam::updateOrCreate(
            ['course_id' => $course->id, 'semester' => 'Spring 2025', 'exam_type' => 'Mid'],
            ['status' => 'approved', 'total_marks' => 30]
        );

        $this->replaceQuestions($past, [
            ['1', 'Apply the Master Theorem to solve T(n) = 3T(n/4) + n log n, stating which case applies and why the regularity condition holds.', 6.0, 'C3', 'CLO1'],
            ['2', "Trace Kruskal's algorithm on the weighted graph with edges {(A,B,4),(A,C,3),(B,C,1),(B,D,2),(C,D,5),(D,E,6)}. Show the disjoint-set forest after every accepted edge.", 8.0, 'C3', 'CLO2'],
            ['3', 'Compare the recurrence, partition cost and worst-case behaviour of Merge Sort against randomized Quick Sort on an already-sorted input of size n.', 6.0, 'C4', 'CLO1'],
            ['4', 'Construct the Huffman code for the frequency table {a:45, b:13, c:12, d:16, e:9, f:5} and compute the expected code length per symbol.', 6.0, 'C3', 'CLO2'],
            ['5', 'Justify why the greedy choice is optimal for the fractional knapsack but not for the 0/1 knapsack, using a counterexample of your own construction.', 4.0, 'C5', 'CLO3'],
        ], true);

        // PLANTED FAULTS in the draft below:
        //   Q3   - lifted verbatim from the Spring 2025 Mid Q2 (duplicate).
        //   Q5   - "Prove formally" allocated 2 marks (unfeasible workload).
        //   Q6   - stem says "List the steps", tagged C5 (verb/level mismatch).
        //   Sum  - questions total 78 against a declared 80 (mark-sum error).
        //   Mix  - nothing genuinely above C4 (cognitive skew).
        $draft = Exam::updateOrCreate(
            ['course_id' => $course->id, 'semester' => 'Spring 2025', 'exam_type' => 'Final'],
            ['status' => 'draft', 'total_marks' => 80]
        );

        $this->replaceQuestions($draft, [
            ['1', 'Explain the difference between memoization and tabulation as implementation strategies for dynamic programming, using the rod-cutting problem to ground the comparison.', 10.0, 'C2', 'CLO1'],
            ['2', 'Compute the Longest Common Subsequence of "ALGORITHM" and "LOGARITHM" by filling the full DP table, then recover one optimal subsequence by backtracking.', 12.0, 'C3', 'CLO2'],
            ['3', "Trace Kruskal's algorithm on the weighted graph with edges {(A,B,4),(A,C,3),(B,C,1),(B,D,2),(C,D,5),(D,E,6)}. Show the disjoint-set forest after every accepted edge.", 12.0, 'C3', 'CLO2'],
            ['4', "Analyze why Dijkstra's algorithm fails on graphs containing negative edge weights, and pinpoint where the proof of correctness breaks.", 10.0, 'C4', 'CLO3'],
            ['5', 'Prove formally that the Edmonds-Karp variant of Ford-Fulkerson terminates within O(VE^2) augmentations, including the shortest-augmenting-path monotonicity lemma.', 2.0, 'C4', 'CLO3'],
            ['6', 'List the steps of the Floyd-Warshall algorithm for all-pairs shortest paths.', 8.0, 'C5', 'CLO3'],
            ['7', 'Compute the maximum flow in the network with capacities {(s,a,10),(s,b,10),(a,b,2),(a,t,4),(b,t,9)} and give the corresponding minimum cut.', 12.0, 'C3', 'CLO3'],
            ['8', 'Analyze the reduction from 3-SAT to CLIQUE and what it establishes about the complexity of CLIQUE.', 12.0, 'C4', 'CLO4'],
        ], false);
        // 10+12+12+10+2+8+12+12 = 78, against a declared 80.
    }

    /**
     * A paper with nothing wrong with it.
     *
     * Every planted-fault demo needs one of these. A moderation tool that
     * reports problems on every input it is ever shown has proved nothing; this
     * paper sums to its declared total, spans C2 to C6, repeats no past
     * question, and gives the heavy questions the marks they deserve.
     */
    private function seedDatabaseExam(Course $course): void
    {
        $exam = Exam::updateOrCreate(
            ['course_id' => $course->id, 'semester' => 'Fall 2025', 'exam_type' => 'Mid'],
            ['status' => 'moderated', 'total_marks' => 40]
        );

        $this->replaceQuestions($exam, [
            ['1', 'Describe the three-schema architecture and explain what logical and physical data independence each buy the application developer.', 5.0, 'C2', 'CLO1'],
            ['2', 'Construct an ER diagram for a university library that tracks titles, physical copies, members, loans and reservations, showing every cardinality and participation constraint, then map it to a relational schema.', 8.0, 'C3', 'CLO1'],
            ['3', 'Given R(A,B,C,D,E) with F = {A->BC, CD->E, B->D, E->A}, compute the attribute closure of every candidate key and derive a canonical cover for F.', 7.0, 'C3', 'CLO2'],
            ['4', 'Analyze whether the decomposition of R(A,B,C,D) into R1(A,B) and R2(B,C,D) is lossless and dependency-preserving under F = {A->B, B->CD}. Justify each answer against the relevant test.', 7.0, 'C4', 'CLO2'],
            ['5', 'Evaluate two candidate index designs for a 40-million-row orders table serving a range query on order_date and a point lookup on customer_id. Recommend one and defend the choice on I/O cost grounds.', 7.0, 'C5', 'CLO3'],
            ['6', 'Design a schema, indexing strategy and query plan for a course-registration system that must enforce seat limits under concurrent enrolment, defending every design decision against the workload you assume.', 6.0, 'C6', 'CLO4'],
        ], false);
        // 5+8+7+7+7+6 = 40, matching the declared total exactly.
    }

    /**
     * Deterministic per-student figures derived from a section's profile.
     *
     * Hand-typing another seventy rows would add nothing a formula does not,
     * but the numbers still have to be stable: demo:verify and the fixture dump
     * both assume a rerun of the seeder reproduces the same cohort, so the
     * spread is driven by the student's index rather than by rand().
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildCohort(string $prefix, string $section, int $count, float $meanPct, float $spreadPct, int $maxMarks): array
    {
        $rows = [];

        for ($i = 0; $i < $count; $i++) {
            // Spread the cohort evenly across [-1, 1] then scale, so the mean
            // lands on $meanPct and the width on $spreadPct.
            $offset = $count > 1 ? (2 * $i / ($count - 1)) - 1 : 0.0;
            // A mild cubic bend keeps the middle of the class denser than the
            // tails, which is what a real mark distribution looks like.
            $pct = $meanPct + $spreadPct * (0.6 * $offset + 0.4 * ($offset ** 3));
            $pct = max(8.0, min(98.0, $pct));

            // Quizzes and attendance track ability, not the grader, which is
            // the whole basis of the parity comparison: comparable underlying
            // signal, divergent marks.
            $ability = 45 + 50 * (($i + 0.5) / $count);

            $rows[] = [
                'hash' => sprintf('%s_%s_%03d', $prefix, str_replace(' ', '', $section), $i + 1),
                'mid' => (int) round($maxMarks * $pct / 100),
                'q_avg' => (int) round($maxMarks * 0.55 * ($ability / 100) * 2),
                'att' => (int) round(max(45, min(98, $ability + 8))),
                'q1' => (int) round(max(30, min(99, $ability + 4))),
                'q2' => (int) round(max(30, min(99, $ability))),
                'q3' => (int) round(max(30, min(99, $ability - 3))),
                'mid_pct' => round($pct, 1),
                'late' => $ability < 60 ? 3 : ($ability < 75 ? 1 : 0),
            ];
        }

        return $rows;
    }

    /**
     * Writes one section's grades and student records, plus its submission row.
     */
    private function seedSection(
        Course $course,
        GradingBatch $batch,
        string $section,
        User $faculty,
        array $rows,
        string $fileName,
        int $uploadedHoursAgo
    ): void {
        $submission = GradingSubmission::create([
            'grading_batch_id' => $batch->id,
            'section_name' => $section,
            'faculty_id' => $faculty->id,
            'student_count' => count($rows),
            'uploaded_at' => now()->subHours($uploadedHoursAgo),
            'file_name' => $fileName,
        ]);

        foreach ($rows as $row) {
            SectionGrade::create([
                'course_id' => $course->id,
                'grading_batch_id' => $batch->id,
                'grading_submission_id' => $submission->id,
                'section_name' => $section,
                'faculty_id' => $faculty->id,
                'student_hash' => $row['hash'],
                'mid_marks' => $row['mid'],
                'quiz_avg' => $row['q_avg'],
                'attendance_pct' => $row['att'],
            ]);

            Student::updateOrCreate(
                ['student_hash' => $row['hash']],
                [
                    'course_id' => $course->id,
                    'section_name' => $section,
                    'attendance_pct' => $row['att'],
                    'quiz1' => $row['q1'],
                    'quiz2' => $row['q2'],
                    'quiz3' => $row['q3'],
                    'midterm_pct' => $row['mid_pct'],
                    'assignment_delay_count' => $row['late'],
                    'risk_level' => null,
                    'risk_score' => null,
                ]
            );
        }
    }

    /**
     * CSE 2103: three sections, already audited.
     *
     * Section C is the outlier here rather than B, and it is harsh across the
     * board while its students' quiz averages sit with everyone else's. It also
     * exercises the three-way comparison, which the two-section scripted demo
     * never reaches.
     */
    private function seedAlgorithmsCohort(Course $course, User $monir, User $hasan, User $nusrat, User $amina): void
    {
        $batch = GradingBatch::create([
            'course_id' => $course->id,
            'semester' => $course->semester,
            'assessment_name' => 'Mid Term',
            'max_marks' => 30,
            'created_by' => $amina->id,
            'status' => GradingBatch::STATUS_AUDITED,
        ]);

        $this->seedSection($course, $batch, 'Section A', $monir,
            $this->buildCohort('ALG', 'Section A', 18, 72.0, 26.0, 30),
            'cse2103-section-a-midterm.csv', 96);

        $this->seedSection($course, $batch, 'Section B', $hasan,
            $this->buildCohort('ALG', 'Section B', 18, 69.0, 30.0, 30),
            'cse2103-section-b-midterm.csv', 90);

        // The planted drift: same syllabus, same paper, a mean well below the
        // other two sections.
        $this->seedSection($course, $batch, 'Section C', $nusrat,
            $this->buildCohort('ALG', 'Section C', 18, 53.0, 22.0, 30),
            'cse2103-section-c-midterm.csv', 72);
    }

    /**
     * CSE 3103: two sections that agree.
     *
     * The counter-example for the parity module. Both teachers land within a
     * couple of marks of each other, so the audit should come back clean, which
     * is the only thing that makes the drift finding in CSE 2101 mean anything.
     */
    private function seedDatabaseCohort(Course $course, User $monir, User $hasan, User $amina): void
    {
        $batch = GradingBatch::create([
            'course_id' => $course->id,
            'semester' => $course->semester,
            'assessment_name' => 'Quiz Series',
            'max_marks' => 20,
            'created_by' => $amina->id,
            'status' => GradingBatch::STATUS_READY,
        ]);

        $this->seedSection($course, $batch, 'Section A', $monir,
            $this->buildCohort('DBS', 'Section A', 12, 68.0, 28.0, 20),
            'cse3103-section-a-quiz.csv', 40);

        $this->seedSection($course, $batch, 'Section B', $hasan,
            $this->buildCohort('DBS', 'Section B', 12, 66.5, 27.0, 20),
            'cse3103-section-b-quiz.csv', 36);
    }

    /**
     * CSE 4101 students, with no batch behind them.
     *
     * Student Radar reads the students table directly, so this course gives the
     * radar a third cohort — a deliberately weak one, to show the risk banding
     * is reading the data rather than repeating a fixture.
     */
    private function seedSoftwareEngineeringCohort(Course $course): void
    {
        $rows = $this->buildCohort('SWE', 'Section A', 16, 58.0, 34.0, 100);

        foreach ($rows as $row) {
            Student::updateOrCreate(
                ['student_hash' => $row['hash']],
                [
                    'course_id' => $course->id,
                    'section_name' => 'Section A',
                    'attendance_pct' => $row['att'],
                    'quiz1' => $row['q1'],
                    'quiz2' => $row['q2'],
                    'quiz3' => $row['q3'],
                    'midterm_pct' => $row['mid_pct'],
                    'assignment_delay_count' => $row['late'],
                    'risk_level' => null,
                    'risk_score' => null,
                ]
            );
        }

        // Two hand-placed cases the formula would not produce: a student whose
        // attendance looks fine but whose quiz trajectory is collapsing, and
        // one the attendance rule catches on its own.
        Student::updateOrCreate(
            ['student_hash' => 'SWE_SectionA_TREND'],
            [
                'course_id' => $course->id,
                'section_name' => 'Section A',
                'attendance_pct' => 91,
                'quiz1' => 78,
                'quiz2' => 54,
                'quiz3' => 31,
                'midterm_pct' => 38.0,
                'assignment_delay_count' => 4,
                'risk_level' => null,
                'risk_score' => null,
            ]
        );

        Student::updateOrCreate(
            ['student_hash' => 'SWE_SectionA_ABSENT'],
            [
                'course_id' => $course->id,
                'section_name' => 'Section A',
                'attendance_pct' => 44,
                'quiz1' => 62,
                'quiz2' => 58,
                'quiz3' => 60,
                'midterm_pct' => 51.0,
                'assignment_delay_count' => 6,
                'risk_level' => null,
                'risk_score' => null,
            ]
        );
    }

    /**
     * Backdated reports, so the dashboard and the report list are not empty
     * before `ai:warm` has ever been run.
     *
     * These are marked from_cache so nothing here can be mistaken for a live
     * model response, and they are dated across the past fortnight so the
     * "recent reports" ordering has something to order.
     */
    private function seedReportHistory(Course $cse2103, Course $cse3103): void
    {
        $history = [
            [
                'auditable' => $cse2103,
                'module' => 'grading',
                'severity' => 'high',
                'days' => 2,
                'summary' => 'Section C sits well below Sections A and B on the same Mid Term paper while its quiz averages match theirs, which points at the grader rather than at the cohort.',
                'anomalies' => [
                    ['type' => 'mean_gap', 'detail' => 'Section C mean trails both other sections on a shared paper.'],
                    ['type' => 'signal_mismatch', 'detail' => 'Quiz averages are comparable across all three sections.'],
                    ['type' => 'pass_rate', 'detail' => 'Section C pass rate falls short of Sections A and B.'],
                ],
            ],
            [
                'auditable' => $cse2103,
                'module' => 'exam',
                'severity' => 'high',
                'days' => 4,
                'summary' => 'The Spring 2025 Final draft totals 78 marks against a declared 80, repeats the Mid Term Kruskal question verbatim, and allocates 2 marks to a formal termination proof.',
                'anomalies' => [
                    ['type' => 'mark_sum', 'detail' => 'Questions total 78; the paper declares 80.'],
                    ['type' => 'duplicate', 'detail' => 'Q3 is textually identical to Spring 2025 Mid Q2.'],
                    ['type' => 'workload', 'detail' => 'Q5 asks for a full O(VE^2) proof for 2 marks.'],
                    ['type' => 'verb_mismatch', 'detail' => 'Q6 stem "List the steps" is tagged C5.'],
                ],
            ],
            [
                'auditable' => $cse3103,
                'module' => 'syllabus',
                'severity' => 'medium',
                'days' => 7,
                'summary' => 'CSE 4101 re-teaches ER modelling and BCNF normalization already delivered in CSE 3103, and assumes transaction isolation and write-ahead logging that the prerequisite never introduces.',
                'anomalies' => [
                    ['type' => 'redundancy', 'detail' => 'CSE 4101 Week 3 duplicates CSE 3103 Week 2.'],
                    ['type' => 'redundancy', 'detail' => 'CSE 4101 Week 4 duplicates CSE 3103 Week 8.'],
                    ['type' => 'gap', 'detail' => 'CSE 4101 Week 7 assumes ACID and isolation levels.'],
                    ['type' => 'gap', 'detail' => 'CSE 4101 Week 8 assumes write-ahead logging and recovery.'],
                ],
            ],
            [
                'auditable' => $cse3103,
                'module' => 'student_risk',
                'severity' => 'low',
                'days' => 11,
                'summary' => 'Two students in CSE 3103 crossed the attendance threshold this fortnight; neither shows a falling quiz trajectory, so both were banded moderate rather than critical.',
                'anomalies' => [
                    ['type' => 'attendance', 'detail' => 'Two students below the 60% attendance line.'],
                    ['type' => 'trajectory', 'detail' => 'No falling quiz trend among the flagged pair.'],
                ],
            ],
        ];

        foreach ($history as $entry) {
            $report = AuditReport::create([
                'auditable_type' => Course::class,
                'auditable_id' => $entry['auditable']->id,
                'module' => $entry['module'],
                'anomalies_found' => $entry['anomalies'],
                'ai_summary' => $entry['summary'],
                'severity' => $entry['severity'],
                'from_cache' => true,
            ]);

            // created_at drives both the dashboard ordering and the report
            // list, and Eloquent would otherwise stamp all four identically.
            $report->forceFill([
                'created_at' => now()->subDays($entry['days']),
                'updated_at' => now()->subDays($entry['days']),
            ])->saveQuietly();
        }
    }
}
