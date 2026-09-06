import { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Grid,
  Loader2,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { API_URL, USE_MOCK, getToken, post } from '../../api/client.js';
import { ENDPOINTS, MARKS_CSV_COLUMNS } from '../../api/contract.js';
import { Badge, Button } from '../ui/index.js';

/**
 * Upload or manually enter one section's marks into a grading batch.
 */

const STAGE = {
  PICK: 'pick',
  PREVIEW: 'preview',
  UPLOADING: 'uploading',
  ERROR: 'error',
  SUCCESS: 'success',
};

/** Normalises a header the same way the backend does, for the mapping display. */
const normaliseHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[ -]/g, '_');

export default function UploadMarksModal({
  batch,
  open,
  onClose,
  onUploaded,
  initialMode = 'csv',
  /** Faculty are locked to one section; HoD may pick any. */
  lockedSection = null,
  availableSections = ['Section A', 'Section B'],
}) {
  const [mode, setMode] = useState(initialMode); // 'csv' | 'manual'
  const [stage, setStage] = useState(STAGE.PICK);
  const [file, setFile] = useState(null);
  const [sectionName, setSectionName] = useState(lockedSection ?? availableSections[0] ?? '');
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);

  // Manual entry rows state
  const defaultManualRows = useMemo(() => [
    { student_id: '2022831001', mid_marks: Math.round((batch?.max_marks ?? 30) * 0.85), quiz_avg: 88, attendance_pct: 95 },
    { student_id: '2022831002', mid_marks: Math.round((batch?.max_marks ?? 30) * 0.76), quiz_avg: 80, attendance_pct: 90 },
    { student_id: '2022831003', mid_marks: Math.round((batch?.max_marks ?? 30) * 0.92), quiz_avg: 94, attendance_pct: 98 },
    { student_id: '2022831004', mid_marks: Math.round((batch?.max_marks ?? 30) * 0.65), quiz_avg: 72, attendance_pct: 85 },
    { student_id: '2022831005', mid_marks: Math.round((batch?.max_marks ?? 30) * 0.45), quiz_avg: 55, attendance_pct: 70 },
  ], [batch?.max_marks]);

  const [manualRows, setManualRows] = useState(defaultManualRows);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const inputRef = useRef(null);

  const reset = useCallback(() => {
    setStage(STAGE.PICK);
    setFile(null);
    setPreview(null);
    setParseError(null);
    setServerError(null);
    setProgress(0);
    setResult(null);
    setDragging(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [reset, onClose]);

  // ---------------------------------------------------------------- parsing

  const parseFile = useCallback((picked) => {
    setParseError(null);
    setServerError(null);

    if (!picked) return;

    if (!picked.name.toLowerCase().endsWith('.csv')) {
      setParseError('That is not a .csv file. Export your marks as CSV and try again.');
      setStage(STAGE.PICK);
      return;
    }

    Papa.parse(picked, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: normaliseHeader,
      complete: (parsed) => {
        const headers = parsed.meta?.fields ?? [];
        const missing = MARKS_CSV_COLUMNS.filter((c) => !headers.includes(c));

        setPreview({
          headers,
          missing,
          rows: parsed.data.slice(0, 5),
          totalRows: parsed.data.length,
        });
        setFile(picked);
        setStage(STAGE.PREVIEW);
      },
      error: (err) => {
        setParseError(`Could not read that file: ${err.message}`);
        setStage(STAGE.PICK);
      },
    });
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      setDragging(false);
      parseFile(event.dataTransfer.files?.[0]);
    },
    [parseFile]
  );

  // -------------------------------------------------------------- CSV upload

  const submit = useCallback(() => {
    if (!file || !sectionName) return;

    setStage(STAGE.UPLOADING);
    setProgress(0);
    setServerError(null);

    const form = new FormData();
    form.append('file', file);
    form.append('section_name', sectionName);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${ENDPOINTS.uploadMarks(batch.id)}`);
    xhr.setRequestHeader('Accept', 'application/json');

    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        setResult(body?.data ?? null);
        setStage(STAGE.SUCCESS);
        onUploaded?.(body?.data ?? null);
        return;
      }

      setServerError(
        body ?? { message: `Upload failed (HTTP ${xhr.status}).`, row_errors: [], total_errors: 0 }
      );
      setStage(STAGE.ERROR);
    };

    xhr.onerror = () => {
      setServerError({
        message: 'The upload could not reach the server.',
        row_errors: [],
        total_errors: 0,
      });
      setStage(STAGE.ERROR);
    };

    xhr.send(form);
  }, [file, sectionName, batch, onUploaded]);

  const submitOrMock = useCallback(() => {
    if (!USE_MOCK) return submit();

    setStage(STAGE.UPLOADING);
    setProgress(100);
    window.setTimeout(() => {
      const mocked = {
        submission: {
          section_name: sectionName,
          student_count: preview?.totalRows ?? 0,
          file_name: file?.name ?? 'marks.csv',
          uploaded_at: new Date().toISOString(),
        },
        batch_status: 'ready',
        sections_submitted: (batch.sections_submitted ?? 0) + 1,
        total_sections: batch.total_sections ?? 2,
        replaced: Boolean(batch.my_submission),
      };
      setResult(mocked);
      setStage(STAGE.SUCCESS);
      onUploaded?.(mocked);
    }, 500);
  }, [submit, sectionName, preview, file, batch, onUploaded]);

  // ---------------------------------------------------------- manual submit

  const handleManualRowChange = (index, field, val) => {
    setManualRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleAddManualRow = () => {
    const nextId = 2022831000 + manualRows.length + 1;
    setManualRows((prev) => [
      ...prev,
      { student_id: String(nextId), mid_marks: Math.round(batch.max_marks * 0.7), quiz_avg: 75, attendance_pct: 85 },
    ]);
  };

  const handleRemoveManualRow = (index) => {
    if (manualRows.length <= 1) return;
    setManualRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLoadSampleRoster = () => {
    const sample = [
      { student_id: '2022831001', mid_marks: Math.round(batch.max_marks * 0.90), quiz_avg: 92, attendance_pct: 96 },
      { student_id: '2022831002', mid_marks: Math.round(batch.max_marks * 0.82), quiz_avg: 85, attendance_pct: 90 },
      { student_id: '2022831003', mid_marks: Math.round(batch.max_marks * 0.75), quiz_avg: 78, attendance_pct: 88 },
      { student_id: '2022831004', mid_marks: Math.round(batch.max_marks * 0.68), quiz_avg: 70, attendance_pct: 84 },
      { student_id: '2022831005', mid_marks: Math.round(batch.max_marks * 0.88), quiz_avg: 90, attendance_pct: 94 },
      { student_id: '2022831006', mid_marks: Math.round(batch.max_marks * 0.55), quiz_avg: 62, attendance_pct: 75 },
      { student_id: '2022831007', mid_marks: Math.round(batch.max_marks * 0.42), quiz_avg: 50, attendance_pct: 68 },
      { student_id: '2022831008', mid_marks: Math.round(batch.max_marks * 0.78), quiz_avg: 82, attendance_pct: 90 },
      { student_id: '2022831009', mid_marks: Math.round(batch.max_marks * 0.84), quiz_avg: 86, attendance_pct: 92 },
      { student_id: '2022831010', mid_marks: Math.round(batch.max_marks * 0.62), quiz_avg: 66, attendance_pct: 80 },
    ];
    setManualRows(sample);
  };

  const submitManual = async () => {
    if (!manualRows.length || !sectionName) return;

    // Validate marks
    for (let i = 0; i < manualRows.length; i++) {
      const r = manualRows[i];
      if (!r.student_id?.trim()) {
        setServerError({ message: `Row ${i + 1} has an empty student ID.`, row_errors: [] });
        return;
      }
      const m = Number(r.mid_marks);
      if (isNaN(m) || m < 0 || m > batch.max_marks) {
        setServerError({ message: `Row ${i + 1} marks (${r.mid_marks}) must be between 0 and ${batch.max_marks}.`, row_errors: [] });
        return;
      }
    }

    setManualSubmitting(true);
    setServerError(null);

    try {
      const payload = {
        section_name: sectionName,
        rows: manualRows.map((r) => ({
          student_id: String(r.student_id).trim(),
          mid_marks: Number(r.mid_marks),
          quiz_avg: Number(r.quiz_avg ?? 75),
          attendance_pct: Number(r.attendance_pct ?? 85),
        })),
      };

      let resData = null;
      if (USE_MOCK) {
        resData = {
          submission: {
            section_name: sectionName,
            student_count: manualRows.length,
            file_name: 'manual_entry_grid',
            uploaded_at: new Date().toISOString(),
          },
          batch_status: 'ready',
          sections_submitted: (batch.sections_submitted ?? 0) + 1,
          total_sections: batch.total_sections ?? 2,
          replaced: Boolean(batch.my_submission),
        };
      } else {
        const res = await post(ENDPOINTS.manualSubmitMarks(batch.id), payload);
        resData = res?.data ?? res;
      }

      setResult(resData);
      setStage(STAGE.SUCCESS);
      onUploaded?.(resData);
    } catch (err) {
      setServerError({
        message: err?.response?.data?.message ?? err?.message ?? 'Failed to submit marks.',
        row_errors: [],
      });
      setStage(STAGE.ERROR);
    } finally {
      setManualSubmitting(false);
    }
  };

  // ------------------------------------------------------ error report file

  const downloadErrorReport = useCallback(() => {
    if (!serverError?.row_errors?.length) return;

    const csv = Papa.unparse(
      serverError.row_errors.map((e) => ({
        row: e.row ?? '',
        column: e.column ?? '',
        value: e.value ?? '',
        reason: e.reason,
      }))
    );

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${batch.course_code ?? 'marks'}-${sectionName}-errors.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(url);
  }, [serverError, batch, sectionName]);

  const templateUrl = `${API_URL}${ENDPOINTS.gradingTemplate(batch?.id ?? 0)}`;

  const mappedColumns = useMemo(() => {
    if (!preview) return [];
    return MARKS_CSV_COLUMNS.map((col) => ({
      column: col,
      present: preview.headers.includes(col),
    }));
  }, [preview]);

  if (!open || !batch) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Submit marks for ${batch.assessment_name}`}
    >
      <div className="w-full max-w-3xl rounded-xl border border-border-default bg-surface shadow-2xl text-primary">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-default bg-subtle/40 px-5 py-4 rounded-t-xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-heading">
              Submit Marks — {batch.course_code} {batch.assessment_name}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Out of {batch.max_marks} marks · {batch.semester}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted transition hover:bg-subtle hover:text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        {stage !== STAGE.SUCCESS && (
          <div className="flex border-b border-border-default bg-subtle/20 px-5 pt-3">
            <button
              type="button"
              onClick={() => { setMode('csv'); reset(); }}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-bold transition ${
                mode === 'csv'
                  ? 'border-action-primary text-action-primary'
                  : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Upload CSV File
            </button>
            <button
              type="button"
              onClick={() => { setMode('manual'); reset(); }}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-bold transition ${
                mode === 'manual'
                  ? 'border-action-primary text-action-primary'
                  : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              <Grid className="h-4 w-4" />
              Enter Marks Manually (Fast Grid)
            </button>
          </div>
        )}

        <div className="space-y-4 px-5 py-4">
          {/* Section selector */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="section-select" className="text-xs font-semibold text-heading">
                Target Section:
              </label>
              {lockedSection ? (
                <div className="flex items-center gap-2">
                  <Badge variant="info">{lockedSection}</Badge>
                  <span className="text-[11px] text-muted">
                    (Assigned to your faculty profile)
                  </span>
                </div>
              ) : (
                <select
                  id="section-select"
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  disabled={stage === STAGE.UPLOADING || manualSubmitting}
                  className="h-8 rounded-lg border border-border-default bg-surface px-3 text-xs font-medium text-primary focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus shadow-2xs"
                >
                  {availableSections.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {mode === 'csv' && (
              <a
                href={templateUrl}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-action-primary transition hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV template
              </a>
            )}
          </div>

          {/* ======================= CSV MODE ======================= */}
          {mode === 'csv' && (
            <>
              {/* Pick / Drag & drop */}
              {(stage === STAGE.PICK || stage === STAGE.PREVIEW) && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
                    dragging ? 'border-action-primary bg-emerald-50/50' : 'border-border-default bg-subtle/30'
                  }`}
                >
                  <FileSpreadsheet className="mx-auto h-8 w-8 text-action-primary opacity-80" />
                  <p className="mt-2 text-sm font-medium text-heading">
                    {file ? file.name : 'Drop your section marks CSV here, or'}{' '}
                    {!file && (
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="font-bold text-action-primary underline-offset-2 hover:underline"
                      >
                        browse file
                      </button>
                    )}
                  </p>
                  {file ? (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="mt-1 text-xs font-semibold text-action-primary underline-offset-2 hover:underline"
                    >
                      Choose a different file
                    </button>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">
                      Required columns: <span className="font-mono">{MARKS_CSV_COLUMNS.join(', ')}</span>
                    </p>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => parseFile(e.target.files?.[0])}
                  />
                </div>
              )}

              {parseError ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 shadow-2xs">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span className="font-semibold">{parseError}</span>
                </div>
              ) : null}

              {/* Preview */}
              {stage === STAGE.PREVIEW && preview ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-heading">
                      {preview.totalRows} student row{preview.totalRows === 1 ? '' : 's'} parsed
                    </span>
                    {mappedColumns.map(({ column, present }) => (
                      <span
                        key={column}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          present
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                            : 'border-rose-300 bg-rose-50 text-rose-900'
                        }`}
                      >
                        {column} {present ? '✓' : 'missing'}
                      </span>
                    ))}
                  </div>

                  {preview.missing.length > 0 ? (
                    <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 shadow-2xs">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <span>
                        Missing required columns: <strong>{preview.missing.join(', ')}</strong>. The server will reject this upload.
                      </span>
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-lg border border-border-default">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-subtle/70 text-heading">
                        <tr>
                          {preview.headers.map((h) => (
                            <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-default text-primary">
                        {preview.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-subtle/30">
                            {preview.headers.map((h) => (
                              <td key={h} className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                                {String(row[h] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted">
                    Showing first {preview.rows.length} of {preview.totalRows} rows.
                  </p>
                </div>
              ) : null}
            </>
          )}

          {/* ======================= MANUAL GRID MODE ======================= */}
          {mode === 'manual' && stage !== STAGE.SUCCESS && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted">
                  Total Students: <strong className="text-heading font-bold">{manualRows.length}</strong> ·{' '}
                  Average Mark:{' '}
                  <strong className="text-action-primary font-bold">
                    {manualRows.length
                      ? (manualRows.reduce((a, b) => a + Number(b.mid_marks || 0), 0) / manualRows.length).toFixed(1)
                      : 0}{' '}
                    / {batch.max_marks}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={Sparkles}
                    onClick={handleLoadSampleRoster}
                    title="Populate 10 sample students with valid marks"
                  >
                    Load Sample Roster
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Plus}
                    onClick={handleAddManualRow}
                  >
                    Add Student
                  </Button>
                </div>
              </div>

              {/* Editable Table */}
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border-default">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-subtle/90 text-heading border-b border-border-default">
                    <tr>
                      <th className="px-3 py-2 font-bold">#</th>
                      <th className="px-3 py-2 font-bold">Student ID</th>
                      <th className="px-3 py-2 font-bold">Marks (max: {batch.max_marks})</th>
                      <th className="px-3 py-2 font-bold">Quiz Avg %</th>
                      <th className="px-3 py-2 font-bold">Attendance %</th>
                      <th className="px-3 py-2 text-right sr-only">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default text-primary">
                    {manualRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-subtle/20">
                        <td className="px-3 py-1.5 text-muted tabular-nums">{idx + 1}</td>
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={row.student_id}
                            onChange={(e) => handleManualRowChange(idx, 'student_id', e.target.value)}
                            placeholder="e.g. 2022831001"
                            className="h-7 w-32 rounded border border-border-default bg-surface px-2 text-xs font-medium text-primary focus:border-border-focus focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max={batch.max_marks}
                            value={row.mid_marks}
                            onChange={(e) => handleManualRowChange(idx, 'mid_marks', e.target.value)}
                            className="h-7 w-24 rounded border border-border-default bg-surface px-2 text-xs font-bold text-heading tabular-nums focus:border-border-focus focus:outline-none"
                          />
                          {Number(row.mid_marks) > batch.max_marks && (
                            <span className="ml-2 text-[10px] font-bold text-rose-600">
                              Exceeds {batch.max_marks}!
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={row.quiz_avg}
                            onChange={(e) => handleManualRowChange(idx, 'quiz_avg', e.target.value)}
                            className="h-7 w-20 rounded border border-border-default bg-surface px-2 text-xs tabular-nums focus:border-border-focus focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={row.attendance_pct}
                            onChange={(e) => handleManualRowChange(idx, 'attendance_pct', e.target.value)}
                            className="h-7 w-20 rounded border border-border-default bg-surface px-2 text-xs tabular-nums focus:border-border-focus focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveManualRow(idx)}
                            className="text-muted hover:text-rose-600 transition p-1"
                            title="Remove student"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload progress */}
          {stage === STAGE.UPLOADING && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-heading">
                <Loader2 className="h-4 w-4 animate-spin text-action-primary" />
                Uploading marks file…
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-action-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Server rejection / Error Alert */}
          {(stage === STAGE.ERROR || serverError) && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 shadow-2xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div>
                  <p className="font-bold">{serverError?.message ?? 'Submission error occurred.'}</p>
                  {serverError?.total_errors > (serverError?.row_errors?.length ?? 0) ? (
                    <p className="mt-1">
                      Showing {serverError.row_errors.length} of {serverError.total_errors} problems.
                    </p>
                  ) : null}
                </div>
              </div>

              {serverError?.row_errors?.length ? (
                <>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-rose-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-rose-100 text-rose-950">
                        <tr>
                          <th className="px-3 py-2 font-bold">Row</th>
                          <th className="px-3 py-2 font-bold">Column</th>
                          <th className="px-3 py-2 font-bold">Value</th>
                          <th className="px-3 py-2 font-bold">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100 text-rose-900">
                        {serverError.row_errors.map((e, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 tabular-nums font-bold">{e.row ?? '—'}</td>
                            <td className="px-3 py-1.5 font-mono">{e.column ?? '—'}</td>
                            <td className="px-3 py-1.5 font-mono">{String(e.value ?? '')}</td>
                            <td className="px-3 py-1.5">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Button variant="ghost" size="sm" icon={Download} onClick={downloadErrorReport}>
                    Download error report
                  </Button>
                </>
              ) : null}
            </div>
          )}

          {/* Success Alert */}
          {stage === STAGE.SUCCESS && result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 shadow-2xs">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-bold">
                    Successfully imported {result.submission?.student_count} students for {result.submission?.section_name}!
                  </p>
                  <p className="mt-0.5 text-emerald-800">
                    {result.sections_submitted} of {result.total_sections} sections submitted · batch status is{' '}
                    <strong>{result.batch_status}</strong>.
                  </p>
                </div>
              </div>

              {result.replaced ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-2xs">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>This submission replaced your previous marks for this section.</span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border-default bg-subtle/30 px-5 py-3 rounded-b-xl">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            {stage === STAGE.SUCCESS ? 'Done' : 'Cancel'}
          </Button>

          {mode === 'csv' && stage === STAGE.PREVIEW && (
            <Button
              size="sm"
              icon={Upload}
              onClick={submitOrMock}
              disabled={!file || !sectionName || preview?.missing.length > 0}
            >
              Confirm and upload
            </Button>
          )}

          {mode === 'manual' && stage !== STAGE.SUCCESS && (
            <Button
              size="sm"
              icon={Upload}
              onClick={submitManual}
              loading={manualSubmitting}
              disabled={!manualRows.length || !sectionName}
            >
              Confirm and Submit Marks
            </Button>
          )}

          {stage === STAGE.ERROR && mode === 'csv' && (
            <Button size="sm" icon={RotateCw} onClick={() => setStage(STAGE.PREVIEW)}>
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
