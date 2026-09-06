<?php
/**
 * Measures each module's end-to-end response time through the HTTP stack.
 * Temporary dev tool -- not part of the app.
 */
require __DIR__.'/../vendor/autoload.php';
$app = require_once __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$BUDGET_MS = 300;

$calls = [
    'grading-drift' => ['POST', '/api/audit/grading-drift', ['course_id' => 1]],
    'syllabus' => ['POST', '/api/audit/syllabus', ['course_a_id' => 1, 'course_b_id' => 2]],
    'exam-moderation' => ['POST', '/api/audit/exam-moderation', ['exam_id' => 2]],
    'vulnerable-students' => ['POST', '/api/audit/vulnerable-students', ['course_id' => 1]],
    'dashboard/summary' => ['GET', '/api/dashboard/summary', []],
];

echo str_repeat('=', 72)."\nLATENCY (budget: {$BUDGET_MS} ms, best of 3 after 1 warm-up)\n".str_repeat('=', 72)."\n";

$over = 0;

foreach ($calls as $label => [$method, $uri, $body]) {
    $samples = [];
    $meta = null;

    for ($i = 0; $i < 4; $i++) {
        $req = Illuminate\Http\Request::create($uri, $method, $body);
        $req->headers->set('Accept', 'application/json');

        $t0 = microtime(true);
        $res = $kernel->handle($req);
        $ms = (microtime(true) - $t0) * 1000;

        if ($i === 0) {
            continue; // discard warm-up (autoloader + container boot)
        }

        $samples[] = $ms;
        $meta ??= json_decode($res->getContent(), true)['meta'] ?? [];
    }

    $best = min($samples);
    $ok = $best < $BUDGET_MS;
    if (! $ok) { $over++; }

    printf(
        "  %s %-22s %6.1f ms   source=%-13s driver=%s\n",
        $ok ? "\033[32m✓\033[0m" : "\033[31m✗\033[0m",
        $label,
        $best,
        $meta['source'] ?? '?',
        $meta['driver'] ?? '?'
    );
}

echo "\n";
if ($over > 0) {
    echo "OVER BUDGET: $over module(s)\n";
    exit(1);
}
echo "ALL MODULES UNDER {$BUDGET_MS} ms\n";
exit(0);
