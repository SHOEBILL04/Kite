import PagePlaceholder from '../components/layout/PagePlaceholder.jsx';

/**
 * OWNER: grading-parity dev.
 * Replace this stub. Suggested composition: a course selector + "Run audit"
 * `Button`, a per-section stats `Table` (mean, std_dev, skewness, z_score,
 * leniency_index), overlaid distribution histograms (Recharts BarChart over
 * `section_stats[].distribution`), the normalization callout, and
 * `AiSummaryCard` for `ai_summary`.
 */
export default function GradingParityPage() {
  return (
    <PagePlaceholder
      module="Grading Parity Audit"
      description="Detects marker drift between sections of the same course and proposes a normalisation shift."
      endpoint="POST /audit/grading-drift"
      request="{ course_id: number }"
      responseType="GradingDriftReport"
      queryKey="QUERY_KEYS.gradingDrift(courseId)"
    />
  );
}
