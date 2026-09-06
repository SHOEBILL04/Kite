import PagePlaceholder from '../components/layout/PagePlaceholder.jsx';

/**
 * OWNER: dashboard dev.
 * Replace this stub. Suggested composition: four `StatCard`s across the top,
 * a severity breakdown chart (Recharts), and a `recent_reports` `Table`.
 */
export default function DashboardPage() {
  return (
    <PagePlaceholder
      module="Dashboard"
      description="Cohort-wide audit posture: counts, severity mix, and the latest reports."
      endpoint="GET /dashboard/summary"
      request="—"
      responseType="DashboardSummary"
      queryKey="QUERY_KEYS.dashboardSummary"
    />
  );
}
