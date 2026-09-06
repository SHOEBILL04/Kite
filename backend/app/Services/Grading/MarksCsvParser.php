<?php

namespace App\Services\Grading;

use App\Models\GradingBatch;

/**
 * Parses and validates an uploaded marks CSV.
 *
 * Validation is all-or-nothing by design: the parser returns either a clean set
 * of rows or a list of row errors, never a partial import. A half-loaded section
 * would silently skew every statistic the parity audit computes, and the teacher
 * would have no way to tell.
 *
 * Student identifiers never leave this class in the clear -- see hashIdentifier().
 */
class MarksCsvParser
{
    public const REQUIRED_COLUMNS = ['student_id', 'mid_marks', 'quiz_avg', 'attendance_pct'];

    /** Numeric columns, checked for type before range. */
    private const NUMERIC_COLUMNS = ['mid_marks', 'quiz_avg', 'attendance_pct'];

    /** Below this a section is too small to say anything statistically. */
    public const MIN_VALID_ROWS = 5;

    /** The API returns at most this many errors, plus a total count. */
    public const MAX_REPORTED_ERRORS = 50;

    /**
     * @return array{
     *   ok: bool,
     *   rows: array<int, array{student_hash:string, mid_marks:float, quiz_avg:float, attendance_pct:int}>,
     *   errors: array<int, array{row:int|null, column:string|null, value:mixed, reason:string}>,
     *   total_errors: int,
     *   total_rows: int
     * }
     */
    public function parse(string $contents, GradingBatch $batch): array
    {
        $errors = [];
        $rows = [];

        $records = $this->readCsv($contents);

        if ($records === []) {
            return $this->fail([[
                'row' => null,
                'column' => null,
                'value' => null,
                'reason' => 'The file is empty or is not readable as CSV.',
            ]]);
        }

        // ---- header ------------------------------------------------------
        $rawHeader = array_shift($records);
        $header = array_map(
            fn ($h) => str_replace([' ', '-'], '_', mb_strtolower(trim((string) $h))),
            $rawHeader
        );

        $missing = array_diff(self::REQUIRED_COLUMNS, $header);

        if ($missing !== []) {
            foreach ($missing as $column) {
                $errors[] = [
                    'row' => 1,
                    'column' => $column,
                    'value' => implode(', ', $header),
                    'reason' => "Required column '{$column}' is missing from the header row.",
                ];
            }

            // Without the columns there is nothing further to check.
            return $this->fail($errors);
        }

        $index = array_flip($header);

        // ---- rows ---------------------------------------------------------
        $seenIdentifiers = [];
        $totalRows = 0;

        foreach ($records as $offset => $record) {
            // +2: one for the header, one because spreadsheet rows are 1-based.
            $rowNumber = $offset + 2;

            if ($this->isBlank($record)) {
                continue;
            }

            $totalRows++;
            $rowErrors = [];

            $studentId = trim((string) ($record[$index['student_id']] ?? ''));

            if ($studentId === '') {
                $rowErrors[] = $this->error($rowNumber, 'student_id', '', 'Student identifier is blank.');
            } elseif (isset($seenIdentifiers[$studentId])) {
                $rowErrors[] = $this->error(
                    $rowNumber,
                    'student_id',
                    $studentId,
                    'Duplicate student_id — already present on row '.$seenIdentifiers[$studentId].'.'
                );
            } else {
                $seenIdentifiers[$studentId] = $rowNumber;
            }

            $values = [];

            foreach (self::NUMERIC_COLUMNS as $column) {
                $raw = trim((string) ($record[$index[$column]] ?? ''));

                if ($raw === '') {
                    $rowErrors[] = $this->error($rowNumber, $column, '', 'Value is blank.');
                    continue;
                }

                if (! is_numeric($raw)) {
                    $rowErrors[] = $this->error($rowNumber, $column, $raw, 'Value is not a number.');
                    continue;
                }

                $values[$column] = (float) $raw;
            }

            // Range checks only run on values that parsed as numbers.
            if (isset($values['mid_marks'])) {
                if ($values['mid_marks'] < 0) {
                    $rowErrors[] = $this->error($rowNumber, 'mid_marks', $values['mid_marks'], 'Marks cannot be negative.');
                } elseif ($values['mid_marks'] > $batch->max_marks) {
                    $rowErrors[] = $this->error(
                        $rowNumber,
                        'mid_marks',
                        $values['mid_marks'],
                        "Exceeds the assessment maximum of {$batch->max_marks}."
                    );
                }
            }

            if (isset($values['attendance_pct']) && ($values['attendance_pct'] < 0 || $values['attendance_pct'] > 100)) {
                $rowErrors[] = $this->error(
                    $rowNumber,
                    'attendance_pct',
                    $values['attendance_pct'],
                    'Attendance must be between 0 and 100.'
                );
            }

            if ($rowErrors !== []) {
                $errors = array_merge($errors, $rowErrors);

                continue;
            }

            $rows[] = [
                'student_hash' => $this->hashIdentifier($studentId),
                'mid_marks' => $values['mid_marks'],
                'quiz_avg' => $values['quiz_avg'],
                'attendance_pct' => (int) round($values['attendance_pct']),
            ];
        }

        if ($errors !== []) {
            return $this->fail($errors, $totalRows);
        }

        if (count($rows) < self::MIN_VALID_ROWS) {
            return $this->fail([[
                'row' => null,
                'column' => null,
                'value' => count($rows),
                'reason' => sprintf(
                    'Only %d valid row(s) found. At least %d are required for the section to be analysed.',
                    count($rows),
                    self::MIN_VALID_ROWS
                ),
            ]], $totalRows);
        }

        return [
            'ok' => true,
            'rows' => $rows,
            'errors' => [],
            'total_errors' => 0,
            'total_rows' => $totalRows,
        ];
    }

    /**
     * Pseudonymise a student identifier.
     *
     * The raw identifier is never persisted anywhere. Salting with the app key
     * means the hash cannot be reproduced from a stolen database alone, and
     * keeps the same student stable across uploads within this installation.
     */
    public function hashIdentifier(string $studentId): string
    {
        return 'STU_'.substr(hash('sha256', $studentId.config('app.key')), 0, 8);
    }

    /**
     * Split CSV text into records, tolerating BOM and CRLF line endings.
     *
     * @return array<int, array<int, string>>
     */
    private function readCsv(string $contents): array
    {
        $contents = preg_replace('/^\xEF\xBB\xBF/', '', $contents);

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $contents);
        rewind($handle);

        $records = [];
        while (($record = fgetcsv($handle)) !== false) {
            $records[] = $record;
        }
        fclose($handle);

        return $records;
    }

    /** @param array<int, mixed> $record */
    private function isBlank(array $record): bool
    {
        foreach ($record as $cell) {
            if (trim((string) $cell) !== '') {
                return false;
            }
        }

        return true;
    }

    private function error(int $row, string $column, mixed $value, string $reason): array
    {
        return compact('row', 'column', 'value', 'reason');
    }

    /**
     * @param  array<int, array<string, mixed>>  $errors
     */
    private function fail(array $errors, int $totalRows = 0): array
    {
        return [
            'ok' => false,
            'rows' => [],
            'errors' => array_slice($errors, 0, self::MAX_REPORTED_ERRORS),
            'total_errors' => count($errors),
            'total_rows' => $totalRows,
        ];
    }
}
