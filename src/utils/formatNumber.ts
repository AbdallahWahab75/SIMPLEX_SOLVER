import type { FormattedValue, NumberDisplayMode } from '../types/solver.ts';

export function formatDecimal(num: number, precision = 4): string {
  if (!Number.isFinite(num)) return '—';
  const rounded = Number(num.toFixed(precision));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function formatNumericCell(
  val: FormattedValue | null | undefined,
  mode: NumberDisplayMode,
  precision = 4
): string {
  if (!val) return '—';
  if (mode === 'fraction') return val.fraction;
  if (mode === 'decimal') return formatDecimal(val.decimal, precision);
  if (val.fraction === formatDecimal(val.decimal, precision)) {
    return val.fraction;
  }
  return `${val.fraction} (${formatDecimal(val.decimal, precision)})`;
}
