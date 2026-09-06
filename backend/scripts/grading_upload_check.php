<?php
/**
 * End-to-end check of the multi-teacher upload workflow, including the
 * authorization rules. Temporary dev tool -- not part of the app.
 */
require __DIR__.'/../vendor/autoload.php';
$app = require_once __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$kernel->bootstrap(); // Eloquent is used before the first request is handled.

use App\Models\GradingBatch;
use App\Models\SectionGrade;
use App\Models\User;

$FAIL = [];
$OK = 0;

function check(string $label, bool $cond, string $detail = ''): void
{
    global $FAIL, $OK;
    if ($cond) { $OK++; echo "  \033[32m✓\033[0m $label".($detail ? "  \033[90m$detail\033[0m" : '')."\n"; }
    else { $FAIL[] = $label; echo "  \033[31m✗\033[0m $label".($detail ? "  $detail" : '')."\n"; }
}

function tokenFor(string $email): string
{
    $user = User::where('email', $email)->firstOrFail();
    $user->tokens()->delete();

    return $user->createToken('test')->plainTextToken;
}

function call(string $method, string $uri, array $body = [], ?string $token = null, ?array $file = null): array
{
    global $kernel;

    $files = [];
    if ($file) {
        $files['file'] = new Illuminate\Http\UploadedFile($file['path'], $file['name'], 'text/csv', null, true);
    }

    // The auth guard caches its resolved user, and this harness reuses one
    // container across requests -- without forgetting the guards, every later
    // request would run as whoever authenticated first.
    app('auth')->forgetGuards();

    $req = Illuminate\Http\Request::create($uri, $method, $body, [], $files);
    $req->headers->set('Accept', 'application/json');
    if ($token) { $req->headers->set('Authorization', "Bearer $token"); }

    $res = $kernel->handle($req);

    return [$res->getStatusCode(), json_decode($res->getContent(), true), $res];
}

$csv = 'C:/Users/User/AppData/Local/Temp/csv';

$monir = tokenFor('monir@aust.edu');      // faculty, Section A
$hasan = tokenFor('hasan@aust.edu');      // faculty, Section B
$amina = tokenFor('amina@aust.edu');      // head of department

echo "\n=== AUTH & LISTING ===\n";

[$s, $b] = call('GET', '/api/grading-batches');
check('unauthenticated list is rejected', $s === 401, "HTTP $s");

[$s, $b] = call('GET', '/api/grading-batches', [], $amina);
check('HoD lists all batches', $s === 200 && count($b['data']) >= 2, count($b['data'] ?? []).' batch(es)');
$seeded = collect($b['data'])->firstWhere('assessment_name', 'Mid Term');
check('HoD sees full submissions list', count($seeded['submissions'] ?? []) === 2, count($seeded['submissions'] ?? []).' submission(s)');

[$s, $b] = call('GET', '/api/grading-batches', [], $monir);
$facultyBatches = $b['data'] ?? [];
check('faculty lists their course batches', $s === 200 && count($facultyBatches) >= 1, count($facultyBatches).' batch(es)');
check('faculty payload carries my_submission', array_key_exists('my_submission', $facultyBatches[0] ?? []));
check('faculty payload carries sections_submitted', array_key_exists('sections_submitted', $facultyBatches[0] ?? []));
$facultySeeded = collect($facultyBatches)->firstWhere('assessment_name', 'Mid Term');
check('faculty does NOT see other submissions', ($facultySeeded['submissions'] ?? []) === []);

echo "\n=== CREATE (HoD only) ===\n";

[$s, $b] = call('POST', '/api/grading-batches', [
    'course_id' => 1, 'semester' => 'Fall 2024', 'assessment_name' => 'Quiz 4', 'max_marks' => 30,
], $monir);
check('faculty cannot create a batch', $s === 403, "HTTP $s");

[$s, $b] = call('POST', '/api/grading-batches', [
    'course_id' => 1, 'semester' => 'Fall 2024', 'assessment_name' => 'Quiz 4', 'max_marks' => 30,
], $amina);
check('HoD creates a batch', $s === 201, "HTTP $s");
$newBatchId = $b['data']['id'] ?? null;
check('new batch starts collecting', ($b['data']['status'] ?? null) === 'collecting');
check('new batch has empty submissions', ($b['data']['submissions'] ?? null) === []);

