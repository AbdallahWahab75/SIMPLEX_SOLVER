import type { Locale } from '../i18n/translations.ts';
import { TRANSLATIONS } from '../i18n/translations.ts';
import type { ProblemModel } from '../types/solver.ts';

interface MathSummaryProps {
  model: ProblemModel;
  locale: Locale;
}

function formatLinearTerms(
  varNames: string[],
  coeffs: Record<string, number | string>
): string {
  const parts: string[] = [];
  for (const name of varNames) {
    const raw = coeffs[name];
    if (raw === undefined || raw === null || raw === '') continue;
    const str = String(raw).trim();
    if (!str || str === '0') continue;

    const isNegative = str.startsWith('-');
    const absStr = isNegative ? str.slice(1).trim() : str.replace(/^\+/, '').trim();

    if (parts.length === 0) {
      if (absStr === '1') {
        parts.push(isNegative ? `-${name}` : name);
      } else {
        parts.push(isNegative ? `-${absStr}·${name}` : `${absStr}·${name}`);
      }
    } else {
      const sign = isNegative ? ' - ' : ' + ';
      if (absStr === '1') {
        parts.push(`${sign}${name}`);
      } else {
        parts.push(`${sign}${absStr}·${name}`);
      }
    }
  }
  return parts.length > 0 ? parts.join('') : '0';
}

function formatDomain(
  name: string,
  def: ProblemModel['variables'][string]
): string {
  switch (def.type) {
    case 'non_negative':
      return `${name} ≥ 0`;
    case 'non_positive':
      return `${name} ≤ 0`;
    case 'free':
      return `${name} ∈ ℝ`;
    case 'lower_bounded':
      return `${name} ≥ ${def.lower ?? '?'}`;
    case 'upper_bounded':
      return `${name} ≤ ${def.upper ?? '?'}`;
    case 'bounded':
      return `${def.lower ?? '?'} ≤ ${name} ≤ ${def.upper ?? '?'}`;
  }
}

export function MathSummary({ model, locale }: MathSummaryProps) {
  const t = TRANSLATIONS[locale];
  const varNames = Object.keys(model.variables);
  const objExpr = formatLinearTerms(varNames, model.objective);
  const senseLabel = model.sense === 'maximize' ? t.maximize : t.minimize;

  const opSymbol = (op: string) => {
    if (op === '<=') return '≤';
    if (op === '>=') return '≥';
    return '=';
  };

  return (
    <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-[var(--ink-primary)]">
          {t.mathSummaryTitle}
        </h2>
        {model.objectiveUnit && (
          <span className="text-xs text-[var(--ink-secondary)]">
            {model.objectiveUnit}
          </span>
        )}
      </div>

      <div className="bg-[var(--surface-canvas)] border border-[var(--border-hairline)] rounded-lg p-4 font-mono text-sm space-y-2.5 overflow-x-auto">
        <div className="font-semibold text-[var(--petrol-800)]">
          {senseLabel} Z = {objExpr}
        </div>

        {model.constraints.length > 0 && (
          <div className="space-y-1 pl-4 border-t border-[var(--border-hairline)] pt-2.5">
            {model.constraints.map((c, idx) => (
              <div key={idx} className="flex items-baseline gap-3">
                <span className="text-xs text-[var(--ink-secondary)] min-w-20 shrink-0">
                  {c.name?.trim() || `C${idx + 1}`}:
                </span>
                <span className="text-[var(--ink-primary)]">
                  {formatLinearTerms(varNames, c.coefficients)} {opSymbol(c.operator)}{' '}
                  {c.rhs === '' ? '?' : String(c.rhs)}
                </span>
              </div>
            ))}
          </div>
        )}

        {varNames.length > 0 && (
          <div className="pt-2 border-t border-[var(--border-hairline)] text-xs text-[var(--ink-secondary)] flex flex-wrap gap-x-4 gap-y-1">
            {varNames.map((v) => (
              <span key={v}>{formatDomain(v, model.variables[v])}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
