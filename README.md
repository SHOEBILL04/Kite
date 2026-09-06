# CogniFaculty

An academic quality-assurance console for university departments. It audits four
things a department currently checks by hand, if at all:

| Module | Question it answers |
| --- | --- |
| **Grading Parity** | Are two sections of the same course graded to the same standard? |
| **Curriculum Harmonizer** | Does the follow-on course re-teach material, or assume material never taught? |
| **Exam Moderation** | Does this draft paper add up, repeat past questions, and test what it claims? |
| **Student Radar** | Which students are heading for failure while there is still time to act? |

---

## 60-second setup

```bash
git clone <repo> && cd Kite

# ---- backend -------------------------------------------------------------
cd backend
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite

php artisan migrate:fresh --seed     # schema + the demo cohort
php artisan ai:warm                  # run every audit once, populate the cache
php artisan ai:fixtures:dump         # freeze those reports for offline serving
php artisan demo:verify              # assert every planted anomaly is detected
php artisan serve                    # http://localhost:8000

# ---- frontend ------------------------------------------------------------
cd ../frontend
npm install
cp .env.example .env                 # VITE_USE_MOCK=false -> talks to Laravel
npm run dev                          # http://localhost:5173
```

Sign in with the one-click judge button, or `monir@aust.edu` / `password`.