echo "\n=== UPLOAD AUTHORIZATION ===\n";

// Hasan teaches Section B, so Section A must be refused.
[$s, $b] = call('POST', "/api/grading-batches/$newBatchId/upload", ['section_name' => 'Section A'], $hasan, ['path' => "$csv/good.csv", 'name' => 'a.csv']);
check('faculty blocked from another section', $s === 403, "HTTP $s");

[$s, $b] = call('POST', "/api/grading-batches/$newBatchId/upload", ['section_name' => 'Section B'], $hasan, ['path' => "$csv/good.csv", 'name' => 'b.csv']);
check('faculty uploads own section', $s === 200, "HTTP $s");
check('batch still collecting after 1 upload', ($b['data']['batch_status'] ?? null) === 'collecting', $b['data']['batch_status'] ?? '');
check('replaced flag false on first upload', ($b['data']['replaced'] ?? null) === false);

[$s, $b] = call('POST', "/api/grading-batches/$newBatchId/upload", ['section_name' => 'Section A'], $amina, ['path' => "$csv/messy.csv", 'name' => 'a.csv']);
check('HoD may upload any section', $s === 200, "HTTP $s");
check('batch flips to ready at 2 sections', ($b['data']['batch_status'] ?? null) === 'ready', $b['data']['batch_status'] ?? '');
check('sections_submitted reported', ($b['data']['sections_submitted'] ?? 0) === 2);

echo "\n=== VALIDATION (no partial import) ===\n";

$before = SectionGrade::where('grading_batch_id', $newBatchId)->count();
[$s, $b] = call('POST', "/api/grading-batches/$newBatchId/upload", ['section_name' => 'Section B'], $hasan, ['path' => "$csv/bad.csv", 'name' => 'bad.csv']);
$after = SectionGrade::where('grading_batch_id', $newBatchId)->count();
check('invalid file rejected with 422', $s === 422, "HTTP $s");
check('row_errors returned', count($b['row_errors'] ?? []) > 0, count($b['row_errors'] ?? []).' error(s)');
check('total_errors returned', isset($b['total_errors']), 'total='.($b['total_errors'] ?? '?'));
check('nothing imported on failure', $before === $after, "$before -> $after rows");

[$s, $b] = call('POST', "/api/grading-batches/$newBatchId/upload", ['section_name' => 'Section B'], $hasan, ['path' => "$csv/tiny.csv", 'name' => 'tiny.csv']);
check('too-few-rows file rejected', $s === 422, "HTTP $s");

echo "\n=== RE-UPLOAD REPLACES ===\n";

$rowsBefore = SectionGrade::where('grading_batch_id', $newBatchId)->where('section_name', 'Section B')->count();
[$s, $b] = call('POST', "/api/grading-batches/$newBatchId/upload", ['section_name' => 'Section B'], $hasan, ['path' => "$csv/good.csv", 'name' => 'b2.csv']);
$rowsAfter = SectionGrade::where('grading_batch_id', $newBatchId)->where('section_name', 'Section B')->count();
check('re-upload succeeds', $s === 200, "HTTP $s");
check('replaced flag true', ($b['data']['replaced'] ?? null) === true);
check('rows replaced not duplicated', $rowsBefore === $rowsAfter, "$rowsBefore -> $rowsAfter");
check('one submission per section kept', GradingBatch::find($newBatchId)->submissions()->where('section_name', 'Section B')->count() === 1);

echo "\n=== PRIVACY ===\n";

$hashes = SectionGrade::where('grading_batch_id', $newBatchId)->pluck('student_hash');
check('all identifiers hashed', $hashes->isNotEmpty() && $hashes->every(fn ($h) => str_starts_with($h, 'STU_') && strlen($h) === 12), (string) $hashes->first());
check('no raw identifier persisted', ! $hashes->contains(fn ($h) => str_contains($h, '2021831')), 'checked '.$hashes->count().' rows');

