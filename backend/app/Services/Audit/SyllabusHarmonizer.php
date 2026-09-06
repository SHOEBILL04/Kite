<?php

namespace App\Services\Audit;

use App\Models\AuditReport;
use App\Models\Course;
use App\Services\Ai\AiClient;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Curriculum harmonizer: finds re-taught topics and unmet prerequisites
 * between a foundation course (A) and the course that builds on it (B).
 *
 * DETERMINISTIC DETECTION, AI EXPLANATION.
 * -----------------------------------------------------------------------
 * Every finding below is produced in PHP from the syllabus text and two
 * declarative tables (a concept lexicon and a dependency table). The model is
 * never asked *what* is wrong -- only to phrase the findings. That is what
 * makes the audit reproducible: the same two syllabi always yield the same
 * redundancies, the same gaps, and the same alignment score, with or without
 * an API key.
 */
class SyllabusHarmonizer
{
    /**
     * Concept lexicon: canonical topic name => regex alternatives that denote
     * it. Matching is done on normalised (lower-cased, de-marked-up) text.
     */
    private const CONCEPTS = [
        'Asymptotic complexity analysis' => 'asymptotic|big-?o|omega|theta|complexity analysis|master theorem|recurrence relation',
        'Recursion and the call stack' => 'recursion|recursive|call stack|activation record',
        'Divide and conquer' => 'divide[- ]and[- ]conquer|divide and conquer',
        'Graph traversal (BFS/DFS)' => 'breadth[- ]first|depth[- ]first|\bbfs\b|\bdfs\b|graph traversal',
        'Graph representations' => 'adjacency matrix|adjacency list',
        'Hashing' => 'hashing|hash function|open addressing|separate chaining',
        'Linked lists' => 'linked list',
        'Stacks' => '\bstacks?\b',
        'Queues' => '(?<!priority )\bqueues?\b|deque|circular buffer',
        'Trees and traversals' => 'binary tree|tree traversal|pre-?order|in-?order|post-?order',
        'Binary search trees' => 'binary search tree|\bbst\b',
        'Balanced search trees' => 'avl|balance factor|rotation',
        'Heaps and heap-sort' => '\bheaps?\b|heap-?sort|binomial heap|fibonacci heap|decrease-?key',
        'Amortized analysis' => 'amortiz|potential method|accounting method|aggregate analysis',
        'Sorting algorithms' => 'merge sort|quick ?sort|median of medians',
        'Dynamic programming' => 'dynamic programming|memoization|tabulation|optimal substructure',
        'Greedy algorithms' => 'greedy|minimum spanning tree|kruskal|prim|huffman',
        'Shortest paths' => 'dijkstra|bellman-?ford|floyd-?warshall|shortest path',
        'Network flow' => 'network flow|max(imum)? flow|ford-?fulkerson|edmonds-?karp|min-?cut',
        'NP-completeness' => 'np-?complete|3-?sat|polynomial-?time verification|reduction technique',

        // Databases. The lexicon is per-discipline by design: a concept only
        // becomes checkable once the department has named it here, and a course
        // pair outside the listed vocabulary would otherwise score a vacuous
        // 100 because nothing was ever looked for.
        'Entity-relationship modelling' => 'entity[- ]relationship|\ber\b diagram|er modelling|er model|er-to-(relational|table)|weak entit|participation constraint',
        'Relational model and keys' => 'relational model|candidate key|foreign key|referential integrity|primary key',
        'Relational algebra' => 'relational algebra|theta join|equi-?join|natural join',
        'SQL' => '\bsql\b|group by|subquer|common table expression',
        'Functional dependencies' => 'functional dependenc|armstrong|attribute closure|canonical cover',
        'Normalization' => 'normaliz|\bbcnf\b|\b[123]nf\b|lossless[- ]join|dependency-?preserving',
        'Physical storage and buffering' => 'buffer management|page[s]? and record|physical storage|sequential vs random',
        'Indexing' => 'b\+ ?tree|b-tree|clustered index|unclustered|hash index|indexing strategy',
        'Query processing' => 'query processing|nested loop|sort-?merge|hash join|query plan',
        'Transactions and concurrency control' => 'transaction|\bacid\b|isolation level|concurrency control|serializab|write skew|lost update',
        'Recovery and logging' => 'write-?ahead log|\bwal\b|checkpoint|crash recovery|failure recovery',

        // Software engineering.
        'Software process models' => 'waterfall|scrum|kanban|\bagile\b|spiral|process model',
        'Requirements engineering' => 'requirements engineering|use case|user stor|acceptance criteria|elicitation',
        'Software architecture' => 'architectural design|microservice|client-?server|event-?driven|layering',
        'Design patterns' => 'design pattern|\bsolid\b|coupling and cohesion|refactoring',
        'Software testing' => 'unit test|integration test|regression test|boundary value|equivalence partition|test automation|test double',
        'Release and configuration management' => 'configuration management|release engineering|continuous integration|versioning strateg',
    ];

