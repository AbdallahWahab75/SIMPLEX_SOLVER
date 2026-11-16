import { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Download,
  Info,
  Table2,
  XCircle,
} from 'lucide-react';
import type { Locale } from '../../i18n/translations.ts';
import { TRANSLATIONS } from '../../i18n/translations.ts';
import type {
  NumberDisplayMode,
  ResolutionRecord,
} from '../../types/solver.ts';
import { formatNumericCell } from '../../utils/formatNumber.ts';

interface ResultsPanelProps {
  locale: Locale;
  resolution: ResolutionRecord | null;
  numberFormat: NumberDisplayMode;
  decimalPrecision?: number;
  onChangeNumberFormat: (mode: NumberDisplayMode) => void;
  onOpenTableaux: () => void;
  onExport?: (
    format: 'pdf' | 'xlsx' | 'csv',
    includeTableaux?: boolean
  ) => void;
}

type ResultTab = 'summary' | 'variables' | 'constraints' | 'economic';

export function ResultsPanel({
  locale,
  resolution,
  numberFormat,
  decimalPrecision = 4,
  onChangeNumberFormat,
  onOpenTableaux,
  onExport,
}: ResultsPanelProps) {
  const t = TRANSLATIONS[locale];
  const [activeTab, setActiveTab] = useState<ResultTab>('summary');

  if (!resolution) {
    return (
      <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-8 text-center space-y-2">
        <h2 className="text-base font-semibold text-[var(--ink-primary)]">
          {t.resultsTitle}
        </h2>
        <p className="text-sm text-[var(--ink-secondary)] max-w-xl mx-auto">
          {t.noResultYet}
        </p>
      </section>
    );
  }

  const outcome = resolution.outcomeStatus ?? resolution.status;
  const isOptimal =
    outcome === 'optimal_unique' || outcome === 'optimal_multiple';
  const isErrorState =
    resolution.status === 'numerical_instability' ||
    resolution.status === 'failed' ||
    resolution.status === 'timed_out' ||
    resolution.status === 'cancelled';

  const statusLabel =
    (t.statuses as Record<string, string>)[outcome] ??
    resolution.userErrorMessage ??
    outcome;

  const opSymbol = (op: string) => {
    if (op === '<=') return '≤';
    if (op === '>=') return '≥';
    return '=';
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-[var(--ink-primary)]">
              {t.resultsTitle}
            </h1>
            <p className="text-xs text-[var(--ink-secondary)] font-mono">
              #{resolution.id} · v{resolution.modelVersionId} ·{' '}
              {resolution.engineVersion}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-[var(--surface-muted)] rounded-lg">
              {(['fraction', 'decimal', 'both'] as NumberDisplayMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onChangeNumberFormat(mode)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      numberFormat === mode
                        ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    {mode === 'fraction'
                      ? t.formatFraction
                      : mode === 'decimal'
                        ? t.formatDecimal
                        : t.formatBoth}
                  </button>
                )
              )}
            </div>

            {onExport && (
              <>
                <button
                  type="button"
                  onClick={() => onExport('pdf', false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.exportPdfBtn}
                </button>
                {resolution.iterationCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onExport('pdf', true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t.exportPdfTableauxBtn}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onExport('xlsx', false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.exportXlsxBtn}
                </button>
                <button
                  type="button"
                  onClick={() => onExport('csv', false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.exportCsvBtn}
                </button>
              </>
            )}

            {resolution.iterationCount > 0 && (
              <button
                type="button"
                onClick={onOpenTableaux}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Table2 className="w-4 h-4" />
                {t.viewTableauxBtn} ({resolution.iterationCount})
              </button>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <div
          className={`p-4 rounded-lg border flex items-start gap-3 ${
            isOptimal
              ? 'bg-[var(--petrol-50)] border-[var(--border-hairline)] text-[var(--petrol-800)]'
              : isErrorState
                ? 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/60 dark:border-red-800 dark:text-red-200'
                : 'bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200'
          }`}
        >
          {isOptimal ? (
            <CheckCircle2 className="w-5 h-5 text-[var(--petrol-700)] shrink-0 mt-0.5" />
          ) : isErrorState ? (
            <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          )}

          <div className="space-y-1 text-sm">
            <p className="font-semibold">{statusLabel}</p>
            {outcome === 'optimal_multiple' && (
              <p className="text-xs opacity-90">{t.multipleOptimaNotice}</p>
            )}
            {resolution.degeneracyDetected && (
              <p className="text-xs opacity-85">{t.degeneracyNote}</p>
            )}
            {resolution.blandActivated && (
              <p className="text-xs opacity-85">{t.blandNote}</p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--surface-muted)] rounded-lg w-fit">
          {(
            [
              ['summary', t.tabs.summary],
              ['variables', t.tabs.variables],
              ['constraints', t.tabs.constraints],
              ['economic', t.tabs.economic],
            ] as [ResultTab, string][]
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tabKey
                  ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab 1: Summary */}
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
                <dt className="text-xs text-[var(--ink-secondary)]">
                  {t.optimalValueLabel}
                </dt>
                <dd className="mt-1 text-xl font-bold font-mono tabular-nums text-[var(--petrol-800)]">
                  {formatNumericCell(
                    resolution.objectiveValue,
                    numberFormat,
                    decimalPrecision
                  )}
                </dd>
              </div>
              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
                <dt className="text-xs text-[var(--ink-secondary)]">
                  {t.methodLabel}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-[var(--ink-primary)]">
                  {resolution.methodUsed
                    ? t.methods[resolution.methodUsed]
                    : '—'}
                </dd>
              </div>
              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
                <dt className="text-xs text-[var(--ink-secondary)]">
                  {t.durationLabel}
                </dt>
                <dd className="mt-1 text-sm font-semibold font-mono tabular-nums">
                  {resolution.durationMs !== null
                    ? `${resolution.durationMs} ms`
                    : '—'}
                </dd>
              </div>
              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
                <dt className="text-xs text-[var(--ink-secondary)]">
                  {t.iterationsLabel}
                </dt>
                <dd className="mt-1 text-sm font-semibold font-mono tabular-nums">
                  {resolution.iterationCount}
                </dd>
              </div>
            </dl>

            {resolution.verification && (
              <div className="border border-[var(--border-hairline)] rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                  {t.verificationTitle}
                </h3>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {(
                    Object.entries(resolution.verification.checks) as [
                      keyof typeof t.verificationChecks,
                      boolean,
                    ][]
                  ).map(([key, ok]) => (
                    <li
                      key={key}
                      className="flex items-center gap-2 text-[var(--ink-primary)]"
                    >
                      {ok ? (
                        <CheckCircle2 className="w-4 h-4 text-[var(--petrol-700)] shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                      )}
                      <span>{t.verificationChecks[key]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Optimal Variables */}
        {activeTab === 'variables' && (
          <div className="overflow-x-auto border border-[var(--border-hairline)] rounded-lg">
            {resolution.variables && resolution.variables.length > 0 ? (
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-[var(--surface-muted)] text-xs font-semibold text-[var(--ink-secondary)]">
                  <tr>
                    <th className="px-4 py-2.5">{t.colVar}</th>
                    <th className="px-4 py-2.5 text-right">{t.colFraction}</th>
                    <th className="px-4 py-2.5 text-right">{t.colDecimal}</th>
                    <th className="px-4 py-2.5">{t.colUnit}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)] font-mono tabular-nums">
                  {resolution.variables.map((v) => (
                    <tr key={v.name} className="bg-[var(--surface-panel)]">
                      <td className="px-4 py-2.5 font-semibold text-[var(--petrol-800)]">
                        {v.name}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {v.value.fraction}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {formatNumericCell(
                          v.value,
                          'decimal',
                          decimalPrecision
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-sans text-xs text-[var(--ink-secondary)]">
                        {v.unit ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-6 text-sm text-[var(--ink-secondary)]">—</p>
            )}
          </div>
        )}

        {/* Tab 3: Constraints Check */}
        {activeTab === 'constraints' && (
          <div className="overflow-x-auto border border-[var(--border-hairline)] rounded-lg">
            {resolution.constraints && resolution.constraints.length > 0 ? (
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-[var(--surface-muted)] text-xs font-semibold text-[var(--ink-secondary)]">
                  <tr>
                    <th className="px-4 py-2.5">{t.colConstraint}</th>
                    <th className="px-4 py-2.5 text-right">{t.colLhs}</th>
                    <th className="px-4 py-2.5 text-center">{t.colOp}</th>
                    <th className="px-4 py-2.5 text-right">{t.colRhs}</th>
                    <th className="px-4 py-2.5 text-right">{t.colSlack}</th>
                    <th className="px-4 py-2.5">{t.colState}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {resolution.constraints.map((c) => (
                    <tr key={c.index} className="bg-[var(--surface-panel)]">
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatNumericCell(c.lhs, numberFormat, decimalPrecision)}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono">
                        {opSymbol(c.operator)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatNumericCell(c.rhs, numberFormat, decimalPrecision)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatNumericCell(
                          c.slackOrSurplus,
                          numberFormat,
                          decimalPrecision
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-semibold">
                        <span
                          className={
                            c.isBinding
                              ? 'text-[var(--petrol-800)]'
                              : 'text-[var(--ink-secondary)]'
                          }
                        >
                          {c.isBinding ? t.binding : t.nonBinding}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-6 text-sm text-[var(--ink-secondary)]">—</p>
            )}
          </div>
        )}

        {/* Tab 4: Economic Analysis */}
        {activeTab === 'economic' && (
          <div>
            {resolution.economicAnalysisAvailable &&
            resolution.constraints &&
            resolution.constraints.length > 0 ? (
              <div className="overflow-x-auto border border-[var(--border-hairline)] rounded-lg">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-[var(--surface-muted)] text-xs font-semibold text-[var(--ink-secondary)]">
                    <tr>
                      <th className="px-4 py-2.5">{t.colConstraint}</th>
                      <th className="px-4 py-2.5 text-right">
                        {t.shadowPrice}
                      </th>
                      <th className="px-4 py-2.5">{t.colState}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {resolution.constraints.map((c) => (
                      <tr key={c.index} className="bg-[var(--surface-panel)]">
                        <td className="px-4 py-2.5 font-medium">{c.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-[var(--petrol-800)]">
                          {formatNumericCell(
                            c.shadowPrice,
                            numberFormat,
                            decimalPrecision
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--ink-secondary)]">
                          {c.isBinding ? t.binding : t.nonBinding}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] flex items-start gap-3 text-sm text-[var(--ink-secondary)]">
                <Info className="w-5 h-5 text-[var(--petrol-700)] shrink-0 mt-0.5" />
                <p>{t.economicNotAvailable}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