echo "\n=== TEMPLATE ===\n";

[$s, $b, $res] = call('GET', "/api/grading-batches/$newBatchId/template", [], $monir);
ob_start(); $res->sendContent(); $csvBody = ob_get_clean();
check('template streams 200', $s === 200, "HTTP $s");
check('template has correct headers', str_contains($csvBody, 'student_id,mid_marks,quiz_avg,attendance_pct'));
check('template has 3 example rows', substr_count(trim($csvBody), "\n") === 3, substr_count(trim($csvBody), "\n").' newline(s)');

echo "\n=== MY-STATS (own section only) ===\n";

[$s, $b] = call('GET', "/api/grading-batches/$newBatchId/my-stats", [], $hasan);
check('faculty gets own stats', $s === 200, "HTTP $s");
$stats = $b['data'] ?? [];
check('stats carry n / mean / std_dev', isset($stats['n'], $stats['mean'], $stats['std_dev']), "n={$stats['n']} mean={$stats['mean']} sd={$stats['std_dev']}");
check('stats carry a distribution', count($stats['distribution'] ?? []) > 0);
check('NO leniency index leaked', ! array_key_exists('leniency_index', $stats));
check('NO z-score leaked', ! array_key_exists('z_score', $stats));
check('NO other sections leaked', ! array_key_exists('section_stats', $stats) && ($stats['section_name'] ?? '') === 'Section B');

echo "\n=== AUDIT ON BATCH ===\n";

[$s, $b] = call('POST', '/api/audit/grading-drift', ['grading_batch_id' => 2], $amina);
check('audit rejects a batch with 1 section', $s === 422, "HTTP $s");
check('rejection explains why', str_contains($b['message'] ?? '', 'at least two'), $b['message'] ?? '');
check('rejection reports counts', ($b['sections_submitted'] ?? null) === 1);

[$s, $b] = call('POST', '/api/audit/grading-drift', ['grading_batch_id' => 1], $amina);
check('audit runs on a ready batch', $s === 200, "HTTP $s");
$rep = $b['data'] ?? [];
check('report carries batch metadata', isset($rep['batch']['assessment_name']), $rep['batch']['assessment_name'] ?? '');
check('sections carry uploader name', ! empty($rep['section_stats'][0]['uploaded_by'] ?? ''), $rep['section_stats'][0]['uploaded_by'] ?? '');
check('sections carry upload timestamp', ! empty($rep['section_stats'][0]['uploaded_at'] ?? ''));
check('batch marked audited', GradingBatch::find(1)->status === 'audited', GradingBatch::find(1)->status);

[$s, $b] = call('POST', '/api/audit/grading-drift', ['course_id' => 1], $amina);
check('legacy course_id fallback still works', $s === 200, "HTTP $s");
check('fallback resolved to a batch', isset($b['data']['batch']['id']), 'batch '.($b['data']['batch']['id'] ?? '?'));

echo "\n=== DELETE ===\n";

$subB = GradingBatch::find($newBatchId)->submissions()->where('section_name', 'Section B')->first();
[$s, $b] = call('DELETE', "/api/grading-batches/$newBatchId/submissions/{$subB->id}", [], $monir);
check('faculty cannot delete another faculty submission', $s === 403, "HTTP $s");

[$s, $b] = call('DELETE', "/api/grading-batches/$newBatchId/submissions/{$subB->id}", [], $hasan);
check('faculty deletes own submission', $s === 200, "HTTP $s");
check('rows removed with submission', SectionGrade::where('grading_submission_id', $subB->id)->count() === 0);
check('batch drops back to collecting', ($b['data']['batch_status'] ?? null) === 'collecting', $b['data']['batch_status'] ?? '');

echo "\n".str_repeat('=', 60)."\n";
echo "passed: $OK\n";
if ($FAIL) {
    echo 'FAILED: '.count($FAIL)."\n";
    foreach ($FAIL as $f) { echo "  ✗ $f\n"; }
    exit(1);
}
echo "ALL UPLOAD-WORKFLOW CHECKS PASSED\n";
exit(0);
