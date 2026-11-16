import { solveStandardForm } from './simplex.js';
import { reconstructOriginalVariables, toStandardForm } from './transform.js';
import { DEFAULT_SOLVER_LIMITS, validateAndParseModel } from './validator.js';
import { verifyOptimalSolution } from './verifier.js';
import type { SolveResult, SolverLimits, VariableResult } from './types.js';

export const ENGINE_VERSION = '1.0.0-mvp';

export interface SolveOptions {
  limits?: Partial<SolverLimits>;
  signal?: AbortSignal;
  engineVersion?: string;
}

export function solveLinearProgram(
  rawModel: unknown,
  options: SolveOptions = {}
): SolveResult {
  const startTimeMs = Date.now();
  const engineVersion = options.engineVersion ?? ENGINE_VERSION;
  const limits: SolverLimits = {
    maxVariables: options.limits?.maxVariables ?? DEFAULT_SOLVER_LIMITS.maxVariables,
    maxConstraints:
      options.limits?.maxConstraints ?? DEFAULT_SOLVER_LIMITS.maxConstraints,
    timeoutMs: options.limits?.timeoutMs ?? DEFAULT_SOLVER_LIMITS.timeoutMs,
    tolerance: options.limits?.tolerance ?? DEFAULT_SOLVER_LIMITS.tolerance,
  };

  // 1. Validate formulation and server limits
  const validation = validateAndParseModel(rawModel, limits);
  if (!validation.valid) {
    return {
      status: 'invalid_model',
      methodUsed: 'none',
      engineVersion,
      durationMs: Date.now() - startTimeMs,
      objectiveValue: null,
      variables: [],
      constraints: [],
      economicAnalysisAvailable: false,
      iterations: [],
      iterationCount: 0,
      degeneracyDetected: false,
      blandActivated: false,
      verification: null,
      validationErrors: validation.issues,
      userMessageKey: 'solver.status.invalid_model',
      internalDiagnostics: validation.issues.map((i) => `${i.code}: ${i.field}`),
    };
  }

  const parsed = validation.parsed;

  try {
    // 2. Transform to standard form
    const std = toStandardForm(parsed);

    // 3. Solve with Primal or Two-Phase Simplex
    const core = solveStandardForm(parsed, std, {
      limits,
      signal: options.signal,
      startTimeMs,
    });

    const durationMs = Date.now() - startTimeMs;

    if (
      core.outcome === 'infeasible' ||
      core.outcome === 'unbounded' ||
      core.outcome === 'timed_out' ||
      core.outcome === 'cancelled' ||
      core.outcome === 'numerical_instability'
    ) {
      return {
        status: core.outcome,
        methodUsed: core.methodUsed,
        engineVersion,
        durationMs,
        objectiveValue: null,
        variables: [],
        constraints: [],
        economicAnalysisAvailable: false,
        iterations: core.iterations,
        iterationCount: core.iterations.length,
        degeneracyDetected: core.degeneracyDetected,
        blandActivated: core.blandActivated,
        verification: null,
        validationErrors: [],
        userMessageKey: `solver.status.${core.outcome}`,
        internalDiagnostics: core.diagnostics,
      };
    }

    // 4. Reconstruct original variables & perform mandatory independent verification
    const originalX = reconstructOriginalVariables(
      parsed,
      std,
      core.internalValues
    );

    const report = verifyOptimalSolution(
      parsed,
      std,
      core,
      originalX,
      limits.tolerance
    );

    if (!report.verification.passed) {
      return {
        status: 'numerical_instability',
        methodUsed: core.methodUsed,
        engineVersion,
        durationMs,
        objectiveValue: null,
        variables: [],
        constraints: [],
        economicAnalysisAvailable: false,
        iterations: core.iterations,
        iterationCount: core.iterations.length,
        degeneracyDetected: core.degeneracyDetected,
        blandActivated: core.blandActivated,
        verification: report.verification,
        validationErrors: [],
        userMessageKey: 'solver.status.numerical_instability',
        internalDiagnostics: [
          ...core.diagnostics,
          `Verification failed: maxConstraintViolation=${report.verification.maxConstraintViolation}, maxBoundViolation=${report.verification.maxBoundViolation}, objectiveDiscrepancy=${report.verification.objectiveDiscrepancy}`,
        ],
      };
    }

    const variables: VariableResult[] = parsed.variableOrder.map((varName) => ({
      name: varName,
      value: originalX[varName].toFormattedValue(),
      unit: parsed.variables[varName].unit,
    }));

    return {
      status: core.outcome,
      methodUsed: core.methodUsed,
      engineVersion,
      durationMs,
      objectiveValue: report.recalculatedObjective.toFormattedValue(),
      variables,
      constraints: report.constraints,
      economicAnalysisAvailable: report.economicAnalysisAvailable,
      iterations: core.iterations,
      iterationCount: core.iterations.length,
      degeneracyDetected: core.degeneracyDetected,
      blandActivated: core.blandActivated,
      verification: report.verification,
      validationErrors: [],
      userMessageKey: `solver.status.${core.outcome}`,
      internalDiagnostics: core.diagnostics,
    };
  } catch (err) {
    return {
      status: 'failed',
      methodUsed: 'none',
      engineVersion,
      durationMs: Date.now() - startTimeMs,
      objectiveValue: null,
      variables: [],
      constraints: [],
      economicAnalysisAvailable: false,
      iterations: [],
      iterationCount: 0,
      degeneracyDetected: false,
      blandActivated: false,
      verification: null,
      validationErrors: [],
      userMessageKey: 'solver.status.failed',
      internalDiagnostics: [
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      ],
    };
  }
}

export * from './types.js';
export * from './rational.js';
export * from './validator.js';