    /**
     * Dependency table: advanced material that presupposes a foundation topic.
     *
     * Read as "if course B teaches <trigger>, it assumes the student already
     * has <concept>; if course A never covers <concept>, that is a gap." This
     * is the curriculum-dependency metadata a department already maintains
     * informally -- making it explicit is what lets the check be deterministic
     * rather than a guess.
     *
     * concept => [trigger regex in B, severity]
     */
    private const DEPENDENCIES = [
        'Heaps and heap-sort' => ['binomial heap|fibonacci heap|decrease-?key|advanced heaps', 'high'],
        'Amortized analysis' => ['potential method|accounting method|aggregate analysis|amortized', 'medium'],
        'Graph representations' => ['network flow|max(imum)? flow|shortest path', 'medium'],
        'Transactions and concurrency control' => ['isolation level|acid guarantee|lost update|write skew|transaction boundar', 'high'],
        'Recovery and logging' => ['write-?ahead log|\bwal\b|checkpoint|replay after', 'high'],
    ];

    /** Dice-coefficient floor for calling two weeks the same material. */
    private const REDUNDANCY_FLOOR = 0.12;

    /** Tokens too generic to carry topical meaning. */
    private const STOPWORDS = [
        'the', 'and', 'of', 'to', 'in', 'a', 'an', 'for', 'with', 'on', 'or', 'as',
        'week', 'introduction', 'fundamentals', 'principles', 'overview', 'analysis',
        'advanced', 'basic', 'review', 'topics', 'course', 'using', 'via', 'their',
    ];

    public function __construct(protected AiClient $aiClient) {}

    /**
     * @param  int  $courseAId  Foundation course (e.g. CSE 2101)
     * @param  int  $courseBId  Advanced course (e.g. CSE 2103)
     * @return array Matches SyllabusReport in contract.js
     */
    public function harmonise(int $courseAId, int $courseBId): array
    {
        $courseA = Course::find($courseAId);
        $courseB = Course::find($courseBId);

        if (! $courseA || ! $courseB) {
            return $this->aiClient->loadFixture('syllabus');
        }

        $weeksA = $this->parseWeeks((string) $courseA->syllabus_markdown);
        $weeksB = $this->parseWeeks((string) $courseB->syllabus_markdown);

        $redundantTopics = $this->findRedundancies($courseA, $weeksA, $courseB, $weeksB);
        $missingPrerequisites = $this->findMissingPrerequisites($courseA, $weeksA, $courseB, $weeksB);
        $bloomCoverage = $this->bloomCoverage($weeksA, $weeksB);

        // Alignment: each re-taught week costs 8, each unmet prerequisite 12.
        $alignmentScore = (int) max(0, min(100,
            100 - (count($redundantTopics) * 8) - (count($missingPrerequisites) * 12)
        ));

        $actionableChanges = $this->actionableChanges($courseA, $courseB, $redundantTopics, $missingPrerequisites);

        $report = [
            'alignment_score' => $alignmentScore,
            'redundant_topics' => $redundantTopics,
            'missing_prerequisites' => $missingPrerequisites,
            'bloom_coverage' => $bloomCoverage,
            'actionable_changes' => $actionableChanges,
            'ai_summary' => $this->summarise(
                $courseA, $courseB, $alignmentScore, $redundantTopics, $missingPrerequisites
            ),
        ];

        $this->persistReport($courseAId, $report);

        return $report;
    }

    /**
     * Split a syllabus into week entries.
     *
     * Annotations wrapped in *( ... )* are stripped before any matching. The
     * seed data labels its own planted anomalies that way, and an auditor that
     * reads the answer key is not an auditor.
     *
     * @return array<int, array{week:int, label:string, text:string, norm:string}>
     */
    private function parseWeeks(string $markdown): array
    {
        $weeks = [];

        foreach (explode("\n", $markdown) as $line) {
            if (! preg_match('/^\s*[-*]\s*\*\*Week\s+(\d+)[:.]?\*\*\s*(.+)$/i', trim($line), $m)) {
                continue;
            }

            $text = $m[2];
            $text = preg_replace('/\*\([^)]*\)\*/', '', $text);   // drop *( ... )* annotations
            $text = preg_replace('/\$[^$]*\$/', ' ', $text);       // drop inline LaTeX
            $text = str_replace(['**', '*', '[', ']'], ' ', $text);
            $text = trim(preg_replace('/\s+/', ' ', $text));

            $weeks[] = [
                'week' => (int) $m[1],
                'label' => 'Week '.$m[1],
                'text' => $text,
                'norm' => mb_strtolower($text),
            ];
        }

        return $weeks;
    }

