<?php

namespace Database\Seeders;

use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\SectionGrade;
use App\Models\Student;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // ---------------------------------------------------------------------
        // 1. SEED USERS
        // ---------------------------------------------------------------------
        $monir = User::updateOrCreate(
            ['email' => 'monir@aust.edu'],
            [
                'name' => 'Prof. Monir',
                'password' => Hash::make('password'),
                'role' => 'faculty',
                'department' => 'CSE',
                'avatar_seed' => 'monir',
            ]
        );

        $amina = User::updateOrCreate(
            ['email' => 'amina@aust.edu'],
            [
                'name' => 'Dr. Amina',
                'password' => Hash::make('password'),
                'role' => 'head_of_department',
                'department' => 'CSE',
                'avatar_seed' => 'amina',
            ]
        );

        $moderator = User::updateOrCreate(
            ['email' => 'moderator@aust.edu'],
            [
                'name' => 'Sec. Moderator',
                'password' => Hash::make('password'),
                'role' => 'moderator',
                'department' => 'CSE',
                'avatar_seed' => 'moderator',
            ]
        );

        $facultyB = User::updateOrCreate(
            ['email' => 'hasan@aust.edu'],
            [
                'name' => 'Dr. Hasan',
                'password' => Hash::make('password'),
                'role' => 'faculty',
                'department' => 'CSE',
                'avatar_seed' => 'hasan',
            ]
        );

        // ---------------------------------------------------------------------
        // 2. SEED COURSES
        // ---------------------------------------------------------------------
        $syllabusCSE2101 = <<<'MD'
# CSE 2101: Data Structures
**Credits:** 3.0 | **Prerequisites:** Structured Programming (CSE 1101)

### Course Overview
Fundamental concepts of data structures, abstract data types (ADTs), memory representation, and algorithm efficiency analysis.

