<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\SectionGrade;
use App\Models\Student;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuthAndFoundationTest extends TestCase
{
    /**
     * Test SQLite journal mode is WAL.
     */
    public function test_sqlite_wal_mode_is_enabled(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            $mode = DB::select('PRAGMA journal_mode;')[0]->journal_mode;
            $this->assertEquals('wal', strtolower($mode));
        } else {
            $this->markTestSkipped('Not using sqlite driver.');
        }
    }

    /**
     * Test demo login works for all 3 seeded roles without passwords.
     */
    public function test_demo_login_for_all_three_roles(): void
    {
        $roles = ['faculty', 'head_of_department', 'moderator'];

        foreach ($roles as $role) {
            $response = $this->postJson('/api/demo-login', ['role' => $role]);

            $response->assertStatus(200)
                ->assertJsonStructure([
                    'data' => [
                        'user' => ['id', 'name', 'email', 'role', 'department'],
                        'token',
                    ],
                ]);

            $this->assertEquals($role, $response->json('data.user.role'));
            $this->assertNotEmpty($response->json('data.token'));
        }
    }

    /**
     * Test authenticated /api/me and /api/logout endpoints.
     */
    public function test_authenticated_me_and_logout_flow(): void
    {
        $loginRes = $this->postJson('/api/demo-login', ['role' => 'faculty']);
        $token = $loginRes->json('data.token');

        // Test /api/me
        $meRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/me');

        $meRes->assertStatus(200)
            ->assertJsonPath('data.user.email', 'monir@aust.edu');

        // Test /api/logout
        $logoutRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/logout');

        $logoutRes->assertStatus(200)
            ->assertJsonPath('data.message', 'Logged out successfully.');

        // Token should now be invalid
        auth()->forgetGuards();

        $afterLogoutRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/me');

        $afterLogoutRes->assertStatus(401);
    }

    /**
     * Test regular registration and login flow.
     */
    public function test_register_and_login(): void
    {
        $email = 'newfaculty_' . uniqid() . '@aust.edu';

        $registerRes = $this->postJson('/api/register', [
            'name' => 'Dr. New Faculty',
            'email' => $email,
            'password' => 'secret1234',
            'role' => 'faculty',
            'department' => 'CSE',
        ]);

        $registerRes->assertStatus(201)
            ->assertJsonStructure([
                'data' => ['user', 'token'],
            ]);

        // Test standard login
        $loginRes = $this->postJson('/api/login', [
            'email' => $email,
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(200)
            ->assertJsonPath('data.user.email', $email);

        // Test login with invalid password
        $failLoginRes = $this->postJson('/api/login', [
            'email' => $email,
            'password' => 'wrongpass',
        ]);

        $failLoginRes->assertStatus(401)
            ->assertJsonStructure(['message', 'errors']);
    }

    /**
     * Test seeded courses and syllabus overlap/gaps.
     */
    public function test_courses_and_syllabus_planted_anomalies(): void
    {
        $cse2101 = Course::where('code', 'CSE 2101')->first();
        $cse2103 = Course::where('code', 'CSE 2103')->first();

        $this->assertNotNull($cse2101);
        $this->assertNotNull($cse2103);

        // Verify deliberate re-teaching topics exist in CSE 2103
        $this->assertStringContainsString('Recursion', $cse2103->syllabus_markdown);
        $this->assertStringContainsString('Complexity Analysis', $cse2103->syllabus_markdown);
        $this->assertStringContainsString('Graph Traversal', $cse2103->syllabus_markdown);

        // Verify missing prerequisite assumptions in CSE 2103
        $this->assertStringContainsString('Amortized Analysis', $cse2103->syllabus_markdown);
        $this->assertStringContainsString('Heaps', $cse2103->syllabus_markdown);
    }

    /**
     * Test draft exam planted errors.
     */
    public function test_draft_exam_planted_errors(): void
    {
        $draftExam = Exam::where('semester', 'Fall 2025')->where('status', 'draft')->first();
        $this->assertNotNull($draftExam);

        $questions = $draftExam->questions;
        $this->assertCount(8, $questions);

        // Mark sum error: sums to 72, declared is 70
        $this->assertEquals(70, $draftExam->total_marks);
        $this->assertEquals(72, $questions->sum('marks'));

        // Q2(a) verb mismatch: starts with "State the definition", tagged C4
        $q2a = $questions->firstWhere('q_number', '2(a)');
        $this->assertNotNull($q2a);
        $this->assertStringStartsWith('State the definition', $q2a->text);
        $this->assertEquals('C4', $q2a->assigned_bloom_level);

        // Q5(b) unfeasible marks: 2 marks for deriving and proving complexity
        $q5b = $questions->firstWhere('q_number', '5(b)');
        $this->assertNotNull($q5b);
        $this->assertEquals(2.0, $q5b->marks);

        // Cognitive imbalance: zero C5 or C6 questions
        $bloomLevels = $questions->pluck('assigned_bloom_level')->toArray();
        $this->assertNotContains('C5', $bloomLevels);
        $this->assertNotContains('C6', $bloomLevels);
    }

    /**
     * Test section grades distributions and student risk planted cases.
     */
    public function test_section_grades_and_student_risk_cases(): void
    {
        $secAGrades = SectionGrade::where('section_name', 'Section A')->pluck('mid_marks');
        $secBGrades = SectionGrade::where('section_name', 'Section B')->pluck('mid_marks');

        $this->assertCount(20, $secAGrades);
        $this->assertCount(20, $secBGrades);

        // Mean calculations
        $meanA = $secAGrades->avg();
        $meanB = $secBGrades->avg();

        $this->assertEqualsWithDelta(24.0, $meanA, 0.5);
        $this->assertEqualsWithDelta(16.5, $meanB, 0.5);

        // Verify comparable quiz averages and attendance across sections
        $avgAttA = SectionGrade::where('section_name', 'Section A')->avg('attendance_pct');
        $avgAttB = SectionGrade::where('section_name', 'Section B')->avg('attendance_pct');
        $this->assertEqualsWithDelta($avgAttA, $avgAttB, 5.0);

        // Verify planted student risk cases exist
        $stu042 = Student::where('student_hash', 'STU_042')->first();
        $this->assertNotNull($stu042);
        $this->assertEquals(82, $stu042->attendance_pct);
        $this->assertEquals(38, $stu042->quiz3);
        $this->assertEquals(41, $stu042->midterm_pct);
        $this->assertNull($stu042->risk_level);

        $stu017 = Student::where('student_hash', 'STU_017')->first();
        $this->assertNotNull($stu017);
        $this->assertEquals(54, $stu017->attendance_pct);
        $this->assertEquals(4, $stu017->assignment_delay_count);

        $stu091 = Student::where('student_hash', 'STU_091')->first();
        $this->assertNotNull($stu091);
        $this->assertEquals(91, $stu091->attendance_pct);
        $this->assertEquals(44, $stu091->midterm_pct);

        $stuCustom = Student::where('student_hash', 'STU_20230104112')->first();
        $this->assertNotNull($stuCustom);
    }
}
