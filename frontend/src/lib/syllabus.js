/**
 * Syllabus markdown -> annotated topic rows for the Curriculum Harmonizer diff.
 *
 * The backend stores each course's syllabus as a markdown document
 * (`Course.syllabus_markdown`) shaped like:
 *
 *   # CSE 2101: Data Structures
 *   ### Weekly Topic Breakdown
 *   - **Week 7:** Recursion Fundamentals: Call Stack dynamics, ...
 *
 * The audit response (`SyllabusReport`) points at those lines by reference
 * string — "CSE 2101 · Week 7" — never by id. These helpers turn the prose back
 * into addressable rows so a finding can be painted onto the line it came from.
 *
 * Everything here is pure: same markdown + same report => same rows.
 */

/** Words that carry no signal when matching a finding to a syllabus line. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'its', 'are', 'from', 'into', 'that', 'this',
  'their', 'over', 'under', 'via', 'using', 'basic', 'introduction', 'fundamentals',
  'review', 'principles', 'overview', 'analysis',
]);

/** LaTeX fragments the seeded syllabi carry, rendered as the glyph instead. */
const LATEX = { '\\Omega': 'Ω', '\\Theta': 'Θ', '\\alpha': 'α', '\\beta': 'β', '\\log': 'log' };

/**
 * Strip markdown emphasis, inline math delimiters and the authoring
 * annotations (`*(PLANTED GAP: ...)*`) the seed data carries.
 *
 * @param {string} raw
 * @returns {string}
 */