    /**
     * Which lexicon concepts a normalised block of text mentions.
     *
     * @return array<int, string> canonical concept names
     */
    private function conceptsIn(string $norm): array
    {
        $found = [];
        foreach (self::CONCEPTS as $concept => $pattern) {
            if (preg_match('/'.$pattern.'/i', $norm)) {
                $found[] = $concept;
            }
        }

        return $found;
    }

    /**
     * A concept is covered by a course if any of its weeks mentions it.
     *
     * @param  array<int, array{norm:string}>  $weeks
     * @return array<string, array{week:int, label:string, text:string}>  concept => first week covering it
     */
    private function conceptIndex(array $weeks): array
    {
        $index = [];
        foreach ($weeks as $w) {
            foreach ($this->conceptsIn($w['norm']) as $concept) {
                $index[$concept] ??= $w;
            }
        }

        return $index;
    }

    /**
     * Topics taught in the foundation course and taught again in the advanced one.
     *
     * @return array<int, array{topic:string, course_a_ref:string, course_b_ref:string, similarity:float}>
     */
    private function findRedundancies(Course $a, array $weeksA, Course $b, array $weeksB): array
    {
        $indexA = $this->conceptIndex($weeksA);
        $indexB = $this->conceptIndex($weeksB);

        // Keyed by the week of B that re-teaches the material: a week is either
        // a re-teach or it is not, so one finding per week. Where several
        // concepts overlap in the same week, the strongest match names it.
        $byWeekB = [];

        foreach ($weeksB as $wb) {
            foreach ($this->conceptsIn($wb['norm']) as $concept) {
                if (! isset($indexA[$concept])) {
                    continue;
                }

                $wa = $indexA[$concept];
                $similarity = $this->dice($wa['norm'], $wb['norm']);

                if ($similarity < self::REDUNDANCY_FLOOR) {
                    continue;
                }

                $existing = $byWeekB[$wb['week']] ?? null;
                if ($existing !== null && $existing['similarity'] >= $similarity) {
                    continue;
                }

                $byWeekB[$wb['week']] = [
                    'topic' => $concept,
                    'course_a_ref' => $a->code.' · '.$wa['label'],
                    'course_b_ref' => $b->code.' · '.$wb['label'],
                    'similarity' => round($similarity, 2),
                ];
            }
        }

        $redundant = array_values($byWeekB);

        usort($redundant, fn ($x, $y) => $y['similarity'] <=> $x['similarity']);

        return $redundant;
    }

    /**
     * Concepts the advanced course builds on that the foundation course never
     * introduced.
     *
     * @return array<int, array{concept:string, assumed_in:string, never_introduced_in:string, severity:string}>
     */
    private function findMissingPrerequisites(Course $a, array $weeksA, Course $b, array $weeksB): array
    {
        $indexA = $this->conceptIndex($weeksA);
        $missing = [];

        foreach (self::DEPENDENCIES as $concept => [$trigger, $severity]) {
            if (isset($indexA[$concept])) {
                continue; // Course A does teach it -- no gap.
            }

            foreach ($weeksB as $w) {
                if (preg_match('/'.$trigger.'/i', $w['norm'])) {
                    $missing[] = [
                        'concept' => $concept,
                        'assumed_in' => $b->code.' · '.$w['label'],
                        'never_introduced_in' => $a->code,
                        'severity' => $severity,
                    ];
                    break;
                }
            }
        }

        return $missing;
    }

    /**
     * Bloom coverage across both syllabi, inferred from the verbs each week uses.
     *
     * @return array{C1:int,C2:int,C3:int,C4:int,C5:int,C6:int}
     */
    private function bloomCoverage(array $weeksA, array $weeksB): array
    {
        $verbs = [
            'C1' => 'introduction|fundamental|notation|represent|review|overview|definition',
            'C2' => 'explain|describe|principle|understand|classif|compare',
            'C3' => 'implement|apply|conversion|convert|traversal|insertion|deletion|search|construct',
            'C4' => 'analys|analyz|complexity|bound|trade-?off|amortiz|balance',
            'C5' => 'optimi|evaluat|strategy|randomiz|approximation|justif',
            'C6' => 'design|formulat|theorem|reduction|np-?complete|proof',
        ];

        $counts = ['C1' => 0, 'C2' => 0, 'C3' => 0, 'C4' => 0, 'C5' => 0, 'C6' => 0];

        foreach (array_merge($weeksA, $weeksB) as $w) {
            foreach ($verbs as $level => $pattern) {
                if (preg_match('/'.$pattern.'/i', $w['norm'])) {
                    $counts[$level]++;
                }
            }
        }

        return $counts;
    }

