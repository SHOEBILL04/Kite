<?php

namespace App\Services\Risk;

use App\Models\Student;
use RuntimeException;

/**
 * Logistic regression inference in pure PHP.
 *
 * The model is trained offline by `train_risk_model.py` and exported to
 * storage/app/ml/risk_model.json as a scaler + coefficient vector. Scoring is
 * then standardize -> dot product -> sigmoid, which is a dozen lines of
 * arithmetic. There is no Python at runtime, no HTTP call, and no model server
 * to deploy: the whole "ML infrastructure" is one JSON file read once per
 * process.
 */
class MlScorer
{
    /** Cached model artifact, loaded once per process. */
    private ?array $model = null;

    public function __construct(private ?string $modelPath = null)
    {
        $this->modelPath ??= storage_path('app/ml/risk_model.json');
    }

    /**
     * Score one student.
     *
     * @return array{probability:float, tier:string}
     */
    public function score(Student $student): array
    {
        $model = $this->model();
        $features = $this->features($student);

        $z = 0.0;
        foreach ($model['features'] as $i => $name) {
            // Standardize, then accumulate the dot product in the same pass.
            $standardized = ($features[$name] - $model['scaler']['mean'][$i]) / $model['scaler']['scale'][$i];
            $z += $standardized * $model['coefficients'][$i];
        }

        $probability = 1 / (1 + exp(-($z + $model['intercept'])));

        return [
            'probability' => round($probability, 4),
            'tier' => $this->tierFor($probability),
        ];
    }

    /**
     * Map a probability to a tier using the thresholds carried in the export,
     * so retraining can move the boundaries without a code change.
     */
    public function tierFor(float $probability): string
    {
        $thresholds = $this->model()['thresholds'];

        return match (true) {
            $probability >= $thresholds['critical'] => RuleEngine::TIER_CRITICAL,
            $probability >= $thresholds['moderate'] => RuleEngine::TIER_MODERATE,
            default => RuleEngine::TIER_SAFE,
        };
    }

    /**
     * The honest, quotable metrics from the training run.
     *
     * @return array<string, mixed>
     */
    public function metrics(): array
    {
        return $this->model()['metrics'] ?? [];
    }

    public function version(): string
    {
        return (string) ($this->model()['version'] ?? 'unknown');
    }

    /**
     * Build the feature vector, including the three derived features the model
     * was trained on. Keyed by name rather than positionally so the exported
     * `features` order stays the single source of truth.
     *
     * @return array<string, float>
     */
    private function features(Student $student): array
    {
        $q1 = (float) $student->quiz1;
        $q2 = (float) $student->quiz2;
        $q3 = (float) $student->quiz3;
        $quizMean = ($q1 + $q2 + $q3) / 3;

        // Population standard deviation of the three quizzes matches the
        // sample stdev used at training time (statistics.stdev, n-1).
        $variance = (($q1 - $quizMean) ** 2 + ($q2 - $quizMean) ** 2 + ($q3 - $quizMean) ** 2) / 2;

        return [
            'attendance_pct' => (float) $student->attendance_pct,
            'quiz1' => $q1,
            'quiz2' => $q2,
            'quiz3' => $q3,
            'midterm_pct' => (float) $student->midterm_pct,
            'assignment_delay_count' => (float) $student->assignment_delay_count,
            'quiz_slope' => ($q3 - $q1) / 2,
            'quiz_volatility' => sqrt($variance),
            'midterm_vs_quiz' => (float) $student->midterm_pct - $quizMean,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function model(): array
    {
        if ($this->model !== null) {
            return $this->model;
        }

        if (! is_file($this->modelPath)) {
            throw new RuntimeException(
                "Risk model artifact not found at {$this->modelPath}. Run `python train_risk_model.py` to generate it."
            );
        }

        $decoded = json_decode((string) file_get_contents($this->modelPath), true);

        if (! is_array($decoded) || ! isset($decoded['features'], $decoded['coefficients'], $decoded['scaler'], $decoded['intercept'])) {
            throw new RuntimeException("Risk model artifact at {$this->modelPath} is malformed.");
        }

        return $this->model = $decoded;
    }
}
