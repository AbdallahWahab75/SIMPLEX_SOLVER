import { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Play,
  Save,
  Sparkles,
  Square,
  Upload,
  Share2,
  Download,
} from 'lucide-react';
import type { Locale } from '../../i18n/translations.ts';
import { TRANSLATIONS } from '../../i18n/translations.ts';
import type {
  ConstraintOperator,
  NumericInput,
  ProblemAccessRole,
  ProblemModel,
  ValidationIssue,
  VariableDomainType,
} from '../../types/solver.ts';
import { MathSummary } from '../../components/MathSummary.tsx';

export type EditorInputMode = 'guided' | 'matrix';

interface ProblemEditorProps {
  locale: Locale;
  model: ProblemModel;
  onChangeModel: (next: ProblemModel) => void;
  activeProblemId: number | null;
  validationIssues: ValidationIssue[];
  validationOk: boolean;
  isValidating: boolean;
  isSaving: boolean;
  isSolving: boolean;
  solveTaskStatus: string | null;
  isAuthenticated: boolean;
  onValidate: () => void;
  onSave: () => void;
  onSolve: () => void;
  onCancelSolve: () => void;
  onLoadExample: () => void;
  onResetNew: () => void;
  onSignIn: () => void;
  draftRestored?: boolean;
  onDiscardDraft?: () => void;
  accessRole?: ProblemAccessRole;
  onOpenImport?: () => void;
  onOpenShare?: () => void;
  onExport?: (format: 'pdf' | 'xlsx' | 'csv') => void;
}