export function cleanText(raw) {
  let text = String(raw ?? '');
  for (const [tex, glyph] of Object.entries(LATEX)) text = text.split(tex).join(glyph);
  return text
    .replace(/\*\(.*?\)\*/g, '')      // authoring annotation, e.g. *(PLANTED RE-TEACH)*
    .replace(/\$([^$]*)\$/g, '$1')    // inline math delimiters
    .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
    .replace(/`([^`]*)`/g, '$1')      // code spans
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Comparable token set for a phrase. A trailing plural `s` is dropped so
 * "Notations" matches "notation".
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  const tokens = cleanText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .map((word) => (word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word));
  return new Set(tokens);
}

/**
 * Containment overlap, 0..1. The sets are lopsided here — a three-word finding
 * is compared against a thirty-word syllabus line — so the shared count is
 * divided by the *smaller* set rather than by the union.
 */
function overlap(a, b) {
  const left = tokenize(a);
  const right = tokenize(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/** "CSE 2103 · Week 5 (Fibonacci heaps)" -> 5;  no week -> null. */
export function weekOf(reference = '') {
  const match = /week\s*(\d+)/i.exec(reference);
  return match ? Number(match[1]) : null;
}

/** "CSE 2103 · Week 5 (…)" -> "CSE 2103";  unparseable -> null. */
export function courseCodeOf(reference = '') {
  const match = /([A-Z]{2,4}\s?\d{3,4})/.exec(reference);
  return match ? match[1] : null;
}

/**
 * Split a syllabus document into renderable rows.
 *
 * Rows are one of:
 *   - `heading` — a markdown heading, rendered as a section divider
 *   - `topic`   — a bullet; the only kind a finding can be pinned to
 *   - `prose`   — everything else, rendered muted
 *
 * @param {string} [markdown]
 * @returns {{title: string|null, rows: Array<{id: string, kind: 'heading'|'topic'|'prose',
 *           label: string|null, week: number|null, text: string, depth: number}>}}
 */
export function parseSyllabus(markdown) {
  const rows = [];
  let title = null;

  String(markdown ?? '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) {
        const text = cleanText(heading[2]);
        if (heading[1].length === 1 && !title) {
          title = text; // the document title belongs in the panel header, not in a row
          return;
        }
        rows.push({
          id: `h-${index}`,
          kind: 'heading',
          label: null,
          week: null,
          text,
          depth: heading[1].length,
        });
        return;
      }

      const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
      if (bullet) {
        const body = bullet[1];
        const labelled = /^\*\*(.+?):?\*\*:?\s*(.*)$/.exec(body);
        const label = labelled ? cleanText(labelled[1]) : null;
        const text = cleanText(labelled ? labelled[2] : body);
        rows.push({ id: `t-${index}`, kind: 'topic', label, week: weekOf(label ?? ''), text, depth: 0 });
        return;
      }

      rows.push({ id: `p-${index}`, kind: 'prose', label: null, week: null, text: cleanText(trimmed), depth: 0 });
    });

  return { title, rows };
}

/**
 * Pick the syllabus row a finding refers to.
 *
 * The reference's week number narrows the search to a single line in almost
 * every case; the token overlap only breaks ties — or does the whole job when a
 * syllabus carries no week labels at all.
 *
 * @param {ReturnType<typeof parseSyllabus>['rows']} rows
 * @param {string} reference   e.g. "CSE 2101 · Week 7"
 * @param {string} needle      the finding's own wording
 * @returns {string|null} row id
 */
function locate(rows, reference, needle) {
  const topics = rows.filter((row) => row.kind === 'topic');
  if (!topics.length) return null;

  const week = weekOf(reference);
  const scoped = week === null ? topics : topics.filter((row) => row.week === week);
  const pool = scoped.length ? scoped : topics;

  // A reference's own parenthetical ("… (Binomial and Fibonacci heaps)") is a
  // sharper needle than the concept name whenever it is present.
  const hint = /\(([^)]{6,})\)/.exec(reference)?.[1];

  let best = null;
  let bestScore = 0;
  for (const row of pool) {
    const score = Math.max(overlap(needle, row.text), hint ? overlap(hint, row.text) : 0);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  if (best && bestScore >= 0.15) return best.id;
  // A week reference that resolved to exactly one line is trustworthy even when
  // the wording shares nothing — the report named that week deliberately.
  return scoped.length === 1 ? scoped[0].id : null;
}

/**
 * Annotate one side of the diff.
 *
 * `matchKey` is what makes the two columns move together: a redundant pair
 * carries the same key on both sides, so hovering either half highlights both.
 *
 * @param {string|undefined} markdown
 * @param {string} courseCode  e.g. "CSE 2101"
 * @param {'a'|'b'} side       which column this is
 * @param {import('../api/contract.js').SyllabusReport} [report]
 * @returns {{title: string|null, rows: Array, flags: Record<string, {kind: 'redundant'|'missing',
 *           matchKey: string, index: number, detail: string}>}}
 */
export function annotateSyllabus(markdown, courseCode, side, report) {
  const { title, rows } = parseSyllabus(markdown);
  /** @type {Record<string, any>} */
  const flags = {};

  if (!report) return { title, rows, flags };

  (report.redundant_topics ?? []).forEach((topic, index) => {
    const reference = side === 'a' ? topic.course_a_ref : topic.course_b_ref;
    const rowId = locate(rows, reference, topic.topic);
    if (!rowId) return;
    flags[rowId] = {
      kind: 'redundant',
      matchKey: `redundant-${index}`,
      index,
      detail: `Also taught in ${side === 'a' ? topic.course_b_ref : topic.course_a_ref}`,
    };
  });

  // A missing prerequisite is pinned to the line that *assumes* it. The other
  // column has nothing to pin — the concept is absent there by definition.
  (report.missing_prerequisites ?? []).forEach((prerequisite, index) => {
    if (courseCodeOf(prerequisite.assumed_in) !== courseCode) return;
    const rowId = locate(rows, prerequisite.assumed_in, prerequisite.concept);
    if (!rowId) return;
    flags[rowId] = {
      kind: 'missing',
      matchKey: `missing-${index}`,
      index,
      detail: `Assumes ${prerequisite.concept} — never introduced in ${prerequisite.never_introduced_in}`,
    };
  });

  return { title, rows, flags };
}

/** Alignment-score band. Drives the ring colour and the one-line verdict. */
export function scoreBand(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'unknown';
  if (score < 50) return 'critical';
  if (score <= 75) return 'warning';
  return 'pass';
}