### Weekly Topic Breakdown
- **Week 1:** Introduction to Data Structures, Pointer Arithmetic, Dynamic Memory Allocation, and Asymptotic Notations ($O, \Omega, \Theta$).
- **Week 2:** Linear Data Structures: Static and Dynamic Arrays, Resizing Strategies, Bounds Checking.
- **Week 3:** Singly Linked Lists: Node representation, Insertion, Deletion, Reversal, Cycle Detection (Floyd's Algorithm).
- **Week 4:** Doubly and Circular Linked Lists: Multi-list implementations, Sentinel nodes, Practical memory trade-offs.
- **Week 5:** Stacks: Array vs Linked-List representations, Applications in Expression Parsing, Infix to Postfix Conversion, Postfix Evaluation.
- **Week 6:** Queues: Linear queues, Circular buffers, Double-Ended Queues (Deques), Priority Queue ADT overview.
- **Week 7:** Recursion Fundamentals: Call Stack dynamics, Activation records, Divide-and-Conquer paradigm, Recurrence relations.
- **Week 8:** Trees: Binary Tree fundamentals, Full, Complete, and Degenerate Trees, Recursive Traversals (Pre, In, Post, Level-order).
- **Week 9:** Binary Search Trees (BST): Insertion, Search, Deletion edge cases, Minimum, Maximum, Successor/Predecessor queries.
- **Week 10:** Balanced Search Trees: AVL Trees, Balance Factors, Single Rotations (LL, RR) and Double Rotations (LR, RL), Insertion balance maintenance.
- **Week 11:** Graph Fundamentals: Representations (Adjacency Matrix, Adjacency List), Traversals (Breadth-First Search [BFS], Depth-First Search [DFS]), Connected Components.
- **Week 12:** Hashing: Hash Functions, Separate Chaining, Open Addressing (Linear Probing, Quadratic Probing, Double Hashing), Load Factor Analysis.
MD;

        $syllabusCSE2103 = <<<'MD'
# CSE 2103: Algorithms
**Credits:** 3.0 | **Prerequisites:** Data Structures (CSE 2101)

### Course Overview
Advanced algorithmic paradigms, complexity bounds, optimization strategies, and graph theories.

### Weekly Topic Breakdown
- **Week 1:** Complexity Analysis: Review of asymptotic bounds ($O, \Omega, \Theta$), Master Theorem, and recursion trees. *(PLANTED RE-TEACH)*
- **Week 2:** Recursion: Principles of recursion, execution call stacks, and divide-and-conquer formulation. *(PLANTED RE-TEACH)*
- **Week 3:** Divide and Conquer: Merge Sort, Quick Sort with randomized pivot, Median of Medians, Strassen's Matrix Multiplication.
- **Week 4:** Amortized Analysis: Potential method, Accounting method, Aggregate analysis in dynamic tables. *(PLANTED GAP: Assumes prior coverage of basic amortized analysis never introduced in curriculum)*
- **Week 5:** Priority Queues and Advanced Heaps: Binomial Heaps, Fibonacci Heaps, decrease-key amortized bounds. *(PLANTED GAP: Assumes Binary Heap and Heap-sort were covered in CSE 2101, but they were absent)*
- **Week 6:** Graph Traversal Foundations: Depth-First Search (DFS) and Breadth-First Search (BFS) on directed and undirected graphs. *(PLANTED RE-TEACH)*
- **Week 7:** Greedy Algorithms: Minimum Spanning Trees (Kruskal with DSU, Prim), Fractional Knapsack, Huffman Coding.
- **Week 8:** Dynamic Programming I: Optimal Substructure, Overlapping Subproblems, Memoization vs Tabulation, Rod Cutting, 0/1 Knapsack.
- **Week 9:** Dynamic Programming II: Longest Common Subsequence (LCS), Matrix Chain Multiplication, Edit Distance.
- **Week 10:** Shortest Path Algorithms: Single-Source Shortest Paths (Dijkstra, Bellman-Ford), All-Pairs (Floyd-Warshall).
- **Week 11:** Network Flow: Maximum Flow, Ford-Fulkerson method, Edmonds-Karp algorithm, Min-Cut Max-Flow Theorem.
- **Week 12:** NP-Completeness: Polynomial-time verification, Reduction techniques, 3-SAT to Clique, Approximation Algorithms.
MD;

        $courseCSE2101 = Course::updateOrCreate(
            ['code' => 'CSE 2101'],
            [
                'title' => 'Data Structures',
                'credits' => 3.0,
                'semester' => 'Fall 2024',
                'syllabus_markdown' => $syllabusCSE2101,
            ]
        );

        $courseCSE2103 = Course::updateOrCreate(
            ['code' => 'CSE 2103'],
            [
                'title' => 'Algorithms',
                'credits' => 3.0,
                'semester' => 'Spring 2025',
                'syllabus_markdown' => $syllabusCSE2103,
            ]
        );

        // ---------------------------------------------------------------------
        // 3. SEED EXAMS & QUESTIONS
        // ---------------------------------------------------------------------
        // Past Exam: Fall 2024 Final (Approved, is_past_paper=true, 8 questions, 70 marks)
        $pastExam = Exam::updateOrCreate(
            [
                'course_id' => $courseCSE2101->id,
                'semester' => 'Fall 2024',
                'exam_type' => 'Final',
            ],
            [
                'status' => 'approved',
                'total_marks' => 70,
            ]
        );

        $pastQuestions = [
            [
                'q_number' => '1',
                'text' => 'Compare the internal memory overhead and pointer footprint of a singly linked list against a doubly linked list with clear illustrative diagrams.',
                'marks' => 8.0,
                'assigned_bloom_level' => 'C2',
                'assigned_clo' => 'CLO1',
            ],
            [
                'q_number' => '2',
                'text' => 'Execute step-by-step AVL tree insertions for the numerical sequence [45, 12, 89, 34, 70, 23]. Identify and illustrate every single rotation (LL, RR, LR, RL) performed.',
                'marks' => 10.0,
                'assigned_bloom_level' => 'C3',
                'assigned_clo' => 'CLO2',
            ],
            [
                'q_number' => '3',
                'text' => 'Formulate an algorithm to parse and evaluate postfix arithmetic expressions using an explicit stack. Simulate execution on "12 4 / 5 + 3 *".',
                'marks' => 8.0,
                'assigned_bloom_level' => 'C3',
                'assigned_clo' => 'CLO2',
            ],
            [
                'q_number' => '4',
                'text' => 'Given an undirected graph with 7 vertices and edges {(1,2),(1,3),(2,4),(2,5),(3,6),(3,7),(5,7)}, trace both Breadth-First Search (BFS) and Depth-First Search (DFS) traversals starting from vertex 1. Show the detailed state of the queue and stack data structures at every vertex visitation step.',
                'marks' => 10.0,
                'assigned_bloom_level' => 'C3',
                'assigned_clo' => 'CLO3',
            ],
            [
                'q_number' => '5',
                'text' => 'Critique and contrast linear probing versus quadratic probing collision resolution strategies in hash tables operating at load factor alpha >= 0.75. Explain secondary clustering effects.',
                'marks' => 8.0,
                'assigned_bloom_level' => 'C4',
                'assigned_clo' => 'CLO3',
            ],
            [
                'q_number' => '6',
                'text' => 'Evaluate whether an arbitrary binary tree fulfills Binary Search Tree (BST) invariants in O(n) time. Prove the correctness of using ancestor-derived min/max interval constraints.',
                'marks' => 10.0,
                'assigned_bloom_level' => 'C5',
                'assigned_clo' => 'CLO2',
            ],
            [
                'q_number' => '7',
                'text' => 'Differentiate the asymptotic behavior of QuickSort under deterministic first-element pivot selection versus randomized median pivot selection on sorted arrays.',
                'marks' => 8.0,
                'assigned_bloom_level' => 'C4',
                'assigned_clo' => 'CLO1',
            ],
            [
                'q_number' => '8',
                'text' => 'Synthesize an optimal Least Recently Used (LRU) Cache data architecture combining a doubly linked list and a hash map. Provide pseudo-code for get(key) and put(key, value) maintaining strict O(1) time bounds.',
                'marks' => 8.0,
                'assigned_bloom_level' => 'C6',
                'assigned_clo' => 'CLO4',
            ],
        ];

        ExamQuestion::where('exam_id', $pastExam->id)->delete();
        foreach ($pastQuestions as $q) {
            ExamQuestion::create([
                'exam_id' => $pastExam->id,
                'q_number' => $q['q_number'],
                'text' => $q['text'],
                'marks' => $q['marks'],
                'assigned_bloom_level' => $q['assigned_bloom_level'],
                'assigned_clo' => $q['assigned_clo'],
                'is_past_paper' => true,
            ]);
        }

        // Draft Exam: Fall 2025 Final (Draft, contains 8 questions with planted errors)
        // PLANTED ERRORS:
        // 1. Q2(a): Stem starts with "State the definition of..." but tagged C4 (verb mismatch)
        // 2. Q4: ~90% textually identical to 2024 question (duplicate)
        // 3. Q5(b): "Derive and prove the time complexity of..." allocated only 2 marks (unfeasible)
        // 4. Marks sum to 72, not the declared 70 (mark-sum error)
        // 5. Zero questions tagged C5 or C6 (cognitive imbalance: only C2, C3, C4)
        $draftExam = Exam::updateOrCreate(
            [
                'course_id' => $courseCSE2101->id,
                'semester' => 'Fall 2025',
                'exam_type' => 'Final',
            ],
            [
                'status' => 'draft',
                'total_marks' => 70, // Declared total: 70
            ]
        );

        $draftQuestions = [
            [
                'q_number' => '1',
                'text' => 'Illustrate the internal pointer updates required to delete a node from the middle of a doubly linked list without causing memory leakage.',
                'marks' => 10.0,
                'assigned_bloom_level' => 'C2',
                'assigned_clo' => 'CLO1',
            ],
            [
                // ERROR: Verb "State the definition" is C1 recall, but tagged C4 Analysis!
                'q_number' => '2(a)',
                'text' => 'State the definition of an AVL tree and list the mathematical condition defining the balance factor of any arbitrary node.',
                'marks' => 8.0,
                'assigned_bloom_level' => 'C4', // PLANTED VERB MISMATCH
                'assigned_clo' => 'CLO2',
            ],
            [
                'q_number' => '3',
                'text' => 'Construct a circular queue of size 6 using an array. Show the exact front and rear index pointers after 4 enqueue and 2 dequeue operations.',
                'marks' => 10.0,
                'assigned_bloom_level' => 'C3',
                'assigned_clo' => 'CLO2',
            ],
            [
                // ERROR: ~90% textually identical to Fall 2024 Q4!
                'q_number' => '4',
                'text' => 'Given an undirected graph with 7 vertices and edges {(1,2),(1,3),(2,4),(2,5),(3,6),(3,7),(5,7)}, trace both Breadth-First Search (BFS) and Depth-First Search (DFS) traversals starting from vertex 1. Show the detailed state of the queue and stack data structures at every vertex visitation step.',
                'marks' => 10.0, // PLANTED DUPLICATE
                'assigned_bloom_level' => 'C3',
                'assigned_clo' => 'CLO3',
            ],
            [
                // ERROR: Unfeasible workload for only 2 marks!
                'q_number' => '5(b)',
                'text' => 'Derive and prove the time complexity of collision resolution by double hashing using probabilistic Bernoulli trial assumptions across an infinite key domain.',
                'marks' => 2.0, // PLANTED UNFEASIBLE MARKS
                'assigned_bloom_level' => 'C4',
                'assigned_clo' => 'CLO3',
            ],
            [
                'q_number' => '6',
                'text' => 'Compute the depth, height, and sibling relationships of all nodes in a complete binary tree containing 15 keys stored sequentially in an array.',
                'marks' => 12.0,
                'assigned_bloom_level' => 'C3',
                'assigned_clo' => 'CLO2',
            ],
            [
                'q_number' => '7',
                'text' => 'Deconstruct the worst-case time complexity of BST deletion when the target node possesses two children, accounting for in-order successor swapping.',
                'marks' => 10.0,
                'assigned_bloom_level' => 'C4',
                'assigned_clo' => 'CLO2',
            ],
            [
                'q_number' => '8',
                'text' => 'Analyze the memory footprint and edge-traversal cache locality of adjacency matrix versus adjacency list representations for dense graphs with V > 10,000.',
                'marks' => 10.0,
                'assigned_bloom_level' => 'C4',
                'assigned_clo' => 'CLO1',
            ],
        ];
        // Total marks sum: 10 + 8 + 10 + 10 + 2 + 12 + 10 + 10 = 72 marks (Declared: 70)
        // Highest Bloom level: C4 (Zero C5 or C6 questions -> Cognitive Imbalance)

        ExamQuestion::where('exam_id', $draftExam->id)->delete();
        foreach ($draftQuestions as $q) {
            ExamQuestion::create([
                'exam_id' => $draftExam->id,
                'q_number' => $q['q_number'],
                'text' => $q['text'],
                'marks' => $q['marks'],
                'assigned_bloom_level' => $q['assigned_bloom_level'],
                'assigned_clo' => $q['assigned_clo'],
                'is_past_paper' => false,
            ]);
        }

        // ---------------------------------------------------------------------
        // 4. SEED SECTION GRADES & STUDENTS (40 STUDENTS)
        // ---------------------------------------------------------------------
        // Section A (faculty_id = Monir): mid_marks mean = 24.0, stddev ~2.1 (compressed + lenient)
        // Section B (faculty_id = Hasan): mid_marks mean = 16.5, stddev ~6.8 (harsh + erratic)
        // Underlying quiz_avg and attendance_pct COMPARABLE across both sections.

        // Section A (20 students) - Monir
        // Marks sum = 480 / 20 = 24.0. Variance = 3.5 -> stddev ~ 1.87
        $sectionAData = [
            ['hash' => 'STU_20230104112', 'mid' => 26, 'q_avg' => 17, 'att' => 88, 'q1' => 85, 'q2' => 84, 'q3' => 86, 'mid_pct' => 86.6, 'late' => 0],
            ['hash' => 'STU_042',         'mid' => 21, 'q_avg' => 13, 'att' => 82, 'q1' => 85, 'q2' => 71, 'q3' => 38, 'mid_pct' => 41.0, 'late' => 1], // PLANTED CASE 1
            ['hash' => 'STU_SEC_A_003',   'mid' => 24, 'q_avg' => 15, 'att' => 80, 'q1' => 78, 'q2' => 75, 'q3' => 72, 'mid_pct' => 80.0, 'late' => 0],
            ['hash' => 'STU_SEC_A_004',   'mid' => 25, 'q_avg' => 16, 'att' => 85, 'q1' => 82, 'q2' => 80, 'q3' => 78, 'mid_pct' => 83.3, 'late' => 0],
            ['hash' => 'STU_SEC_A_005',   'mid' => 23, 'q_avg' => 14, 'att' => 78, 'q1' => 72, 'q2' => 70, 'q3' => 68, 'mid_pct' => 76.6, 'late' => 1],
            ['hash' => 'STU_SEC_A_006',   'mid' => 26, 'q_avg' => 17, 'att' => 90, 'q1' => 88, 'q2' => 85, 'q3' => 82, 'mid_pct' => 86.6, 'late' => 0],
            ['hash' => 'STU_SEC_A_007',   'mid' => 24, 'q_avg' => 15, 'att' => 79, 'q1' => 76, 'q2' => 74, 'q3' => 75, 'mid_pct' => 80.0, 'late' => 0],
            ['hash' => 'STU_SEC_A_008',   'mid' => 22, 'q_avg' => 14, 'att' => 75, 'q1' => 70, 'q2' => 72, 'q3' => 68, 'mid_pct' => 73.3, 'late' => 1],
            ['hash' => 'STU_SEC_A_009',   'mid' => 25, 'q_avg' => 16, 'att' => 84, 'q1' => 80, 'q2' => 82, 'q3' => 78, 'mid_pct' => 83.3, 'late' => 0],
            ['hash' => 'STU_SEC_A_010',   'mid' => 27, 'q_avg' => 18, 'att' => 92, 'q1' => 90, 'q2' => 92, 'q3' => 88, 'mid_pct' => 90.0, 'late' => 0],
            ['hash' => 'STU_SEC_A_011',   'mid' => 23, 'q_avg' => 14, 'att' => 76, 'q1' => 74, 'q2' => 70, 'q3' => 66, 'mid_pct' => 76.6, 'late' => 1],
            ['hash' => 'STU_SEC_A_012',   'mid' => 25, 'q_avg' => 15, 'att' => 81, 'q1' => 78, 'q2' => 76, 'q3' => 76, 'mid_pct' => 83.3, 'late' => 0],
            ['hash' => 'STU_SEC_A_013',   'mid' => 24, 'q_avg' => 15, 'att' => 78, 'q1' => 75, 'q2' => 75, 'q3' => 75, 'mid_pct' => 80.0, 'late' => 0],
            ['hash' => 'STU_SEC_A_014',   'mid' => 26, 'q_avg' => 16, 'att' => 86, 'q1' => 82, 'q2' => 80, 'q3' => 78, 'mid_pct' => 86.6, 'late' => 0],
            ['hash' => 'STU_SEC_A_015',   'mid' => 22, 'q_avg' => 13, 'att' => 72, 'q1' => 68, 'q2' => 65, 'q3' => 67, 'mid_pct' => 73.3, 'late' => 2],
            ['hash' => 'STU_SEC_A_016',   'mid' => 25, 'q_avg' => 16, 'att' => 83, 'q1' => 82, 'q2' => 80, 'q3' => 78, 'mid_pct' => 83.3, 'late' => 0],
            ['hash' => 'STU_SEC_A_017',   'mid' => 24, 'q_avg' => 15, 'att' => 80, 'q1' => 76, 'q2' => 74, 'q3' => 75, 'mid_pct' => 80.0, 'late' => 0],
            ['hash' => 'STU_SEC_A_018',   'mid' => 26, 'q_avg' => 17, 'att' => 88, 'q1' => 86, 'q2' => 84, 'q3' => 85, 'mid_pct' => 86.6, 'late' => 0],
            ['hash' => 'STU_SEC_A_019',   'mid' => 23, 'q_avg' => 14, 'att' => 77, 'q1' => 72, 'q2' => 70, 'q3' => 68, 'mid_pct' => 76.6, 'late' => 1],
            ['hash' => 'STU_SEC_A_020',   'mid' => 25, 'q_avg' => 16, 'att' => 84, 'q1' => 80, 'q2' => 82, 'q3' => 78, 'mid_pct' => 83.3, 'late' => 0],
        ];

        // Section B (20 students) - Hasan (Other faculty)
        // Marks sum = 330 / 20 = 16.50. Stddev = 6.72 ~ 6.8 (harsh & erratic)
        $sectionBData = [
            ['hash' => 'STU_017',         'mid' => 15, 'q_avg' => 12, 'att' => 54, 'q1' => 60, 'q2' => 58, 'q3' => 55, 'mid_pct' => 49.0, 'late' => 4], // PLANTED CASE 2
            ['hash' => 'STU_091',         'mid' => 13, 'q_avg' => 17, 'att' => 91, 'q1' => 88, 'q2' => 84, 'q3' => 86, 'mid_pct' => 44.0, 'late' => 0], // PLANTED CASE 3
            ['hash' => 'STU_SEC_B_003',   'mid' => 6,  'q_avg' => 11, 'att' => 70, 'q1' => 55, 'q2' => 52, 'q3' => 48, 'mid_pct' => 20.0, 'late' => 2],
            ['hash' => 'STU_SEC_B_004',   'mid' => 7,  'q_avg' => 12, 'att' => 72, 'q1' => 62, 'q2' => 60, 'q3' => 58, 'mid_pct' => 23.3, 'late' => 1],
            ['hash' => 'STU_SEC_B_005',   'mid' => 8,  'q_avg' => 13, 'att' => 75, 'q1' => 65, 'q2' => 64, 'q3' => 66, 'mid_pct' => 26.6, 'late' => 1],
            ['hash' => 'STU_SEC_B_006',   'mid' => 9,  'q_avg' => 14, 'att' => 78, 'q1' => 70, 'q2' => 72, 'q3' => 68, 'mid_pct' => 30.0, 'late' => 0],
            ['hash' => 'STU_SEC_B_007',   'mid' => 10, 'q_avg' => 14, 'att' => 80, 'q1' => 72, 'q2' => 70, 'q3' => 68, 'mid_pct' => 36.6, 'late' => 1],
            ['hash' => 'STU_SEC_B_008',   'mid' => 11, 'q_avg' => 15, 'att' => 81, 'q1' => 75, 'q2' => 74, 'q3' => 76, 'mid_pct' => 40.0, 'late' => 0],
            ['hash' => 'STU_SEC_B_009',   'mid' => 13, 'q_avg' => 15, 'att' => 82, 'q1' => 76, 'q2' => 75, 'q3' => 74, 'mid_pct' => 46.6, 'late' => 0],
            ['hash' => 'STU_SEC_B_010',   'mid' => 14, 'q_avg' => 16, 'att' => 84, 'q1' => 80, 'q2' => 78, 'q3' => 82, 'mid_pct' => 53.3, 'late' => 0],
            ['hash' => 'STU_SEC_B_011',   'mid' => 16, 'q_avg' => 16, 'att' => 85, 'q1' => 82, 'q2' => 80, 'q3' => 80, 'mid_pct' => 56.6, 'late' => 0],
            ['hash' => 'STU_SEC_B_012',   'mid' => 17, 'q_avg' => 16, 'att' => 86, 'q1' => 84, 'q2' => 82, 'q3' => 84, 'mid_pct' => 60.0, 'late' => 0],
            ['hash' => 'STU_SEC_B_013',   'mid' => 18, 'q_avg' => 17, 'att' => 87, 'q1' => 86, 'q2' => 84, 'q3' => 85, 'mid_pct' => 63.3, 'late' => 0],
            ['hash' => 'STU_SEC_B_014',   'mid' => 19, 'q_avg' => 17, 'att' => 89, 'q1' => 88, 'q2' => 85, 'q3' => 87, 'mid_pct' => 70.0, 'late' => 0],
            ['hash' => 'STU_SEC_B_015',   'mid' => 21, 'q_avg' => 18, 'att' => 90, 'q1' => 90, 'q2' => 88, 'q3' => 90, 'mid_pct' => 76.6, 'late' => 0],
            ['hash' => 'STU_SEC_B_016',   'mid' => 23, 'q_avg' => 18, 'att' => 92, 'q1' => 92, 'q2' => 90, 'q3' => 91, 'mid_pct' => 80.0, 'late' => 0],
            ['hash' => 'STU_SEC_B_017',   'mid' => 25, 'q_avg' => 19, 'att' => 93, 'q1' => 94, 'q2' => 92, 'q3' => 95, 'mid_pct' => 83.3, 'late' => 0],
            ['hash' => 'STU_SEC_B_018',   'mid' => 27, 'q_avg' => 19, 'att' => 94, 'q1' => 95, 'q2' => 96, 'q3' => 94, 'mid_pct' => 90.0, 'late' => 0],
            ['hash' => 'STU_SEC_B_019',   'mid' => 29, 'q_avg' => 19, 'att' => 95, 'q1' => 96, 'q2' => 98, 'q3' => 96, 'mid_pct' => 93.3, 'late' => 0],
            ['hash' => 'STU_SEC_B_020',   'mid' => 29, 'q_avg' => 20, 'att' => 96, 'q1' => 98, 'q2' => 98, 'q3' => 99, 'mid_pct' => 93.3, 'late' => 0],
        ];

        SectionGrade::truncate();
        Student::truncate();

        // Seed Section A
        foreach ($sectionAData as $item) {
            SectionGrade::create([
                'course_id' => $courseCSE2101->id,
                'section_name' => 'Section A',
                'faculty_id' => $monir->id,
                'student_hash' => $item['hash'],
                'mid_marks' => $item['mid'],
                'quiz_avg' => $item['q_avg'],
                'attendance_pct' => $item['att'],
            ]);

            Student::create([
                'student_hash' => $item['hash'],
                'course_id' => $courseCSE2101->id,
                'section_name' => 'Section A',
                'attendance_pct' => $item['att'],
                'quiz1' => $item['q1'],
                'quiz2' => $item['q2'],
                'quiz3' => $item['q3'],
                'midterm_pct' => $item['mid_pct'],
                'assignment_delay_count' => $item['late'],
                'risk_level' => null,
                'risk_score' => null,
            ]);
        }

        // Seed Section B
        foreach ($sectionBData as $item) {
            SectionGrade::create([
                'course_id' => $courseCSE2101->id,
                'section_name' => 'Section B',
                'faculty_id' => $facultyB->id,
                'student_hash' => $item['hash'],
                'mid_marks' => $item['mid'],
                'quiz_avg' => $item['q_avg'],
                'attendance_pct' => $item['att'],
            ]);

            Student::create([
                'student_hash' => $item['hash'],
                'course_id' => $courseCSE2101->id,
                'section_name' => 'Section B',
                'attendance_pct' => $item['att'],
                'quiz1' => $item['q1'],
                'quiz2' => $item['q2'],
                'quiz3' => $item['q3'],
                'midterm_pct' => $item['mid_pct'],
                'assignment_delay_count' => $item['late'],
                'risk_level' => null,
                'risk_score' => null,
            ]);
        }
    }
}