No API key is required. With `GROQ_API_KEY` unset the app runs the full audit
and explains it with deterministic prose — see *AI failover chain* below.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  React 18 + Vite + React Query + Tailwind          localhost:5173        │
│                                                                          │
│  ┌────────────┬──────────────┬──────────────┬────────────────────────┐   │
│  │ Dashboard  │   Grading    │     Exam     │  Curriculum │ Student  │   │
│  │            │   Parity     │  Moderation  │  Harmonizer │  Radar   │   │
│  └────────────┴──────────────┴──────────────┴────────────────────────┘   │
│        every route wrapped in its own <ErrorBoundary> + retry            │
│                                                                          │
│  src/api/contract.js ...... the single source of truth for every shape   │
│  src/api/client.js ........ unwraps {data}, captures {meta}              │
│  ApiStatus badge .......... Live / Cached / Fixture, from meta.source    │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │  JSON over HTTP  { data, meta }
┌───────────────────────────────────▼──────────────────────────────────────┐
│  Laravel 11 API                                     localhost:8000       │
│                                                                          │
│  routes/api.php ──► AuditController ──┬─► GradingDriftAnalyzer           │
│                     VulnerableStudent │   SyllabusHarmonizer             │
│                          Controller   │   ExamModerator                  │
│                                       └─► RiskAnalyzer                   │
│                                             ├── RuleEngine   (weighted)  │
│                                             └── MlScorer     (logistic)  │
│                                                                          │
│  AttachApiMeta middleware ─► stamps {driver, source, latency_ms}         │
│                                                                          │
│  ┌────────────────────── AiClient (explanation only) ─────────────────┐  │
│  │  1. ai_cache (SQLite, prompt-hash keyed)                           │  │
│  │  2. Groq  llama-3.3-70b-versatile  ─ primary                       │  │
│  │  3. Groq  llama-3.1-8b-instant     ─ on 429 / 5xx                  │  │
│  │  4. schema validation + one repair attempt                         │  │
│  │  5. storage/app/fixtures/*.json                                    │  │
│  │  6. deterministic PHP prose  ← always reachable, never throws      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  SQLite: courses · exams · exam_questions · section_grades · students    │
│          audit_reports · ai_cache · ai_runs                             │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │  reads at boot, never at runtime
                          storage/app/ml/risk_model.json
                                    ▲
                                    │  offline, run once
                          backend/train_risk_model.py   (scikit-learn)
```

---

## Design principle: deterministic detection, AI explanation

**Every finding is computed in PHP. The model only phrases it.**

This is the load-bearing decision in the project. An LLM is never asked *is this
paper wrong?* or *which students are at risk?* — it is handed findings that PHP
already computed and asked to write them up for a human reader.

The split is enforced per module:

| Module | Detected deterministically | Explained by AI |
| --- | --- | --- |
| Grading Parity | mean, SD, skewness, z-score, leniency index, normalisation shift | why the gap matters |
| Curriculum Harmonizer | concept lexicon + dependency table over syllabus text | how to restructure |
| Exam Moderation | mark sum, Jaccard duplicate match, mark-to-time heuristic | rewrite suggestions |
| Student Radar | 7-rule weighted score + logistic regression | per-student narrative |

Three things follow, and all three matter more than the novelty of adding an LLM:

1. **Reproducible.** The same inputs produce byte-identical findings on every
   run. An audit a department cannot reproduce is an audit it cannot act on.
2. **Auditable.** Each flag carries its arithmetic — `Attendance 54% is below
   the 60% threshold`, `marks sum to 72 against a declared 70`. A faculty member
   can check the claim without trusting the system.
3. **Degrades to nothing.** Pull the network and the findings are unchanged;
   only the prose gets plainer. The demo has no single point of failure that
   the audience can see.

A corollary worth stating plainly: the model cannot hallucinate a finding,
because it is never in the position to produce one.

---

## AI failover chain

**Groq (Llama) is the only LLM provider.** `AiClient::run()` walks five tiers in
order and **never throws to the caller**:

| # | Tier | When it serves | `meta.source` |
| --- | --- | --- | --- |
| 1 | `ai_cache` (SQLite, keyed by prompt hash) | the same audit ran before | `cached` |
| 2 | Fixture short-cut | `AI_MODE=fixture`/`cache_only`, or no key set | `fixture` |
| 3 | **Groq primary** — `llama-3.3-70b-versatile` | a key is set and the call succeeds | `live` |
| 4 | **Groq fallback** — `llama-3.1-8b-instant` | primary is rate-limited or 5xx | `live` |
| 5 | `storage/app/fixtures/*.json`, then deterministic PHP prose | everything above failed | `fixture` |

Every attempt is written to `ai_runs` with driver, model, token counts, latency
and error, so the failover is inspectable rather than a claim.

### Free-tier limits shape the design

Groq's free tier allows **30 requests/minute and 14,400/day at the organization
level** — extra API keys do not raise it. Two consequences are baked in:

- **Every service makes exactly one AI call per run.** All flagged students in
  one request, all questions in one request. There is no per-item loop anywhere
  in the audit path; `ai:warm` additionally spaces its calls 2.5s apart.
- **429 is treated as routine, not exceptional.** The driver reads `retry-after`
  and the `x-ratelimit-*` headers, backs off 1s → 2s → 4s over three attempts,
  then retries once on the lighter fallback model before giving up. Every 429 is
  logged to `ai_runs` with its rate-limit headers.

### Working around Groq's JSON handling

Groq's OpenAI-compatible layer has **no JSON schema parameter** — `json_object`
mode guarantees syntactically valid JSON and nothing about its shape. So:

- the schema is appended to the **end** of the system message as an explicit
  contract (Llama weights recency heavily), with the instruction *"Respond with
  a single valid JSON object matching this schema exactly. No markdown fences,
  no commentary, no preamble."*;
- ```` ```json ```` fences are stripped defensively before decoding — Llama
  still emits them occasionally despite `json_object` mode;
- the decoded object is validated for required keys and array-typed fields; on
  mismatch there is **one** repair call echoing the invalid output back, and
  then the chain falls through to fixture.

Every audit prompt carries one complete worked example and uses imperatives
rather than soft phrasing, at `temperature 0.2`.

### Configuration

```bash
AI_PROVIDER=groq
AI_MODE=live                 # live | cache_only | fixture
GROQ_API_KEY=                # empty in .env.example — never commit a key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_FALLBACK_MODEL=llama-3.1-8b-instant
GROQ_TIMEOUT=45              # a 70B model on a long prompt is not fast
EMBEDDING_PROVIDER=none      # none | local
```

`backend/.env` is gitignored; no key is hardcoded in any PHP file, config,
seeder, test or fixture — everything reads from `env()`.

Diagnose a key or model-name problem in seconds:

```bash
php artisan ai:test          # one minimal request: model, latency, tokens, parsed response
```

### Two known trade-offs, stated plainly

**Scanned PDFs are not supported.** Groq's Llama models are text-only and cannot
accept a PDF. Paper ingestion extracts text server-side with `smalot/pdfparser`;
if fewer than 200 characters come out, the file is treated as a scanned image
and the upload fails loudly — *"This PDF appears to be scanned. Paste the
question text manually instead."* — routing the user into Paste Text mode rather
than silently producing garbage.

**Groq has no embedding endpoint.** `EMBEDDING_PROVIDER` selects the strategy:
`none` (the default) means similarity comparison runs on Jaccard token overlap
alone and reports `method: 'lexical_only'` so the UI can say so honestly;
`local` reads precomputed vectors from `storage/app/embeddings/*.json` generated
offline, with no runtime API call. Similarity never throws when embeddings are
absent — it degrades to the lexical score.

### Verified kill-switch

## ML model card — student risk

**Model.** L2-regularised logistic regression on 9 features (6 measured, 3
derived), trained by `backend/train_risk_model.py` and exported to
`storage/app/ml/risk_model.json`. PHP scores it with standardise → dot product →
sigmoid. **No Python at runtime, no model server, no inference dependency.**

**Measured performance** — held-out 20% stratified test split, n=400 of 2,000:

| Metric | Value |
| --- | --- |
| Accuracy | 0.865 |
| Precision | 0.830 |
| Recall | 0.819 |
| F1 | 0.825 |
| ROC-AUC | **0.942** |
| 5-fold CV ROC-AUC | **0.941 ± 0.018** |

Confusion matrix: TN 219 · FP 26 · FN 28 · TP 127. Cohort base rate 38.8%. The
tight CV spread (±0.018) indicates a stable fit rather than a lucky split.

**What the model learned** (standardised coefficients, largest first):

| Feature | Coefficient | Reading |
| --- | --- | --- |
| `quiz_slope` | −1.603 | **Trajectory dominates.** A falling quiz trend is the single strongest signal. |
| `quiz3` | −0.950 | Recent performance outweighs earlier performance. |
| `assignment_delay_count` | +0.569 | Each late submission raises risk. |
| `attendance_pct` | −0.561 | Disengagement, about equal in weight to lateness. |
| `midterm_pct` | −0.371 | Confirms the flag rather than driving it. |
| `midterm_vs_quiz` | −0.132 | Small exam-specific-failure correction. |
| `quiz_volatility` | +0.048 | Contributes least. |

The headline: **decline predicts better than level.** A student at 65% and
falling is a higher priority than one steady at 60% — the case a static
grade-cutoff rule cannot make. (`quiz1` carries a small positive coefficient,
+0.165, as a collinear correction against the slope term, not because strong
early quizzes cause risk.)

**Why logistic regression and not a tree ensemble.** Interpretability is the
product — an advisor needs to know *why*, and a signed coefficient answers that
where a SHAP plot does not. The signal is monotone in every input, which is
exactly where boosting's extra capacity buys nothing and overfits. And a linear
model is 9 numbers plus an intercept: it serialises to JSON and re-implements in
15 lines of PHP, where a 300-tree ensemble would force a Python service into the
deployment.

**Limitation, stated plainly.** *The training data is synthetic* — 2,000
students drawn from four hand-specified archetypes (steady-strong, steady-weak,
late-collapse, chronic-disengaged) with Bernoulli-drawn labels and real
irreducible noise. The metrics above are honest measurements on held-out data,
but they measure how well the model recovers **our** generative assumptions, not
real student outcomes. We are not claiming 0.94 AUC on a real cohort. What the
synthetic data does establish is that the pipeline, the feature set and the PHP
scoring path are correct end to end.

**Retraining on real data.** The export format is the entire contract. An
institution replaces Step 1 of `train_risk_model.py` with a query over its own
records — the same nine features per student per term, labelled with an actual
outcome (failure, withdrawal, or probation at term end) — and re-runs the
script. Everything downstream is unchanged: same scaler, same fit, same JSON,
same PHP. Realistically that means one historical term to train, one held-out
term to validate *temporally* rather than randomly, threshold recalibration
against the advising team's real capacity, and a subgroup fairness audit before
any of it is shown to staff.

### Two scorers, deliberately

Student Radar runs a transparent 7-rule weighted engine **and** the logistic
model, then takes the **more severe** verdict — under-flagging costs a student,
over-flagging costs an advisor ten minutes. Each student carries an `agreement`
flag; where the two disagree, that disagreement is itself the finding. On the
seeded cohort the rule engine scores STU_042 at 38/100 (safe) while the model
puts it at p=0.99 (critical) — the conservative bias catches it.

---

## Verification

```bash
php artisan demo:verify           # 24 assertions over every planted anomaly
php scripts/contract_check.php    # 404 checks: live API vs contract.js
php scripts/latency_check.php     # per-module latency against a 300 ms budget
php scripts/killswitch_check.php  # full results with .env renamed away
```

`demo:verify` exits non-zero if any planted anomaly stops being detected. Run it
before presenting.

---

## Repository layout

```
backend/
  app/Services/Audit/       GradingDriftAnalyzer · SyllabusHarmonizer · ExamModerator
  app/Services/Risk/        RuleEngine · MlScorer · RiskAnalyzer
  app/Services/Ai/          AiClient · GroqDriver · AiTelemetry
  app/Console/Commands/     ai:test · ai:warm · ai:fixtures:dump · demo:verify
  storage/app/ml/           risk_model.json   (committed — required at runtime)
  storage/app/fixtures/     frozen reports    (committed — offline serving)
  train_risk_model.py       offline trainer; not a runtime dependency
  scripts/                  contract · latency · kill-switch checkers
frontend/
  src/api/contract.js       single source of truth for every response shape
  src/api/client.js         envelope unwrapping + meta capture
  src/api/apiStatus.js      Live/Cached/Fixture store
  src/components/           ErrorBoundary · ui/ApiStatus · layout/AppShell
  src/pages/                one page per module
```
