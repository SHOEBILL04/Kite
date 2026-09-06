# CogniFaculty - Academic Quality-Audit Platform

CogniFaculty is an academic quality-audit platform designed for faculty, department heads, and moderators to detect grading disparities, curriculum gaps, syllabus duplications, exam quality defects, and student disengagement risks.

---

## Project Structure

```text
├── backend/       # Laravel 11 API (Sanctum Auth, SQLite WAL, Rich Seeders)
│   ├── app/
│   ├── database/
│   ├── routes/
│   └── tests/
└── frontend/      # Frontend Application
```

---

## Getting Started: Backend

### 1. Requirements
- PHP 8.2+ (PHP 8.3 recommended) with extensions: `pdo_sqlite`, `sqlite3`, `curl`, `mbstring`, `fileinfo`, `openssl`, `zip`
- Composer 2.x

### 2. Setup Commands

```bash
# Navigate to backend directory
cd backend

# Install dependencies
composer install

# Environment setup
cp .env.example .env
php artisan key:generate

# Initialize SQLite database
touch database/database.sqlite
# (On Windows PowerShell: New-Item database/database.sqlite -ItemType File -Force)

# Run migrations and seed rich test data with planted anomalies
php artisan migrate --seed

# Start the Laravel backend server
php artisan serve
```

The backend will start at **`http://127.0.0.1:8000`**.

---

## Backend API Endpoints

### Public Endpoints

| Method | Endpoint | Description | Payload |
|---|---|---|---|
| `POST` | `/api/demo-login` | **One-click judge login** (no password required) | `{"role": "faculty"}` \| `head_of_department` \| `moderator` |
| `POST` | `/api/login` | Standard email/password login | `{"email": "monir@aust.edu", "password": "password"}` |
| `POST` | `/api/register` | Register new user | `{"name": "...", "email": "...", "password": "...", "role": "faculty"}` |

### Authenticated Endpoints (`Authorization: Bearer <TOKEN>`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/me` | Fetch authenticated user profile |
| `POST` | `/api/logout` | Revoke active access token |

---

## Seeded Data & Planted Academic Anomalies

### Seeded Accounts (Password for all: `password`)
- **`monir@aust.edu`** — `Prof. Monir` (`faculty`, Exam Setter)
- **`amina@aust.edu`** — `Dr. Amina` (`head_of_department`)
- **`moderator@aust.edu`** — `Sec. Moderator` (`moderator`)

### Planted Audit Defects
1. **Curriculum Overlap & Gaps:** `CSE 2103` (Algorithms) deliberately re-teaches 3 topics (*Recursion*, *Complexity Analysis*, *Graph Traversal*) from `CSE 2101` and assumes 2 topics never taught (*Amortized Analysis*, *Heaps*).
2. **Exam Quality Defects (Fall 2025 Draft):**
   - **Q2(a):** Stem begins with *"State the definition..."* (C1 recall) but is tagged **C4 (Analysis)**.
   - **Q4:** ~90% textually identical duplicate of Fall 2024 Final Q4.
   - **Q5(b):** Heavy derivation question allocated only **2 marks**.
   - **Mark sum mismatch:** Question marks sum to **72** (declared total is 70).
   - **Cognitive imbalance:** Highest level is C4 (zero C5 or C6 questions).
3. **Grading Disparity (40 Section Grades):**
   - Section A (Monir): Mean $= 24.0 / 30$, $\text{stddev} \approx 1.87$ (lenient/compressed).
   - Section B (Hasan): Mean $= 16.5 / 30$, $\text{stddev} \approx 6.72$ (harsh/erratic).
   - Underlying quiz averages and attendance are balanced across both sections, proving the gap is grader-driven.
4. **Student Risk Profiles (40 Students):**
   - `STU_042`: attendance 82%, quiz scores 85/71/38, midterm 41% (*sharp week-6 collapse*).
   - `STU_017`: attendance 54%, quiz scores 60/58/55, midterm 49%, 4 late assignments (*chronic disengagement*).
   - `STU_091`: attendance 91%, quiz scores 88/84/86, midterm 44% (*exam-specific failure*).
   - `STU_20230104112`: baseline benchmark student.

---

## Running Backend Automated Tests

```bash
cd backend
php artisan test
```

---

## AI Inference Layer & Multi-Tier Failover Architecture

CogniFaculty treats AI provider unreliability as expected rather than exceptional. The system utilizes an orchestrated, 5-tier failover pipeline via `App\Services\Ai\AiClient`:

```text
               User Audit Request
                       │
                       ▼
          [ 1. Fixture Mode Check ] ── (AI_MODE=fixture or no keys) ──► Return Static Fixture
                       │
                       ▼
          [ 2. SQLite Cache Check ] ── (Hit: SHA256 prompt hash) ─────► Instant Return (<5ms)
                       │
                       ▼
          [ 3. Primary: Gemini Flash ] (with 1s/2s/4s backoff on 429) ─► Cache & Return
                       │
                 (Exhausted / 429)
                       ▼
          [ 4. Fallback: Groq LLaMA 3.3 70B ] ─────────────────────────► Cache & Return
                       │
                 (Failed / Invalid)
                       ▼
          [ 5. One-Shot Schema Repair ] ───────────────────────────────► Cache & Return
                       │
                 (Repair Failed)
                       ▼
          [ 6. Safe Fixture Fallback ] ────────────────────────────────► 100% Guaranteed Return
                       │
                       ▼
           [ Log Audit Trail to ai_runs ]
```

### Key Reliability Guarantees:
1. **Zero-Key Execution:** The application is 100% demoable offline or without external API keys. If keys are missing, it serves deterministic pre-computed fixtures from `storage/app/fixtures/*.json`.
2. **Structural JSON Constraints:** Gemini requests strictly enforce `generationConfig.responseSchema` with `application/json` MIME type, preventing hallucinated formatting.
3. **Pre-Demo Cache Warming (`php artisan ai:warm`):** Pre-runs all audit tasks against the seeded database and populates SQLite `ai_cache`, ensuring lightning-fast responses during live judging.
4. **Fixture Synchronization (`php artisan ai:fixtures:dump`):** Dumps active cache entries to disk so offline fixtures stay current with prompt evolutions.
5. **Audit Run Telemetry (`ai_runs` table):** Tracks model attribution, latency in milliseconds, prompt/completion tokens, and cache hits.

