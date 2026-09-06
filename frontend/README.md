# KITE — Frontend

React 18 · Vite · Tailwind · React Router v6 · TanStack Query · Axios · Lucide · Recharts

```bash
npm install
npm run dev      # http://localhost:5173
```

Ships with `VITE_USE_MOCK=true`, so the app runs complete with **no backend
running**. Flip that one variable in `.env` to `false` to hit the Laravel API at
`VITE_API_URL`. Nothing else changes.

## Read this before you write a page

`src/api/contract.js` is the **single source of truth**. Every endpoint path,
enum, query key, and response shape lives there as JSDoc typedefs. Never inline
a URL string in a page; import from `ENDPOINTS`.

`src/api/client.js` unwraps the Laravel `{ data: ... }` envelope, so a query
function receives the payload described in the contract directly. Failures
reject with an `ApiError` carrying `{ status, message, errors }`. A 401 clears
the token and bounces to `/login`.

```jsx
import { useQuery } from '@tanstack/react-query';
import { ENDPOINTS, QUERY_KEYS } from '../api/contract.js';
import { post } from '../api/client.js';

const { data, isLoading, error } = useQuery({
  queryKey: QUERY_KEYS.gradingDrift(courseId),
  queryFn: () => post(ENDPOINTS.auditGradingDrift, { course_id: courseId }),
  enabled: Boolean(courseId),
});
// data is a GradingDriftReport — see contract.js
```

`src/api/mock.js` holds a fixture for every response, matching the seeded
backend: Section A mean 24.2 / Section B mean 16.5, the Fall 2025 draft paper
with its three planted defects and 72-vs-70 mark sum, and STU_042 / STU_017 /
STU_091. Mock latency is a deliberate 800 ms — build real loading states.

## Layout

```
src/
  api/         contract.js · client.js · mock.js
  components/
    ui/        Card CardHeader CardBody StatCard Badge SeverityPill Button
               Table THead TBody TR TH TD Spinner SpinnerBlock
               EmptyState Skeleton SkeletonTable AiSummaryCard   (barrel: index.js)
    layout/    AppShell.jsx · PagePlaceholder.jsx
  hooks/       useAuth.js
  lib/         cn.js · format.js
  pages/       one file per route — five are stubs waiting for their owner
  router.jsx   routes + ProtectedRoute
```

Import shared UI from the barrel:

```jsx
import { Card, CardHeader, Table, TR, TD, SeverityPill, AiSummaryCard } from '../components/ui';
```

## Design rules

Break these and the app stops looking like one product.

| | |
|---|---|
| Base | `bg-slate-950` |
| Surfaces | `bg-slate-900` + `border-slate-800`, `rounded-lg` |
| Accent | `amber-400` — primary actions and focus rings only |
| Verdicts | `emerald-400` pass · `amber-400` warning · `rose-400` critical |
| Numbers | always `tabular-nums`, right-aligned in tables |
| Headings | `tracking-tight` |
| Forbidden | drop shadows, gradients, a second accent colour, decorative colour |

Density over whitespace. This is an analyst tool: prefer more rows visible over
more air between them.

Colour carries meaning here — route every severity through `SeverityPill` and
every verdict through `Badge variant={verdict}` so the mapping never drifts. The
amber-bordered `AiSummaryCard` is the only amber panel on a page; it marks the
one interpretive voice among the measured numbers.

## Auth

`useAuth()` provides `{ user, token, isAuthenticated, isLoading, login,
demoLogin, register, logout }`. `isLoading` is true only while a stored session
is being restored — `ProtectedRoute` waits it out so a refresh does not eject a
signed-in user.

Seeded logins (password `password`): `monir@aust.edu` (faculty),
`amina@aust.edu` (head of department), `moderator@aust.edu` (moderator).
The login page also has one-click demo buttons per role.

## Routes

| Route | Page | Endpoint |
|---|---|---|
| `/dashboard` | DashboardPage | `GET /dashboard/summary` |
| `/grading-parity` | GradingParityPage | `POST /audit/grading-drift` |
| `/exam-moderation` | ExamModerationPage | `POST /audit/exam-moderation` |
| `/curriculum-harmonizer` | CurriculumHarmonizerPage | `POST /audit/syllabus` |
| `/student-radar` | StudentRadarPage | `POST /audit/vulnerable-students` |
| `/login` | LoginPage | `POST /login`, `/register`, `/demo-login` |

Each stub page carries the endpoint, request body, response typedef, and query
key it should be built against, plus a suggested composition in a comment.
Replace the `<PagePlaceholder>` body — keep the file and its default export.
