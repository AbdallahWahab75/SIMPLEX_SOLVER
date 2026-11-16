import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import type { Locale } from '../../i18n/translations.ts';
import { TRANSLATIONS } from '../../i18n/translations.ts';
import { previewImportApi } from '../../services/api.ts';
import type {
  ImportMapping,
  ImportPreviewResult,
  ObjectiveSense,
  ProblemModel,
} from '../../types/solver.ts';

interface ImportModalProps {
  locale: Locale;
  isOpen: boolean;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onImportModel: (model: ProblemModel) => void;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () =>
      reject(new Error('Impossible de lire le fichier sélectionné.'));
    reader.readAsDataURL(file);
  });
}

export function ImportModal({
  locale,
  isOpen,
  getToken,
  onClose,
  onImportModel,
}: ImportModalProps) {
  const t = TRANSLATIONS[locale];
  const [fileName, setFileName] = useState<string>('');
  const [contentBase64, setContentBase64] = useState<string>('');
  const [sheetName, setSheetName] = useState<string>('');
  const [range, setRange] = useState<string>('');
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const runPreview = async (opts: {
    nextFileName?: string;
    nextBase64?: string;
    nextSheet?: string;
    nextRange?: string;
    nextMapping?: ImportMapping | null;
  }) => {
    const token = await getToken();
    if (!token) return;
    const fName = opts.nextFileName ?? fileName;
    const b64 = opts.nextBase64 ?? contentBase64;
    if (!fName || !b64) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await previewImportApi(token, {
        fileName: fName,
        contentBase64: b64,
        sheetName: (opts.nextSheet ?? sheetName) || undefined,
        range: (opts.nextRange ?? range) || undefined,
        mapping: opts.nextMapping ?? undefined,
      });
      setPreview(res);
      setSheetName(res.selectedSheet);
      if (!opts.nextMapping) {
        setMapping(res.suggestedMapping);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erreur lors de l’analyse.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const b64 = await readFileAsBase64(file);
      setFileName(file.name);
      setContentBase64(b64);
      setSheetName('');
      setRange('');
      setMapping(null);
      await runPreview({
        nextFileName: file.name,
        nextBase64: b64,
        nextSheet: '',
        nextRange: '',
        nextMapping: null,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lecture fichier');
    }
  };

  const toggleVariableColumn = (colIndex: number) => {
    if (!mapping || !preview) return;
    const exists = mapping.variableCols.some((v) => v.colIndex === colIndex);
    const headerLabel =
      mapping.hasHeaderRow && preview.previewRows[0]?.[colIndex]
        ? preview.previewRows[0][colIndex].trim()
        : `x${mapping.variableCols.length + 1}`;

    const nextVarCols = exists
      ? mapping.variableCols.filter((v) => v.colIndex !== colIndex)
      : [...mapping.variableCols, { colIndex, varName: headerLabel }].sort(
          (a, b) => a.colIndex - b.colIndex
        );
    setMapping({ ...mapping, variableCols: nextVarCols });
  };

  const renameVariableColumn = (colIndex: number, varName: string) => {
    if (!mapping) return;
    setMapping({
      ...mapping,
      variableCols: mapping.variableCols.map((v) =>
        v.colIndex === colIndex ? { ...v, varName } : v
      ),
    });
  };

  const colIndices = preview
    ? Array.from({ length: preview.totalCols }, (_, i) => i)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[var(--petrol-700)]" />
            <h2 className="text-lg font-bold text-[var(--ink-primary)]">
              {t.importTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)] cursor-pointer"
            aria-label={t.cancel}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Step 1: File & Sheet/Range selection */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-5">
              <label className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5">
                {t.importSelectFile}
              </label>
              <label className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-muted)] cursor-pointer">
                <Upload className="w-4 h-4 text-[var(--petrol-700)] shrink-0" />
                <span className="truncate text-[var(--ink-primary)]">
                  {fileName || 'model.csv / model.xlsx'}
                </span>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => void handleFileChange(e)}
                  className="sr-only"
                />
              </label>
            </div>

            {preview && preview.fileType === 'xlsx' && (
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5">
                  {t.importSheetLabel}
                </label>
                <select
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                >
                  {preview.sheetNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5">
                {t.importRangeLabel}
              </label>
              <input
                type="text"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                placeholder="A1:F10"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="button"
                disabled={!fileName || loading}
                onClick={() =>
                  void runPreview({
                    nextSheet: sheetName,
                    nextRange: range,
                    nextMapping: mapping,
                  })
                }
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t.importRefreshPreview}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200">
              {errorMsg}
            </div>
          )}

          {/* Step 2: Explicit Column Mapping */}
          {preview && mapping && (
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] space-y-4">
                <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                  {t.importMappingTitle}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-medium text-[var(--ink-secondary)] mb-1">
                      {t.problemName}
                    </label>
                    <input
                      type="text"
                      value={mapping.problemName}
                      onChange={(e) =>
                        setMapping({ ...mapping, problemName: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-[var(--ink-secondary)] mb-1">
                      {t.senseLabel}
                    </label>
                    <select
                      value={mapping.sense}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          sense: e.target.value as ObjectiveSense,
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                    >
                      <option value="maximize">{t.maximize}</option>
                      <option value="minimize">{t.minimize}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[var(--ink-secondary)] mb-1">
                      {t.importObjRowLabel}
                    </label>
                    <select
                      value={mapping.objectiveRowIndex}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          objectiveRowIndex: Number.parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                    >
                      <option value={-1}>—</option>
                      {preview.previewRows.map((row, idx) => {
                        if (mapping.hasHeaderRow && idx === 0) return null;
                        return (
                          <option key={idx} value={idx}>
                            L{idx + 1}: {row.slice(0, 3).join(' | ')}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mapping.hasHeaderRow}
                        onChange={(e) =>
                          setMapping({
                            ...mapping,
                            hasHeaderRow: e.target.checked,
                          })
                        }
                      />
                      <span>{t.importHasHeader}</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-medium text-[var(--ink-secondary)] mb-1">
                      {t.importLabelCol}
                    </label>
                    <select
                      value={mapping.labelCol}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          labelCol: Number.parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                    >
                      <option value={-1}>—</option>
                      {colIndices.map((c) => (
                        <option key={c} value={c}>
                          Col {c + 1}
                          {preview.previewRows[0]?.[c]
                            ? ` (${preview.previewRows[0][c]})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[var(--ink-secondary)] mb-1">
                      {t.importOpCol}
                    </label>
                    <select
                      value={mapping.operatorCol}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          operatorCol: Number.parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                    >
                      <option value={-1}>—</option>
                      {colIndices.map((c) => (
                        <option key={c} value={c}>
                          Col {c + 1}
                          {preview.previewRows[0]?.[c]
                            ? ` (${preview.previewRows[0][c]})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[var(--ink-secondary)] mb-1">
                      {t.importRhsCol}
                    </label>
                    <select
                      value={mapping.rhsCol}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          rhsCol: Number.parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                    >
                      <option value={-1}>—</option>
                      {colIndices.map((c) => (
                        <option key={c} value={c}>
                          Col {c + 1}
                          {preview.previewRows[0]?.[c]
                            ? ` (${preview.previewRows[0][c]})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Variable Columns Selection */}
                <div className="space-y-2 text-xs">
                  <p className="font-medium text-[var(--ink-secondary)]">
                    {t.importVarColsTitle}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {colIndices.map((c) => {
                      const mapped = mapping.variableCols.find(
                        (v) => v.colIndex === c
                      );
                      const isSpecial =
                        c === mapping.labelCol ||
                        c === mapping.operatorCol ||
                        c === mapping.rhsCol;
                      return (
                        <div
                          key={c}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border ${
                            mapped
                              ? 'border-[var(--petrol-700)] bg-[var(--petrol-50)]'
                              : 'border-[var(--border-hairline)] bg-[var(--surface-panel)] opacity-70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isSpecial}
                            checked={Boolean(mapped)}
                            onChange={() => toggleVariableColumn(c)}
                          />
                          <span className="font-mono text-[var(--ink-secondary)]">
                            C{c + 1}:
                          </span>
                          {mapped ? (
                            <input
                              type="text"
                              value={mapped.varName}
                              onChange={(e) =>
                                renameVariableColumn(c, e.target.value)
                              }
                              className="w-16 px-1.5 py-0.5 font-mono rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                            />
                          ) : (
                            <span className="text-[var(--ink-secondary)]">
                              {preview.previewRows[0]?.[c] || '—'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Extracted Data Preview Table */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                  {t.importPreviewTableTitle} ({preview.totalRows} ×{' '}
                  {preview.totalCols})
                </h3>
                <div className="overflow-x-auto max-h-56 border border-[var(--border-hairline)] rounded-lg">
                  <table className="w-full text-xs font-mono tabular-nums border-collapse">
                    <thead className="bg-[var(--surface-muted)] text-[var(--ink-secondary)] sticky top-0">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left border-b border-r border-[var(--border-hairline)]">
                          #
                        </th>
                        {colIndices.map((c) => (
                          <th
                            key={c}
                            className="px-2.5 py-1.5 text-left border-b border-[var(--border-hairline)]"
                          >
                            C{c + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-hairline)]">
                      {preview.previewRows.slice(0, 20).map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={
                            rIdx === mapping.objectiveRowIndex
                              ? 'bg-[var(--petrol-50)] font-semibold'
                              : 'bg-[var(--surface-panel)]'
                          }
                        >
                          <td className="px-2.5 py-1.5 border-r border-[var(--border-hairline)] text-[var(--ink-secondary)]">
                            L{rIdx + 1}
                          </td>
                          {colIndices.map((c) => (
                            <td key={c} className="px-2.5 py-1.5 whitespace-nowrap">
                              {row[c] || (
                                <span className="text-[var(--ink-secondary)] opacity-40">
                                  ∅
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Validation Feedback */}
              {preview.issues.length > 0 ? (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
                    <span>{t.importIssuesTitle}</span>
                  </div>
                  <ul className="list-disc pl-6 text-xs space-y-1">
                    {preview.issues.map((issue, idx) => (
                      <li key={idx}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                preview.valid && (
                  <div className="p-3 rounded-lg bg-[var(--petrol-50)] border border-[var(--border-hairline)] text-[var(--petrol-800)] flex items-center gap-2 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4 text-[var(--petrol-700)] shrink-0" />
                    <span>{t.importValidReady}</span>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-hairline)] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] cursor-pointer"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={!preview?.valid || !preview?.candidateModel}
            onClick={() => {
              if (preview?.candidateModel) {
                onImportModel(preview.candidateModel);
                onClose();
              }
            }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] disabled:opacity-40 cursor-pointer"
          >
            {t.importConfirmBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
