import PagePlaceholder from '../components/layout/PagePlaceholder.jsx';

/**
 * OWNER: student-radar dev.
 * Replace this stub. Suggested composition: an at-risk `Table` sorted by
 * `risk_score` with a `SeverityPill` for `risk_level` and a quiz-trend
 * sparkline (Recharts LineChart over the three `quiz_trend` values), plus a
 * detail panel showing `triggers`, `recommended_action` and `narrative`.
 */
export default function StudentRadarPage() {
  return (
    <PagePlaceholder
      module="Student Radar"
      description="Surfaces vulnerable students from attendance, quiz trajectory, and midterm signals."
      endpoint="POST /audit/vulnerable-students"
      request="{ course_id: number }"
      responseType="VulnerableStudentsReport"
      queryKey="QUERY_KEYS.vulnerableStudents(courseId)"
    />
  );
}
