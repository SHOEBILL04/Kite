/**
 * Risk-factor attribution for the Student Radar drawer.
 *
 * WHY THIS EXISTS
 * ---------------
 * `AtRiskStudent` carries a `risk_score` and a list of `triggers`, but no
 * per-trigger weighting — the API says *that* a student was flagged and *which*
 * rules fired, never how much each rule contributed. "Why was this student
 * flagged?" therefore cannot be answered from the payload alone.
 *
 * These helpers reconstruct a contribution per trigger from the student's own
 * published indicators (attendance, quiz trend, midterm), then normalise the
 * result so the parts sum exactly to the reported `risk_score`. The arithmetic
 * is deterministic and inspectable, and the UI labels it as reconstructed —
 * it must never be presented as a number the backend returned.
 *
 * If the backend later returns weights, delete this module and read them.
 */

/** Floor for a rule that fired: a trigger the model raised is never worth zero. */
const MINIMUM_WEIGHT = 4;

/**
 * How far each indicator sits inside its concern band. Every rule below is a
 * distance from a threshold, so a worse indicator always earns more weight.
 */
const RULES = [
  {
    id: 'late_submissions',
    label: 'Late submissions',
    // "4 late assignments" -> 4 submissions, each worth six points of concern.
    test: /late/i,
    weight: (student, trigger) => (Number(/(\d+)/.exec(trigger)?.[1]) || 1) * 6,
    explain: (student, trigger) => `${/(\d+)/.exec(trigger)?.[1] ?? 'Several'} submissions past deadline`,
  },
  {
    id: 'attendance',
    label: 'Attendance',
    test: /attendance/i,
    weight: (student) => 85 - (student.attendance_pct ?? 85),
    explain: (student) => `${student.attendance_pct}% attended, against an 85% expectation`,
  },
  {
    // Checked before `midterm`: an anomaly is about the gap, not the level.
    id: 'coursework_gap',
    label: 'Coursework-vs-exam gap',
    test: /anomal|outlier/i,
    weight: (student) => Math.abs(quizMean(student) - (student.midterm_pct ?? 0)),
    explain: (student) =>
      `${Math.round(Math.abs(quizMean(student) - (student.midterm_pct ?? 0)))} points between quiz average and midterm`,
  },
  {
    id: 'quiz_decline',
    label: 'Quiz decline',
    test: /collapse|declin|decay|fall|drop/i,
    weight: (student) => firstQuiz(student) - lastQuiz(student),
    explain: (student) =>
      `Quiz 1 ${firstQuiz(student)}% down to Quiz ${student.quiz_trend?.length ?? 3} ${lastQuiz(student)}%`,
  },
  {
    id: 'quiz_band',
    label: 'Sustained low quizzes',
    test: /flat|band|quiz/i,
    weight: (student) => 65 - quizMean(student),
    explain: (student) => `Quiz average ${Math.round(quizMean(student))}%, below the 65% band`,
  },
  {
    id: 'midterm',
    label: 'Midterm result',
    test: /midterm|exam|floor/i,
    weight: (student) => 55 - (student.midterm_pct ?? 55),
    explain: (student) => `Midterm ${student.midterm_pct}%, against a 55% concern threshold`,
  },
];

const quizzes = (student) => (student.quiz_trend ?? []).filter((score) => Number.isFinite(score));
const firstQuiz = (student) => quizzes(student)[0] ?? 0;
const lastQuiz = (student) => quizzes(student).at(-1) ?? 0;

/** Mean of the quiz series; 0 when the student has no quizzes. */
export function quizMean(student) {
  const scores = quizzes(student);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
}

/** Quiz slope across the series: negative is falling, positive is rising. */
export function quizSlope(student) {
  const scores = quizzes(student);
  return scores.length > 1 ? scores.at(-1) - scores[0] : 0;
}

/**
 * Split `risk_score` across the student's triggers.
 *
 * Contributions are integers that sum exactly to `risk_score` — the largest
 * remainder absorbs the rounding error, so the bars in the drawer always add up
 * to the number in the header.
 *
 * @param {import('../api/contract.js').AtRiskStudent} student
 * @returns {Array<{trigger: string, id: string, label: string, detail: string,
 *                  points: number, share: number}>}
 */
export function attributeRisk(student) {
  const triggers = student?.triggers ?? [];
  if (!triggers.length) return [];

  const scored = triggers.map((trigger) => {
    const rule = RULES.find((candidate) => candidate.test.test(trigger));
    const raw = rule ? rule.weight(student, trigger) : MINIMUM_WEIGHT;
    return {
      trigger,
      id: rule?.id ?? 'other',
      label: rule?.label ?? 'Other signal',
      detail: rule ? rule.explain(student, trigger) : 'Raised by the risk model',
      raw: Math.max(MINIMUM_WEIGHT, Number.isFinite(raw) ? raw : MINIMUM_WEIGHT),
    };
  });

  const total = scored.reduce((sum, entry) => sum + entry.raw, 0);
  const score = Number.isFinite(student.risk_score) ? student.risk_score : 0;

  const exact = scored.map((entry) => (entry.raw / total) * score);
  const points = exact.map((value) => Math.floor(value));

  // Hand the rounding remainder to the largest fractional parts first, so the
  // integers still sum to `risk_score`.
  let shortfall = Math.round(score) - points.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let step = 0; shortfall > 0 && order.length; step += 1, shortfall -= 1) {
    points[order[step % order.length].index] += 1;
  }

  return scored
    .map((entry, index) => ({
      trigger: entry.trigger,
      id: entry.id,
      label: entry.label,
      detail: entry.detail,
      points: points[index],
      share: score ? (points[index] / score) * 100 : 0,
    }))
    .sort((a, b) => b.points - a.points);
}

/**
 * The performance series the drawer charts: three quizzes then the midterm, on
 * one 0-100 axis because every value is already a percentage.
 *
 * @param {import('../api/contract.js').AtRiskStudent} student
 * @returns {Array<{label: string, value: number}>}
 */
export function trajectorySeries(student) {
  const points = quizzes(student).map((score, index) => ({
    label: `Quiz ${index + 1}`,
    value: score,
  }));
  if (Number.isFinite(student?.midterm_pct)) {
    points.push({ label: 'Midterm', value: student.midterm_pct });
  }
  return points;
}

/**
 * Where the trajectory turns down: the start of the steepest single drop.
 * Returns `null` when the series never falls, so no region is shaded.
 *
 * @param {Array<{label: string, value: number}>} series
 * @returns {{from: string, to: string, drop: number} | null}
 */
export function declineWindow(series) {
  if (!series || series.length < 2) return null;

  let steepestIndex = -1;
  let steepestDrop = 0;
  for (let index = 1; index < series.length; index += 1) {
    const drop = series[index - 1].value - series[index].value;
    if (drop > steepestDrop) {
      steepestDrop = drop;
      steepestIndex = index;
    }
  }

  if (steepestIndex === -1) return null;
  return {
    from: series[steepestIndex - 1].label,
    to: series.at(-1).label,
    drop: steepestDrop,
  };
}
