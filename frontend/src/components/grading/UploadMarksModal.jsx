import { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCw,
  Upload,
  X,
} from 'lucide-react';
import { API_URL, USE_MOCK, getToken } from '../../api/client.js';
import { ENDPOINTS, MARKS_CSV_COLUMNS } from '../../api/contract.js';
import { Badge, Button } from '../ui/index.js';

/**
 * Upload one section's marks into a grading batch.
 *
 * The flow is deliberately three-staged — pick, preview, submit — because the
 * expensive failure here is a teacher uploading the wrong file and only finding
 * out after the server has rejected it. Parsing in the browser first turns that
 * into a two-second local check.
 *
 * The file selection survives a server rejection on purpose: the common repair
 * is to fix one cell and retry, and forcing a re-pick after every failure is
 * how a demo stalls.
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
  /** Faculty are locked to one section; HoD may pick any. */
  lockedSection = null,
  availableSections = ['Section A', 'Section B'],
}) {
  const [stage, setStage] = useState(STAGE.PICK);
  const [file, setFile] = useState(null);
  const [sectionName, setSectionName] = useState(lockedSection ?? availableSections[0] ?? '');
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);

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

  // -------------------------------------------------------------- uploading

  const submit = useCallback(() => {
    if (!file || !sectionName) return;

    setStage(STAGE.UPLOADING);
    setProgress(0);
    setServerError(null);

    // XHR rather than fetch: this is the one request in the app that needs
    // real upload progress, and fetch cannot report it.
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

  // In mock mode there is no server to POST a file to, so short-circuit to a
  // success state rather than letting the request fail confusingly.
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
    }, 600);
  }, [submit, sectionName, preview, file, batch, onUploaded]);

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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Upload marks for ${batch.assessment_name}`}
    >
      <div className="w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header ------------------------------------------------------- */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">
              Upload marks — {batch.course_code} {batch.assessment_name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Out of {batch.max_marks} marks · {batch.semester}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Section selector ------------------------------------------- */}
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="section-select" className="text-xs font-medium text-slate-400">
              Section:
            </label>
            {lockedSection ? (
              <div className="flex items-center gap-2">
                <Badge>{lockedSection}</Badge>
                <span className="text-[11px] text-slate-500">
                  You can only upload for your own section.
                </span>
              </div>
            ) : (
              <select
                id="section-select"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                disabled={stage === STAGE.UPLOADING}
                className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                {availableSections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            <a
              href={templateUrl}
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-sky-300 transition hover:text-sky-200"
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV template
            </a>
          </div>

          {/* Stage: pick ------------------------------------------------ */}
          {(stage === STAGE.PICK || stage === STAGE.PREVIEW) && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`rounded-lg border-2 border-dashed p-6 text-center transition ${
                dragging ? 'border-amber-400 bg-amber-400/5' : 'border-slate-700 bg-slate-950/40'
              }`}
            >
              <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-500" />
              <p className="mt-2 text-sm text-slate-300">
                {file ? file.name : 'Drop a CSV here, or'}{' '}
                {!file && (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="font-medium text-amber-300 underline-offset-2 hover:underline"
                  >
                    browse for a file
                  </button>
                )}
              </p>
              {file ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-1 text-xs font-medium text-amber-300 underline-offset-2 hover:underline"
                >
                  Choose a different file
                </button>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">
                  Required columns: {MARKS_CSV_COLUMNS.join(', ')}
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
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {parseError}
            </p>
          ) : null}

          {/* Stage: preview --------------------------------------------- */}
          {stage === STAGE.PREVIEW && preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-300">
                  {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'} detected
                </span>
                {mappedColumns.map(({ column, present }) => (
                  <span
                    key={column}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      present
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    {column} {present ? '✓' : 'missing'}
                  </span>
                ))}
              </div>

              {preview.missing.length > 0 ? (
                <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    This file is missing {preview.missing.join(', ')}. The server will reject it —
                    fix the header row before uploading.
                  </span>
                </p>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400">
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {preview.rows.map((row, i) => (
                      <tr key={i}>
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
              <p className="text-[11px] text-slate-500">
                Showing the first {preview.rows.length} of {preview.totalRows} rows.
              </p>
            </div>
          ) : null}

          {/* Stage: uploading ------------------------------------------- */}
          {stage === STAGE.UPLOADING ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                Uploading {file?.name}…
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {/* Stage: server rejection ------------------------------------ */}
          {stage === STAGE.ERROR && serverError ? (
            <div className="space-y-3">
              <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {serverError.message}
                  {serverError.total_errors > (serverError.row_errors?.length ?? 0) ? (
                    <>
                      {' '}
                      Showing {serverError.row_errors.length} of {serverError.total_errors} problems.
                    </>
                  ) : null}
                </span>
              </p>

              {serverError.row_errors?.length ? (
                <>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-rose-500/20">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-950 text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium">Column</th>
                          <th className="px-3 py-2 font-medium">Value</th>
                          <th className="px-3 py-2 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-500/10 text-slate-300">
                        {serverError.row_errors.map((e, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 tabular-nums text-slate-400">{e.row ?? '—'}</td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-rose-300">
                              {e.column ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">
                              {String(e.value ?? '')}
                            </td>
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

              <p className="text-[11px] text-slate-500">
                Your file is still selected — fix it and press Retry, no need to pick it again.
              </p>
            </div>
          ) : null}

          {/* Stage: success --------------------------------------------- */}
          {stage === STAGE.SUCCESS && result ? (
            <div className="space-y-2">
              <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {result.submission?.student_count} students imported for{' '}
                  {result.submission?.section_name}.
                </span>
              </p>

              {result.replaced ? (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>This replaced your previous upload for this section.</span>
                </p>
              ) : null}

              <p className="text-xs text-slate-400">
                {result.sections_submitted} of {result.total_sections} sections submitted · batch is{' '}
                <span className="font-medium text-slate-200">{result.batch_status}</span>.
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer -------------------------------------------------------- */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            {stage === STAGE.SUCCESS ? 'Done' : 'Cancel'}
          </Button>

          {stage === STAGE.PREVIEW ? (
            <Button
              size="sm"
              icon={Upload}
              onClick={submitOrMock}
              disabled={!file || !sectionName || preview?.missing.length > 0}
            >
              Confirm and upload
            </Button>
          ) : null}

          {stage === STAGE.ERROR ? (
            <Button size="sm" icon={RotateCw} onClick={() => setStage(STAGE.PREVIEW)}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
