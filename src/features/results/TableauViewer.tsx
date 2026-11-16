import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { Locale } from '../../i18n/translations.ts';
import { TRANSLATIONS } from '../../i18n/translations.ts';
import type {
  IterationSnapshot,
  NumberDisplayMode,
} from '../../types/solver.ts';
import { formatNumericCell } from '../../utils/formatNumber.ts';

interface TableauViewerProps {
  locale: Locale;
  iterations: IterationSnapshot[];
  numberFormat: NumberDisplayMode;
  decimalPrecision?: number;
  onChangeNumberFormat: (mode: NumberDisplayMode) => void;
  onExportPdfWithTableaux?: () => void;
}

type TableDensity = 'compact' | 'normal' | 'wide';

export function TableauViewer({
  locale,
  iterations,
  numberFormat,
  decimalPrecision = 4,
  onChangeNumberFormat,
  onExportPdfWithTableaux,
}: TableauViewerProps) {
  const t = TRANSLATIONS[locale];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [density, setDensity] = useState<TableDensity>('normal');

  if (iterations.length === 0) {
    return (
      <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-8 text-center space-y-2">
        <h1 className="text-lg font-semibold text-[var(--ink-primary)]">
          {t.tableauxTitle}
        </h1>
        <p className="text-sm text-[var(--ink-secondary)]">{t.noTableaux}</p>
      </section>
    );
  }

  const safeIndex = Math.min(currentIndex, iterations.length - 1);
  const snap = iterations[safeIndex];

  const cellPad =
    density === 'compact'
      ? 'px-2 py-1 text-xs'
      : density === 'wide'
        ? 'px-5 py-3 text-sm'
        : 'px-3.5 py-2 text-xs';

  return (
    <div className="space-y-6">
      <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-5">
        {/* Header & display settings */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-[var(--ink-primary)]">
              {t.tableauxTitle}
            </h1>
            <p className="text-xs text-[var(--ink-secondary)]">
              {t.iterationOf} {safeIndex + 1} / {iterations.length} ·{' '}
              {t.phaseLabel} {snap.phase} · {t.ruleLabel}:{' '}
              {t.rules[snap.ruleUsed] ?? snap.ruleUsed}
              {snap.isDegenerate ? ` · ${t.degeneratePivot}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Number format selector */}
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

            {/* Zoom / Density selector */}
            <div className="flex items-center gap-1 p-1 bg-[var(--surface-muted)] rounded-lg">
              {(['compact', 'normal', 'wide'] as TableDensity[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    density === d
                      ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                      : 'text-[var(--ink-secondary)]'
                  }`}
                >
                  {d === 'compact'
                    ? t.densityCompact
                    : d === 'wide'
                      ? t.densityWide
                      : t.densityNormal}
                </button>
              ))}
            </div>

            {onExportPdfWithTableaux && (
              <button
                type="button"
                onClick={onExportPdfWithTableaux}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--petrol-800)] hover:bg-[var(--surface-muted)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {t.exportPdfTableauxBtn}
              </button>
            )}
          </div>
        </div>

        {/* Navigation controls & direct iteration selector */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={safeIndex === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              {t.prevIter}
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex((i) => Math.min(iterations.length - 1, i + 1))
              }
              disabled={safeIndex >= iterations.length - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.nextIter}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Direct iteration buttons */}
          <div className="flex items-center gap-1 flex-wrap">
            {iterations.map((it, idx) => (
              <button
                key={it.iterationNumber}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`min-w-8 px-2 py-1 text-xs font-mono font-semibold rounded border transition-colors cursor-pointer ${
                  idx === safeIndex
                    ? 'bg-[var(--petrol-700)] text-white border-[var(--petrol-700)]'
                    : 'bg-[var(--surface-canvas)] text-[var(--ink-primary)] border-[var(--border-hairline)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                {it.iterationNumber}
              </button>
            ))}
          </div>
        </div>

        {/* Pivot metadata summary */}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-sm">
          <div>
            <dt className="text-xs text-[var(--ink-secondary)]">
              {t.enteringVar}
            </dt>
            <dd className="font-mono font-semibold text-[var(--petrol-800)] mt-0.5">
              {snap.enteringVariable ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-secondary)]">
              {t.leavingVar}
            </dt>
            <dd className="font-mono font-semibold text-[var(--sand-accent)] mt-0.5">
              {snap.leavingVariable ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-secondary)]">
              {t.pivotElem}
            </dt>
            <dd className="font-mono font-semibold tabular-nums mt-0.5">
              {formatNumericCell(
                snap.pivotElement,
                numberFormat,
                decimalPrecision
              )}
            </dd>
          </div>
        </dl>

        {/* Simplex Tableau */}
        <div className="overflow-x-auto border border-[var(--border-hairline)] rounded-lg">
          <table className="w-full border-collapse font-mono tabular-nums text-right">
            <thead className="bg-[var(--surface-muted)] text-[var(--ink-secondary)]">
              <tr>
                <th
                  className={`${cellPad} text-left font-semibold border-b border-r border-[var(--border-hairline)]`}
                >
                  Base
                </th>
                {snap.columnHeaders.map((header, colIdx) => {
                  const isEnteringCol = snap.pivotColumn === colIdx;
                  return (
                    <th
                      key={`${header}-${colIdx}`}
                      className={`${cellPad} font-semibold border-b border-[var(--border-hairline)] whitespace-nowrap ${
                        isEnteringCol
                          ? 'bg-[var(--petrol-50)] text-[var(--petrol-800)]'
                          : ''
                      }`}
                    >
                      {header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {snap.rows.map((row, rowIdx) => {
                const isLeavingRow = snap.pivotRow === rowIdx;
                return (
                  <tr
                    key={rowIdx}
                    className={
                      isLeavingRow
                        ? 'bg-[var(--surface-leaving-row)]'
                        : 'bg-[var(--surface-panel)]'
                    }
                  >
                    <td
                      className={`${cellPad} text-left font-semibold border-r border-[var(--border-hairline)] text-[var(--ink-primary)] whitespace-nowrap`}
                    >
                      {snap.basicVariables[rowIdx] ?? `R${rowIdx + 1}`}
                    </td>
                    {row.map((cell, colIdx) => {
                      const isPivot =
                        snap.pivotRow === rowIdx &&
                        snap.pivotColumn === colIdx;
                      const isEnteringCol = snap.pivotColumn === colIdx;

                      let cellClass = '';
                      if (isPivot) {
                        cellClass =
                          'bg-[var(--petrol-700)] text-white font-bold ring-2 ring-inset ring-[var(--sand-accent)]';
                      } else if (isEnteringCol && !isLeavingRow) {
                        cellClass = 'bg-[var(--petrol-50)]';
                      }

                      return (
                        <td
                          key={colIdx}
                          className={`${cellPad} whitespace-nowrap ${cellClass}`}
                        >
                          {formatNumericCell(
                            cell,
                            numberFormat,
                            decimalPrecision
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--surface-canvas)] border-t-2 border-[var(--border-hairline)] font-semibold">
                <td
                  className={`${cellPad} text-left border-r border-[var(--border-hairline)] text-[var(--petrol-800)] whitespace-nowrap`}
                >
                  Δj (cj - zj)
                </td>
                {snap.objectiveRow.map((cell, colIdx) => (
                  <td
                    key={colIdx}
                    className={`${cellPad} whitespace-nowrap ${
                      snap.pivotColumn === colIdx
                        ? 'bg-[var(--petrol-50)] text-[var(--petrol-800)]'
                        : ''
                    }`}
                  >
                    {formatNumericCell(
                      cell,
                      numberFormat,
                      decimalPrecision
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