    /**
     * @return array<int, string>
     */
    private function actionableChanges(Course $a, Course $b, array $redundant, array $missing): array
    {
        $changes = [];

        foreach ($redundant as $r) {
            $changes[] = sprintf(
                'Compress "%s" in %s (%s) to a one-session refresher; it is taught in full in %s.',
                $r['topic'],
                $b->code,
                $r['course_b_ref'],
                $r['course_a_ref']
            );
        }

        foreach ($missing as $m) {
            $changes[] = sprintf(
                'Introduce "%s" in %s before %s relies on it at %s.',
                $m['concept'],
                $a->code,
                $b->code,
                $m['assumed_in']
            );
        }

        if ($changes === []) {
            $changes[] = sprintf('No structural changes required between %s and %s.', $a->code, $b->code);
        }

        return $changes;
    }

    /**
     * Deterministic summary. When a model is reachable the AI layer may replace
     * this with better prose, but the sentence is always available and always
     * quotes the numbers the engine actually computed.
     */
    private function summarise(Course $a, Course $b, int $score, array $redundant, array $missing): string
    {
        $deterministic = sprintf(
            'Alignment between %s and %s scores %d/100: %d topic(s) are taught in both courses and %d prerequisite concept(s) are assumed by %s but never introduced in %s.',
            $a->code, $b->code, $score, count($redundant), count($missing), $b->code, $a->code
        );

        try {
            $ai = $this->aiClient->run(
                'syllabus',
                // Tuned for Llama 3.3: imperatives and one worked example; the
                // schema and output contract are appended by GroqDriver.
                <<<'PROMPT'
                You are a university curriculum analyst. Explain the supplied curriculum findings in exactly two sentences for a department head.

                Rules:
                - Reference ONLY the topics, courses and numbers given in the input.
                - Do not invent topics, courses, weeks or figures.
                - Name the courses by their codes exactly as supplied.

                WORKED EXAMPLE
                Input:
                {"course_a":"CSE 1101","course_b":"CSE 1103","alignment_score":68,"redundant_topics":[{"topic":"Loops"}],"missing_prerequisites":[{"concept":"Pointers"}]}

                Output:
                {"ai_summary":"CSE 1101 and CSE 1103 align at 68 out of 100, with Loops taught in full in both courses. CSE 1103 also assumes Pointers, which CSE 1101 never introduces."}
                PROMPT,
                json_encode([
                    'course_a' => $a->code,
                    'course_b' => $b->code,
                    'alignment_score' => $score,
                    'redundant_topics' => $redundant,
                    'missing_prerequisites' => $missing,
                ], JSON_PRETTY_PRINT),
                [
                    'type' => 'object',
                    'required' => ['ai_summary'],
                    'properties' => ['ai_summary' => ['type' => 'string']],
                ]
            );

            $summary = trim((string) ($ai['ai_summary'] ?? ''));

            // A fixture summary names the course pair it was frozen from, so
            // for any other pair it is simply about two other courses.
            if (! empty($ai[AiClient::FROM_FIXTURE])) {
                $summary = '';
            }

            // Reject an empty or placeholder answer rather than shipping it.
            if ($summary !== '' && ! str_contains(mb_strtolower($summary), 'default system fallback')) {
                return $summary;
            }
        } catch (Throwable $e) {
            Log::warning('SyllabusHarmonizer AI summary failed: '.$e->getMessage());
        }

        return $deterministic;
    }

    /**
     * Dice coefficient over content-word sets: 2|A∩B| / (|A|+|B|).
     */
    private function dice(string $x, string $y): float
    {
        $tokens = function (string $s): array {
            preg_match_all('/[a-z][a-z-]{2,}/i', mb_strtolower($s), $m);

            return array_values(array_unique(array_diff($m[0], self::STOPWORDS)));
        };

        $tx = $tokens($x);
        $ty = $tokens($y);

        if ($tx === [] || $ty === []) {
            return 0.0;
        }

        return (2 * count(array_intersect($tx, $ty))) / (count($tx) + count($ty));
    }

    private function persistReport(int $courseId, array $report): void
    {
        try {
            $severity = $report['alignment_score'] < 60
                ? 'high'
                : ($report['alignment_score'] < 80 ? 'medium' : 'low');

            AuditReport::create([
                'auditable_type' => Course::class,
                'auditable_id' => $courseId,
                'module' => 'syllabus',
                'anomalies_found' => [
                    'alignment_score' => $report['alignment_score'],
                    'redundancies' => count($report['redundant_topics']),
                    'missing_prerequisites' => count($report['missing_prerequisites']),
                    'redundant_topics' => $report['redundant_topics'],
                    'missing_prerequisite_concepts' => array_column($report['missing_prerequisites'], 'concept'),
                ],
                'ai_summary' => $report['ai_summary'],
                'severity' => $severity,
                'from_cache' => false,
            ]);
        } catch (Throwable $e) {
            Log::error('Failed to persist syllabus audit report: '.$e->getMessage());
        }
    }
}