export function ProblemEditor({
  locale,
  model,
  onChangeModel,
  activeProblemId,
  validationIssues,
  validationOk,
  isValidating,
  isSaving,
  isSolving,
  solveTaskStatus,
  isAuthenticated,
  onValidate,
  onSave,
  onSolve,
  onCancelSolve,
  onLoadExample,
  onResetNew,
  onSignIn,
  draftRestored = false,
  onDiscardDraft,
  accessRole = 'owner',
  onOpenImport,
  onOpenShare,
  onExport,
}: ProblemEditorProps) {
  const t = TRANSLATIONS[locale];
  const [inputMode, setInputMode] = useState<EditorInputMode>('guided');
  const isReadOnly = activeProblemId !== null && accessRole === 'reader';

  const varNames = Object.keys(model.variables);

  const hasFieldError = (prefix: string) =>
    validationIssues.some(
      (issue) => issue.field === prefix || issue.field.startsWith(`${prefix}.`)
    );

  const getFieldMessages = (prefix: string) =>
    validationIssues.filter(
      (issue) => issue.field === prefix || issue.field.startsWith(`${prefix}.`)
    );

  const addVariable = () => {
    let idx = varNames.length + 1;
    let candidate = `x${idx}`;
    while (Object.prototype.hasOwnProperty.call(model.variables, candidate)) {
      idx += 1;
      candidate = `x${idx}`;
    }

    onChangeModel({
      ...model,
      variables: {
        ...model.variables,
        [candidate]: { type: 'non_negative' },
      },
      objective: {
        ...model.objective,
        [candidate]: 0,
      },
      constraints: model.constraints.map((c) => ({
        ...c,
        coefficients: { ...c.coefficients, [candidate]: 0 },
      })),
    });
  };

  const renameVariable = (oldName: string, newNameRaw: string) => {
    const newName = newNameRaw.trim();
    if (!newName || newName === oldName) return;
    if (Object.prototype.hasOwnProperty.call(model.variables, newName)) return;

    const nextVariables: ProblemModel['variables'] = {};
    const nextObjective: ProblemModel['objective'] = {};

    for (const k of varNames) {
      const targetKey = k === oldName ? newName : k;
      nextVariables[targetKey] = model.variables[k];
      nextObjective[targetKey] = model.objective[k] ?? 0;
    }

    const nextConstraints = model.constraints.map((c) => {
      const nextCoeffs: Record<string, NumericInput> = {};
      for (const k of varNames) {
        const targetKey = k === oldName ? newName : k;
        nextCoeffs[targetKey] = c.coefficients[k] ?? 0;
      }
      return { ...c, coefficients: nextCoeffs };
    });

    onChangeModel({
      ...model,
      variables: nextVariables,
      objective: nextObjective,
      constraints: nextConstraints,
    });
  };

  const removeVariable = (target: string) => {
    if (varNames.length <= 1) return;
    const nextVariables = { ...model.variables };
    delete nextVariables[target];
    const nextObjective = { ...model.objective };
    delete nextObjective[target];
    const nextConstraints = model.constraints.map((c) => {
      const nextCoeffs = { ...c.coefficients };
      delete nextCoeffs[target];
      return { ...c, coefficients: nextCoeffs };
    });
    onChangeModel({
      ...model,
      variables: nextVariables,
      objective: nextObjective,
      constraints: nextConstraints,
    });
  };

  const updateVariableDef = (
    varName: string,
    patch: Partial<ProblemModel['variables'][string]>
  ) => {
    onChangeModel({
      ...model,
      variables: {
        ...model.variables,
        [varName]: {
          ...model.variables[varName],
          ...patch,
        },
      },
    });
  };

  const updateObjectiveCoeff = (varName: string, value: string) => {
    onChangeModel({
      ...model,
      objective: {
        ...model.objective,
        [varName]: value,
      },
    });
  };

  const addConstraint = () => {
    const coeffs: Record<string, NumericInput> = {};
    for (const v of varNames) {
      coeffs[v] = 0;
    }
    onChangeModel({
      ...model,
      constraints: [
        ...model.constraints,
        {
          name: `C${model.constraints.length + 1}`,
          coefficients: coeffs,
          operator: '<=',
          rhs: 0,
        },
      ],
    });
  };

  const removeConstraint = (idx: number) => {
    onChangeModel({
      ...model,
      constraints: model.constraints.filter((_, i) => i !== idx),
    });
  };

  const updateConstraint = (
    idx: number,
    patch: Partial<ProblemModel['constraints'][number]>
  ) => {
    onChangeModel({
      ...model,
      constraints: model.constraints.map((c, i) =>
        i === idx ? { ...c, ...patch } : c
      ),
    });
  };

  const updateConstraintCoeff = (
    conIdx: number,
    varName: string,
    value: string
  ) => {
    onChangeModel({
      ...model,
      constraints: model.constraints.map((c, i) =>
        i === conIdx
          ? { ...c, coefficients: { ...c.coefficients, [varName]: value } }
          : c
      ),
    });
  };

  return (
    <div className="space-y-6">
      {/* Workspace Toolbar */}
      <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onResetNew}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.newProblem}
          </button>
          <button
            type="button"
            onClick={onLoadExample}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] text-[var(--petrol-800)] hover:bg-[var(--petrol-50)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.loadExample}
          </button>
          {onOpenImport && (
            <button
              type="button"
              disabled={!isAuthenticated}
              onClick={onOpenImport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] text-[var(--petrol-800)] hover:bg-[var(--petrol-50)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {t.importBtn}
            </button>
          )}
          {activeProblemId !== null && onOpenShare && (
            <button
              type="button"
              onClick={onOpenShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] text-[var(--petrol-800)] hover:bg-[var(--petrol-50)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              {t.sharingBtn}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-[var(--surface-muted)] rounded-lg">
          <button
            type="button"
            onClick={() => setInputMode('guided')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              inputMode === 'guided'
                ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            {t.modeGuided}
          </button>
          <button
            type="button"
            onClick={() => setInputMode('matrix')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              inputMode === 'matrix'
                ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            {t.modeMatrix}
          </button>
        </div>
      </div>

      {isReadOnly && (
        <div className="bg-[var(--petrol-50)] border border-[var(--border-hairline)] rounded-xl px-4 py-3 text-xs font-medium text-[var(--petrol-800)]">
          {t.sharingReaderNotice}
        </div>
      )}

      {draftRestored && onDiscardDraft && (
        <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-[var(--ink-secondary)]">
            {t.draftRestoredNote}
          </span>
          <button
            type="button"
            onClick={onDiscardDraft}
            className="px-3 py-1 font-medium rounded-md border border-[var(--border-hairline)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] cursor-pointer"
          >
            {t.clearDraftBtn}
          </button>
        </div>
      )}

      {/* Main Editor Card */}
      <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
          <h1 className="text-xl font-bold text-[var(--ink-primary)]">
            {t.editorTitle}
          </h1>
          <p className="text-xs text-[var(--ink-secondary)]">{t.numericHint}</p>
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="problem-name"
              className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5"
            >
              {t.problemName}
            </label>
            <input
              id="problem-name"
              type="text"
              value={model.name}
              onChange={(e) => onChangeModel({ ...model, name: e.target.value })}
              placeholder={t.problemNamePlaceholder}
              className={`w-full px-3 py-2 text-sm rounded-lg border bg-[var(--surface-panel)] focus-visible:outline-2 focus-visible:outline-[var(--petrol-700)] ${
                hasFieldError('name')
                  ? 'border-red-600'
                  : 'border-[var(--border-hairline)]'
              }`}
            />
            {getFieldMessages('name').map((err, i) => (
              <p key={i} className="mt-1 text-xs text-red-700 dark:text-red-400">
                {err.message}
              </p>
            ))}
          </div>

          <div>
            <label
              htmlFor="objective-sense"
              className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5"
            >
              {t.senseLabel}
            </label>
            <select
              id="objective-sense"
              value={model.sense}
              onChange={(e) =>
                onChangeModel({
                  ...model,
                  sense: e.target.value as 'maximize' | 'minimize',
                })
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] focus-visible:outline-2 focus-visible:outline-[var(--petrol-700)]"
            >
              <option value="maximize">{t.maximize}</option>
              <option value="minimize">{t.minimize}</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="objective-unit"
              className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5"
            >
              {t.objectiveUnit}
            </label>
            <input
              id="objective-unit"
              type="text"
              value={model.objectiveUnit ?? ''}
              onChange={(e) =>
                onChangeModel({ ...model, objectiveUnit: e.target.value })
              }
              placeholder={t.objectiveUnitPlaceholder}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] focus-visible:outline-2 focus-visible:outline-[var(--petrol-700)]"
            />
          </div>
        </div>

        {/* Guided Mode */}
        {inputMode === 'guided' && (
          <div className="space-y-8">
            {/* Variables & Objective */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  {t.variablesTitle} ({varNames.length})
                </h2>
                <button
                  type="button"
                  onClick={addVariable}
                  disabled={varNames.length >= 100}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--petrol-50)] text-[var(--petrol-800)] hover:bg-[var(--surface-muted)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.addVariable}
                </button>
              </div>

              <div className="overflow-x-auto border border-[var(--border-hairline)] rounded-lg">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-[var(--surface-muted)] text-xs font-semibold text-[var(--ink-secondary)]">
                    <tr>
                      <th className="px-3 py-2.5">{t.varName}</th>
                      <th className="px-3 py-2.5">{t.objCoeff}</th>
                      <th className="px-3 py-2.5">{t.domainType}</th>
                      <th className="px-3 py-2.5">{t.lowerBound}</th>
                      <th className="px-3 py-2.5">{t.upperBound}</th>
                      <th className="px-3 py-2.5">{t.unitOptional}</th>
                      <th className="px-3 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {varNames.map((vName) => {
                      const vDef = model.variables[vName];
                      const showLower =
                        vDef.type === 'lower_bounded' || vDef.type === 'bounded';
                      const showUpper =
                        vDef.type === 'upper_bounded' || vDef.type === 'bounded';
                      const varErr = hasFieldError(`variables.${vName}`);
                      const objErr = hasFieldError(`objective.${vName}`);

                      return (
                        <tr key={vName} className="bg-[var(--surface-panel)]">
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              defaultValue={vName}
                              onBlur={(e) => renameVariable(vName, e.target.value)}
                              aria-label={`${t.varName} ${vName}`}
                              className={`w-24 px-2 py-1.5 font-mono text-xs rounded border bg-[var(--surface-canvas)] ${
                                varErr
                                  ? 'border-red-600'
                                  : 'border-[var(--border-hairline)]'
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={String(model.objective[vName] ?? '')}
                              onChange={(e) =>
                                updateObjectiveCoeff(vName, e.target.value)
                              }
                              aria-label={`${t.objCoeff} ${vName}`}
                              className={`w-24 px-2 py-1.5 font-mono text-xs tabular-nums rounded border ${
                                objErr
                                  ? 'border-red-600'
                                  : 'border-[var(--border-hairline)]'
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={vDef.type}
                              onChange={(e) => {
                                const nextType = e.target
                                  .value as VariableDomainType;
                                updateVariableDef(vName, {
                                  type: nextType,
                                  lower:
                                    nextType === 'lower_bounded' ||
                                    nextType === 'bounded'
                                      ? vDef.lower ?? 0
                                      : null,
                                  upper:
                                    nextType === 'upper_bounded' ||
                                    nextType === 'bounded'
                                      ? vDef.upper ?? 10
                                      : null,
                                });
                              }}
                              aria-label={`${t.domainType} ${vName}`}
                              className="px-2 py-1.5 text-xs rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                            >
                              {Object.entries(t.domains).map(([val, label]) => (
                                <option key={val} value={val}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {showLower ? (
                              <input
                                type="text"
                                value={String(vDef.lower ?? '')}
                                onChange={(e) =>
                                  updateVariableDef(vName, {
                                    lower: e.target.value,
                                  })
                                }
                                aria-label={`${t.lowerBound} ${vName}`}
                                className={`w-20 px-2 py-1.5 font-mono text-xs tabular-nums rounded border ${
                                  varErr
                                    ? 'border-red-600'
                                    : 'border-[var(--border-hairline)]'
                                }`}
                              />
                            ) : (
                              <span className="text-xs text-[var(--ink-secondary)]">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {showUpper ? (
                              <input
                                type="text"
                                value={String(vDef.upper ?? '')}
                                onChange={(e) =>
                                  updateVariableDef(vName, {
                                    upper: e.target.value,
                                  })
                                }
                                aria-label={`${t.upperBound} ${vName}`}
                                className={`w-20 px-2 py-1.5 font-mono text-xs tabular-nums rounded border ${
                                  varErr
                                    ? 'border-red-600'
                                    : 'border-[var(--border-hairline)]'
                                }`}
                              />
                            ) : (
                              <span className="text-xs text-[var(--ink-secondary)]">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={vDef.unit ?? ''}
                              onChange={(e) =>
                                updateVariableDef(vName, {
                                  unit: e.target.value,
                                })
                              }
                              placeholder="u."
                              aria-label={`${t.unitOptional} ${vName}`}
                              className="w-20 px-2 py-1.5 text-xs rounded border border-[var(--border-hairline)]"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeVariable(vName)}
                              disabled={varNames.length <= 1}
                              className="p-1.5 text-[var(--ink-secondary)] hover:text-red-700 dark:hover:text-red-400 disabled:opacity-30 cursor-pointer"
                              aria-label={`Remove ${vName}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Constraints */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  {t.constraintsTitle} ({model.constraints.length})
                </h2>
                <button
                  type="button"
                  onClick={addConstraint}
                  disabled={model.constraints.length >= 200}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--petrol-50)] text-[var(--petrol-800)] hover:bg-[var(--surface-muted)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.addConstraint}
                </button>
              </div>

              <div className="space-y-3">
                {model.constraints.map((con, idx) => {
                  const conErr = hasFieldError(`constraints[${idx}]`);
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border bg-[var(--surface-canvas)] space-y-3 ${
                        conErr
                          ? 'border-red-600'
                          : 'border-[var(--border-hairline)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <input
                          type="text"
                          value={con.name ?? ''}
                          onChange={(e) =>
                            updateConstraint(idx, { name: e.target.value })
                          }
                          placeholder={`C${idx + 1}`}
                          aria-label={`${t.constraintName} ${idx + 1}`}
                          className="w-44 px-2.5 py-1.5 text-xs font-semibold rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={con.operator}
                            onChange={(e) =>
                              updateConstraint(idx, {
                                operator: e.target.value as ConstraintOperator,
                              })
                            }
                            aria-label={`${t.relation} ${idx + 1}`}
                            className="px-2.5 py-1.5 font-mono text-xs rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                          >
                            <option value="<=">≤</option>
                            <option value=">=">≥</option>
                            <option value="=">=</option>
                          </select>
                          <input
                            type="text"
                            value={String(con.rhs ?? '')}
                            onChange={(e) =>
                              updateConstraint(idx, { rhs: e.target.value })
                            }
                            aria-label={`${t.rhs} ${idx + 1}`}
                            className="w-28 px-2.5 py-1.5 font-mono text-xs tabular-nums rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                          />
                          <button
                            type="button"
                            onClick={() => removeConstraint(idx)}
                            className="p-1.5 text-[var(--ink-secondary)] hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                            aria-label={`Remove constraint ${idx + 1}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {varNames.map((vName) => (
                          <div key={vName} className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-[var(--ink-secondary)]">
                              {vName}:
                            </span>
                            <input
                              type="text"
                              value={String(con.coefficients[vName] ?? 0)}
                              onChange={(e) =>
                                updateConstraintCoeff(idx, vName, e.target.value)
                              }
                              aria-label={`${con.name ?? idx + 1} ${vName}`}
                              className="w-20 px-2 py-1 font-mono text-xs tabular-nums rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Matrix Mode */}
        {inputMode === 'matrix' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addVariable}
                  disabled={varNames.length >= 100}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--petrol-50)] text-[var(--petrol-800)] hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.addVariable}
                </button>
                <button
                  type="button"
                  onClick={addConstraint}
                  disabled={model.constraints.length >= 200}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--petrol-50)] text-[var(--petrol-800)] hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.addConstraint}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-[var(--border-hairline)] rounded-lg">
              <table className="w-full text-xs border-collapse font-mono tabular-nums">
                <thead className="bg-[var(--surface-muted)] text-[var(--ink-secondary)]">
                  <tr>
                    <th className="px-3 py-2 text-left">{t.constraintName}</th>
                    {varNames.map((v) => (
                      <th key={v} className="px-2 py-2 text-center">
                        {v}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center">{t.relation}</th>
                    <th className="px-2 py-2 text-center">{t.rhs}</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {/* Objective Row */}
                  <tr className="bg-[var(--petrol-50)]">
                    <td className="px-3 py-2 font-semibold text-[var(--petrol-800)]">
                      Z ({model.sense === 'maximize' ? 'Max' : 'Min'})
                    </td>
                    {varNames.map((v) => (
                      <td key={v} className="px-2 py-1.5">
                        <input
                          type="text"
                          value={String(model.objective[v] ?? 0)}
                          onChange={(e) => updateObjectiveCoeff(v, e.target.value)}
                          className="w-20 px-2 py-1 text-center rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center text-[var(--ink-secondary)]">
                      —
                    </td>
                    <td className="px-2 py-2 text-center text-[var(--ink-secondary)]">
                      —
                    </td>
                    <td></td>
                  </tr>

                  {/* Constraint Rows */}
                  {model.constraints.map((con, idx) => (
                    <tr key={idx} className="bg-[var(--surface-panel)]">
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={con.name ?? ''}
                          onChange={(e) =>
                            updateConstraint(idx, { name: e.target.value })
                          }
                          placeholder={`C${idx + 1}`}
                          className="w-28 px-2 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
                        />
                      </td>
                      {varNames.map((v) => (
                        <td key={v} className="px-2 py-1.5">
                          <input
                            type="text"
                            value={String(con.coefficients[v] ?? 0)}
                            onChange={(e) =>
                              updateConstraintCoeff(idx, v, e.target.value)
                            }
                            className="w-20 px-2 py-1 text-center rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center">
                        <select
                          value={con.operator}
                          onChange={(e) =>
                            updateConstraint(idx, {
                              operator: e.target.value as ConstraintOperator,
                            })
                          }
                          className="px-2 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                        >
                          <option value="<=">≤</option>
                          <option value=">=">≥</option>
                          <option value="=">=</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={String(con.rhs ?? '')}
                          onChange={(e) =>
                            updateConstraint(idx, { rhs: e.target.value })
                          }
                          className="w-24 px-2 py-1 text-center rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeConstraint(idx)}
                          className="p-1 text-[var(--ink-secondary)] hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                          aria-label={`Remove constraint ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Validation feedback */}
        {validationIssues.length > 0 && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
              <span>{t.validationFailed}</span>
            </div>
            <ul className="list-disc pl-6 text-xs space-y-1">
              {validationIssues.map((issue, idx) => (
                <li key={idx}>
                  <span className="font-mono font-semibold">{issue.field}</span>:{' '}
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {validationOk && validationIssues.length === 0 && (
          <div className="p-3 rounded-lg bg-[var(--petrol-50)] border border-[var(--border-hairline)] text-[var(--petrol-800)] flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 text-[var(--petrol-700)] shrink-0" />
            <span>{t.validationPassed}</span>
          </div>
        )}

        {/* Auth notice if signed out */}
        {!isAuthenticated && (
          <div className="p-4 rounded-lg bg-[var(--surface-muted)] border border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5 max-w-2xl">
              <p className="text-sm font-semibold text-[var(--ink-primary)]">
                {t.authBannerTitle}
              </p>
              <p className="text-xs text-[var(--ink-secondary)]">
                {t.authBannerBody}
              </p>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.signInGoogle}
            </button>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[var(--border-hairline)]">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onValidate}
              disabled={isValidating || isSolving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[var(--petrol-700)]" />
              {t.validateBtn}
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={!isAuthenticated || isSaving || isSolving || isReadOnly}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--petrol-800)] hover:bg-[var(--petrol-50)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {activeProblemId ? t.saveNewVersionBtn : t.saveBtn}
            </button>

            {onExport && isAuthenticated && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onExport('pdf')}
                  className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => onExport('xlsx')}
                  className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  XLSX
                </button>
                <button
                  type="button"
                  onClick={() => onExport('csv')}
                  className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isSolving && (
              <>
                <span className="text-xs font-medium text-[var(--petrol-800)]">
                  {solveTaskStatus === 'queued' ? t.taskQueued : t.taskRunning}
                </span>
                <button
                  type="button"
                  onClick={onCancelSolve}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  {t.cancelSolve}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onSolve}
              disabled={!isAuthenticated || isSolving || isReadOnly}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              {isSolving ? t.solving : t.solveBtn}
            </button>
          </div>
        </div>
      </section>

      {/* Live Mathematical Summary */}
      <MathSummary model={model} locale={locale} />
    </div>
  );
}
