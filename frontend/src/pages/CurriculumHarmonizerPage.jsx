import PagePlaceholder from '../components/layout/PagePlaceholder.jsx';

/**
 * OWNER: curriculum dev.
 * Replace this stub. Suggested composition: two course selectors, an
 * `alignment_score` gauge, redundant-topic and missing-prerequisite `Table`s,
 * a Bloom coverage RadarChart (Recharts) over `bloom_coverage` C1..C6, an
 * ordered `actionable_changes` list, and `AiSummaryCard`.
 */
export default function CurriculumHarmonizerPage() {
  return (
    <PagePlaceholder
      module="Curriculum Harmonizer"
      description="Compares two syllabi for redundant coverage, missing prerequisites, and Bloom-level balance."
      endpoint="POST /audit/syllabus"
      request="{ course_a_id: number, course_b_id: number }"
      responseType="SyllabusReport"
      queryKey="QUERY_KEYS.syllabus(courseAId, courseBId)"
    />
  );
}
