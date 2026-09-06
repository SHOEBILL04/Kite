import PagePlaceholder from '../components/layout/PagePlaceholder.jsx';

/**
 * OWNER: exam-moderation dev.
 * Replace this stub. Suggested composition: a mark-sum banner
 * (`calculated_total` vs `declared_total`), a question `Table` with a
 * `Badge variant={verdict}` per row and expandable `flags`, a duplicates panel
 * showing `similarity_score` and `rewrite_suggestion`, a cognitive-balance
 * split, and `AiSummaryCard`.
 */
export default function ExamModerationPage() {
  return (
    <PagePlaceholder
      module="Exam Moderation"
      description="Validates a draft paper: mark sums, Bloom tagging, duplicate questions, and cognitive balance."
      endpoint="POST /audit/exam-moderation"
      request="{ exam_id: number }"
      responseType="ExamModerationReport"
      queryKey="QUERY_KEYS.examModeration(examId)"
    />
  );
}
