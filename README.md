# CogniFaculty - Backend Foundation

CogniFaculty is an academic quality-audit platform designed for faculty, department heads, and moderators to detect grading anomalies, curriculum gaps, syllabus duplications, exam quality defects, and student disengagement risks.

This repository contains the Laravel 11 API-only backend foundation with SQLite, Sanctum token authentication, WAL mode concurrency protection, and realistic seed data with calibrated academic anomalies.

---

## Key Architectural Decisions

- **Framework:** Laravel 11 (API-only architecture, no frontend)
- **Database:** SQLite (`database/database.sqlite`)
- **Concurrency & Locking:** SQLite **WAL (Write-Ahead Logging)** mode enabled in `AppServiceProvider::boot()` to prevent "database is locked" errors during simultaneous access by multiple developers and queue workers.
- **Authentication:** Laravel Sanctum token-based SPA authentication.
- **Judge-Facing Fast Path:** Zero-password `/api/demo-login` endpoint enabling one-click instant role authentication (`faculty`, `head_of_department`, `moderator`).
- **CORS:** Pre-configured for `http://localhost:5173` with credentials support.
- **Standardized API Responses:**
  - Success: `{ "data": ... }`
  - Validation / Error: `{ "message": "...", "errors": { ... } }`

---

## Exact Command Sequence: Clone to Running Server

Follow these commands to get the backend running from a fresh clone:

```bash
# 1. Install dependencies
composer install

# 2. Setup environment file
cp .env.example .env

# 3. Generate application encryption key
php artisan key:generate

# 4. Create SQLite database file
touch database/database.sqlite
# (On Windows PowerShell: New-Item database/database.sqlite -ItemType File -Force)

# 5. Run migrations & rich seeder
php artisan migrate --seed

# 6. Start the development server
php artisan serve
```

Server will be running at `http://127.0.0.1:8000`.

---

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description | Payload |
|---|---|---|---|
| `POST` | `/api/demo-login` | One-click judge login (no password required) | `{"role": "faculty"}` \| `head_of_department` \| `moderator` |
| `POST` | `/api/login` | Standard email/password login | `{"email": "monir@aust.edu", "password": "password"}` |
| `POST` | `/api/register` | Register new user | `{"name": "...", "email": "...", "password": "...", "role": "faculty"}` |

### Authenticated Endpoints (`Authorization: Bearer <TOKEN>`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/me` | Fetch authenticated user profile |
| `POST` | `/api/logout` | Revoke active access token |

---

## Seeded Data & Planted Academic Anomalies

### 1. Seeded Users (Password for all: `password`)
- **`monir@aust.edu`** — `Prof. Monir` (Role: `faculty`, Exam Setter)
- **`amina@aust.edu`** — `Dr. Amina` (Role: `head_of_department`)
- **`moderator@aust.edu`** — `Sec. Moderator` (Role: `moderator`)

### 2. Courses & Syllabus Planted Gaps
- **`CSE 2101` (Data Structures):** Comprehensive 12-week syllabus.
- **`CSE 2103` (Algorithms):** Contains deliberate curricular flaws:
  - **Re-teaching redundancy:** Deliberately re-teaches 3 topics already covered in CSE 2101 (*Recursion*, *Complexity Analysis*, *Graph Traversal*).
  - **Prerequisite gaps:** Assumes 2 topics never introduced in prerequisite coursework (*Amortized Analysis*, *Heaps*).

### 3. Exams & Planted Question Flaws
- **Fall 2024 Final (Approved Past Paper):** 8 questions, 70 marks, `is_past_paper = true`.
- **Fall 2025 Final (Draft Paper):** 8 questions with planted audit issues:
  1. **Verb Mismatch [Q2(a)]:** Question stem starts with *"State the definition of..."* (Bloom level C1 recall) but is tagged as **C4 (Analysis)**.
  2. **Duplicate Question [Q4]:** ~90% textually identical to Fall 2024 Q4.
  3. **Unfeasible Workload Allocation [Q5(b)]:** *"Derive and prove the time complexity..."* allocated only **2 marks**.
  4. **Mark-Sum Error:** Question marks sum to **72**, conflicting with declared total of **70**.
  5. **Cognitive Imbalance:** Questions range only from C2 to C4 (zero C5/Evaluate or C6/Create questions).

### 4. Grading Disparities (Section Grades)
- **Section A (Prof. Monir):** Mean midterm score $\approx 24.0 / 30$, $\text{stddev} \approx 2.1$ (Compressed, lenient grading).
- **Section B (Dr. Hasan):** Mean midterm score $\approx 16.5 / 30$, $\text{stddev} \approx 6.8$ (Harsh, erratic grading).
- **Control Cohort Proof:** Underlying quiz averages and attendance percentages are balanced and comparable between both sections, proving the gap is grader-driven rather than cohort-driven.

### 5. Student Risk Profiles (40 Students)
Includes key planted risk cases (with `risk_level` and `risk_score` left NULL for the audit engine):
- **`STU_042`:** Attendance 82%, Quiz 1: 85, Quiz 2: 71, Quiz 3: 38, Midterm: 41% (*Sharp week-6 academic collapse*).
- **`STU_017`:** Attendance 54%, Quizzes 60/58/55, Midterm 49%, 4 late assignments (*Chronic disengagement*).
- **`STU_091`:** Attendance 91%, Quizzes 88/84/86, Midterm 44% (*Exam-specific failure — undetectable by general GPA filters*).
- **`STU_20230104112`:** Benchmark baseline student.

---

## Running Automated Tests

```bash
php artisan test --filter=AuthAndFoundationTest
```
