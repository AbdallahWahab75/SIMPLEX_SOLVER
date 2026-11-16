import { Rational, RationalPrecisionError } from './rational.js';
import type { StandardFormProblem } from './transform.js';
import { reconstructOriginalVariables } from './transform.js';
import type { ParsedProblem } from './validator.js';
import type {
  IterationSnapshot,
  PivotRule,
  SolverLimits,
} from './types.js';

export interface SimplexCoreOutput {
  outcome:
    | 'optimal_unique'
    | 'optimal_multiple'
    | 'infeasible'
    | 'unbounded'
    | 'numerical_instability'
    | 'timed_out'
    | 'cancelled';
  methodUsed: 'primal_simplex' | 'two_phase_simplex';
  internalValues: Rational[];
  objectiveValue: Rational | null;
  reducedCosts: Rational[];
  finalBasis: number[];
  finalMatrix: Rational[][];
  finalRhs: Rational[];
  activeVarNames: string[];
  iterations: IterationSnapshot[];
  degeneracyDetected: boolean;
  blandActivated: boolean;
  diagnostics: string[];
}

export interface SimplexRunOptions {
  limits: SolverLimits;
  signal?: AbortSignal;
  startTimeMs: number;
}

class SolverTimeoutError extends Error {}
class SolverCancelledError extends Error {}

function checkAbortAndTimeout(opts: SimplexRunOptions) {
  if (opts.signal?.aborted) {
    throw new SolverCancelledError('Solve cancelled by caller');
  }
  if (Date.now() - opts.startTimeMs > opts.limits.timeoutMs) {
    throw new SolverTimeoutError(
      `Solve exceeded timeout of ${opts.limits.timeoutMs} ms`
    );
  }
}

interface TableauState {
  varNames: string[];
  /** Number of active columns (excluding RHS) */
  numCols: number;
  /** Basic variable column index per row */
  basis: number[];
  /** Constraint rows: m x numCols */
  rows: Rational[][];
  /** RHS per row: length m */
  rhs: Rational[];
  /** Reduced profits Delta_j = c_j - z_j for each active column */
  objRow: Rational[];
  /** Current objective value */
  objRhs: Rational;
}

function buildSnapshot(
  iterationNumber: number,
  phase: 1 | 2,
  state: TableauState,
  enteringIdx: number | null,
  leavingRow: number | null,
  ruleUsed: PivotRule,
  isDegenerate: boolean
): IterationSnapshot {
  const columnHeaders = [...state.varNames, 'RHS'];
  const basicVariables = state.basis.map((colIdx) => state.varNames[colIdx] ?? '?');

  const rows = state.rows.map((r, rIdx) => [
    ...r.map((cell) => cell.toFormattedValue()),
    state.rhs[rIdx].toFormattedValue(),
  ]);

  const objectiveRow = [
    ...state.objRow.map((c) => c.toFormattedValue()),
    state.objRhs.toFormattedValue(),
  ];

  let pivotElement = null;
  if (enteringIdx !== null && leavingRow !== null) {
    pivotElement = state.rows[leavingRow][enteringIdx].toFormattedValue();
  }

  return {
    iterationNumber,
    phase,
    columnHeaders,
    basicVariables,
    rows,
    objectiveRow,
    enteringVariable: enteringIdx !== null ? state.varNames[enteringIdx] : null,
    leavingVariable:
      leavingRow !== null ? (state.varNames[state.basis[leavingRow]] ?? null) : null,
    pivotRow: leavingRow,
    pivotColumn: enteringIdx,
    pivotElement,
    ruleUsed,
    isDegenerate,
  };
}

function pivotTableau(
  state: TableauState,
  pivotRow: number,
  pivotCol: number
): void {
  const pivotVal = state.rows[pivotRow][pivotCol];
  if (pivotVal.isZero()) {
    throw new Error('Attempted to pivot on zero element');
  }

  // Normalize pivot row
  const newPivotRow = state.rows[pivotRow].map((v) => v.div(pivotVal));
  const newPivotRhs = state.rhs[pivotRow].div(pivotVal);
  state.rows[pivotRow] = newPivotRow;
  state.rhs[pivotRow] = newPivotRhs;

  // Eliminate pivot column from all other constraint rows
  for (let i = 0; i < state.rows.length; i++) {
    if (i === pivotRow) continue;
    const factor = state.rows[i][pivotCol];
    if (factor.isZero()) continue;
    for (let j = 0; j < state.numCols; j++) {
      state.rows[i][j] = state.rows[i][j].sub(factor.mul(newPivotRow[j]));
    }
    state.rhs[i] = state.rhs[i].sub(factor.mul(newPivotRhs));
  }

  // Eliminate pivot column from objective row (Delta_j = c_j - z_j, Z = objRhs)
  const objFactor = state.objRow[pivotCol];
  if (!objFactor.isZero()) {
    for (let j = 0; j < state.numCols; j++) {
      state.objRow[j] = state.objRow[j].sub(objFactor.mul(newPivotRow[j]));
    }
    state.objRhs = state.objRhs.add(objFactor.mul(newPivotRhs));
  }

  // Enforce exact 0 on pivot column in non-pivot rows and 1 in pivot row
  state.basis[pivotRow] = pivotCol;
}

function basisKey(basis: number[]): string {
  return [...basis].sort((a, b) => a - b).join(',');
}

function runSimplexPhase(
  state: TableauState,
  phase: 1 | 2,
  iterations: IterationSnapshot[],
  opts: SimplexRunOptions,
  diagnostics: string[]
): {
  status: 'optimal' | 'unbounded';
  degeneracyDetected: boolean;
  blandActivated: boolean;
} {
  let degeneracyDetected = false;
  let blandActivated = false;
  let consecutiveDegenerate = 0;
  const visitedBases = new Set<string>([basisKey(state.basis)]);

  const maxIterations = Math.max(500, (state.numCols + state.rows.length) * 20);

  for (let step = 0; step < maxIterations; step++) {
    checkAbortAndTimeout(opts);

    // Choose entering variable
    let enteringCol: number | null = null;
    if (blandActivated) {
      // Bland's rule: smallest column index with Delta_j > 0
      for (let j = 0; j < state.numCols; j++) {
        if (state.objRow[j].isPositive()) {
          enteringCol = j;
          break;
        }
      }
    } else {
      // Dantzig's rule: strictly largest Delta_j > 0 (tie-break: smallest index)
      let bestDelta = Rational.ZERO;
      for (let j = 0; j < state.numCols; j++) {
        if (state.objRow[j].cmp(bestDelta) > 0) {
          bestDelta = state.objRow[j];
          enteringCol = j;
        }
      }
    }

    if (enteringCol === null) {
      iterations.push(
        buildSnapshot(
          iterations.length,
          phase,
          state,
          null,
          null,
          'optimal',
          false
        )
      );
      return { status: 'optimal', degeneracyDetected, blandActivated };
    }

    // Choose leaving variable via minimum ratio test
    let leavingRow: number | null = null;
    let minRatio: Rational | null = null;

    for (let i = 0; i < state.rows.length; i++) {
      const aij = state.rows[i][enteringCol];
      if (!aij.isPositive()) continue;
      const ratio = state.rhs[i].div(aij);
      if (minRatio === null) {
        minRatio = ratio;
        leavingRow = i;
      } else {
        const cmp = ratio.cmp(minRatio);
        if (cmp < 0) {
          minRatio = ratio;
          leavingRow = i;
        } else if (cmp === 0 && blandActivated) {
          // Bland's leaving tie-break: smallest basic variable index
          if (state.basis[i] < state.basis[leavingRow!]) {
            leavingRow = i;
          }
        }
      }
    }

    if (leavingRow === null) {
      iterations.push(
        buildSnapshot(
          iterations.length,
          phase,
          state,
          enteringCol,
          null,
          'unbounded',
          false
        )
      );
      return { status: 'unbounded', degeneracyDetected, blandActivated };
    }

    const isDegeneratePivot = minRatio!.isZero();
    if (isDegeneratePivot) {
      degeneracyDetected = true;
      consecutiveDegenerate += 1;
    } else {
      consecutiveDegenerate = 0;
    }

    const ruleForSnapshot: PivotRule = blandActivated ? 'bland' : 'dantzig';

    iterations.push(
      buildSnapshot(
        iterations.length,
        phase,
        state,
        enteringCol,
        leavingRow,
        ruleForSnapshot,
        isDegeneratePivot
      )
    );

    pivotTableau(state, leavingRow, enteringCol);

    const bKey = basisKey(state.basis);
    if (visitedBases.has(bKey) || consecutiveDegenerate >= 2) {
      if (!blandActivated) {
        blandActivated = true;
        diagnostics.push(
          `Phase ${phase}: Bland anti-cycling rule activated at iteration ${iterations.length - 1}`
        );
      }
    } else {
      visitedBases.add(bKey);
    }
  }

  throw new RationalPrecisionError('Maximum simplex iteration limit exceeded');
}

function extractInternalValues(
  basis: number[],
  rhs: Rational[],
  totalVars: number
): Rational[] {
  const vals = new Array<Rational>(totalVars).fill(Rational.ZERO);
  for (let i = 0; i < basis.length; i++) {
    const col = basis[i];
    if (col >= 0 && col < totalVars) {
      vals[col] = vals[col].add(rhs[i]);
    }
  }
  return vals;
}

function detectMultipleOptima(
  parsed: ParsedProblem,
  std: StandardFormProblem,
  state: TableauState,
  currentOriginalX: Record<string, Rational>
): boolean {
  const isBasic = new Set<number>(state.basis);

  for (let j = 0; j < state.numCols; j++) {
    if (isBasic.has(j)) continue;
    if (!state.objRow[j].isZero()) continue;

    // Non-basic variable with Delta_j = 0!
    // Find minimum ratio theta along column j
    let minRatio: Rational | null = null;
    let hasPositiveEntry = false;
    for (let i = 0; i < state.rows.length; i++) {
      const aij = state.rows[i][j];
      if (aij.isPositive()) {
        hasPositiveEntry = true;
        const r = state.rhs[i].div(aij);
        if (minRatio === null || r.cmp(minRatio) < 0) {
          minRatio = r;
        }
      }
    }

    const stepSize = hasPositiveEntry ? minRatio! : Rational.ONE;
    if (stepSize.isZero()) {
      // Degenerate zero-step pivot doesn't move point in R^n; skip unless a non-degenerate direction exists
      continue;
    }

    // Construct candidate internal point x_internal + stepSize * direction_j
    const candidateInternal = extractInternalValues(
      state.basis,
      state.rhs,
      std.variables.length
    );
    candidateInternal[j] = candidateInternal[j].add(stepSize);
    for (let i = 0; i < state.basis.length; i++) {
      const bCol = state.basis[i];
      candidateInternal[bCol] = candidateInternal[bCol].sub(
        stepSize.mul(state.rows[i][j])
      );
    }

    const candidateOriginalX = reconstructOriginalVariables(
      parsed,
      std,
      candidateInternal
    );

    const isDistinct = parsed.variableOrder.some(
      (v) => !candidateOriginalX[v].equals(currentOriginalX[v])
    );
    if (isDistinct) {
      return true;
    }
  }

  return false;
}

export function solveStandardForm(
  parsed: ParsedProblem,
  std: StandardFormProblem,
  opts: SimplexRunOptions
): SimplexCoreOutput {
  const diagnostics: string[] = [];
  const iterations: IterationSnapshot[] = [];
  const methodUsed: 'primal_simplex' | 'two_phase_simplex' = std.requiresTwoPhase
    ? 'two_phase_simplex'
    : 'primal_simplex';

  if (std.immediatelyInfeasible) {
    if (std.infeasibleReason) diagnostics.push(std.infeasibleReason);
    return {
      outcome: 'infeasible',
      methodUsed,
      internalValues: [],
      objectiveValue: null,
      reducedCosts: [],
      finalBasis: [],
      finalMatrix: [],
      finalRhs: [],
      activeVarNames: [],
      iterations: [],
      degeneracyDetected: false,
      blandActivated: false,
      diagnostics,
    };
  }

  // Handle degenerate 0-constraint LP (check if unbounded or trivial constant)
  if (std.aMatrix.length === 0) {
    const freeOrUnbounded = std.variables.some((v) => v.objectiveCoeff.isPositive());
    if (freeOrUnbounded) {
      return {
        outcome: 'unbounded',
        methodUsed: 'primal_simplex',
        internalValues: [],
        objectiveValue: null,
        reducedCosts: std.variables.map((v) => v.objectiveCoeff),
        finalBasis: [],
        finalMatrix: [],
        finalRhs: [],
        activeVarNames: std.variables.map((v) => v.name),
        iterations: [],
        degeneracyDetected: false,
        blandActivated: false,
        diagnostics: ['No active constraints and positive objective coefficient'],
      };
    }
    const vals = new Array<Rational>(std.variables.length).fill(Rational.ZERO);
    const zVal =
      std.senseMultiplier === 1 ? std.objectiveOffset : std.objectiveOffset.neg();
    return {
      outcome: 'optimal_unique',
      methodUsed: 'primal_simplex',
      internalValues: vals,
      objectiveValue: zVal,
      reducedCosts: std.variables.map((v) => v.objectiveCoeff),
      finalBasis: [],
      finalMatrix: [],
      finalRhs: [],
      activeVarNames: std.variables.map((v) => v.name),
      iterations: [],
      degeneracyDetected: false,
      blandActivated: false,
      diagnostics,
    };
  }

  try {
    let degeneracyDetected = false;
    let blandActivated = false;
    let state: TableauState;

    if (std.requiresTwoPhase) {
      const totalCols = std.variables.length;
      const artificialSet = new Set<number>(std.artificialIndices);
      const rows = std.aMatrix.map((r) => [...r]);
      const rhs = [...std.bVector];
      const basis = [...std.initialBasis];

      // Phase 1 objective: Maximize W = - sum(artificials)
      // Delta_j = c_j^(1) - z_j^(1)
      const phase1ObjRow = new Array<Rational>(totalCols).fill(Rational.ZERO);
      let phase1ObjRhs = Rational.ZERO;

      for (let i = 0; i < rows.length; i++) {
        if (artificialSet.has(basis[i])) {
          phase1ObjRhs = phase1ObjRhs.sub(rhs[i]);
          for (let j = 0; j < totalCols; j++) {
            phase1ObjRow[j] = phase1ObjRow[j].add(rows[i][j]);
          }
        }
      }
      // Artificial columns have c_a = -1 and z_a = -1, so Delta_a = 0
      for (const aIdx of std.artificialIndices) {
        phase1ObjRow[aIdx] = Rational.ZERO;
      }

      state = {
        varNames: std.variables.map((v) => v.name),
        numCols: totalCols,
        basis,
        rows,
        rhs,
        objRow: phase1ObjRow,
        objRhs: phase1ObjRhs,
      };

      const phase1Res = runSimplexPhase(state, 1, iterations, opts, diagnostics);
      degeneracyDetected = degeneracyDetected || phase1Res.degeneracyDetected;
      blandActivated = blandActivated || phase1Res.blandActivated;

      if (state.objRhs.isNegative()) {
        // Mark last snapshot as infeasible
        if (iterations.length > 0) {
          iterations[iterations.length - 1].ruleUsed = 'infeasible';
        }
        diagnostics.push(
          `Phase 1 optimal W = ${state.objRhs.toFractionString()} < 0 (infeasible)`
        );
        return {
          outcome: 'infeasible',
          methodUsed,
          internalValues: [],
          objectiveValue: null,
          reducedCosts: [],
          finalBasis: state.basis,
          finalMatrix: state.rows,
          finalRhs: state.rhs,
          activeVarNames: state.varNames,
          iterations,
          degeneracyDetected,
          blandActivated,
          diagnostics,
        };
      }

      // Drive any remaining zero-valued artificial variables out of the basis
      const nonArtificialCols = std.variables
        .map((v, idx) => ({ v, idx }))
        .filter((item) => !artificialSet.has(item.idx))
        .map((item) => item.idx);

      const rowsToDrop = new Set<number>();
      for (let r = 0; r < state.basis.length; r++) {
        if (!artificialSet.has(state.basis[r])) continue;
        // Find non-artificial pivot candidate in row r
        const pivotCandidate = nonArtificialCols.find(
          (col) => !state.rows[r][col].isZero()
        );
        if (pivotCandidate !== undefined) {
          pivotTableau(state, r, pivotCandidate);
        } else {
          // Entire non-artificial row is 0 and rhs[r] is 0 -> redundant constraint
          rowsToDrop.add(r);
        }
      }

      // Transition to Phase 2: remove artificial columns and any redundant rows
      const firstArtificialIdx = Math.min(...std.artificialIndices);
      const keepRows: Rational[][] = [];
      const keepRhs: Rational[] = [];
      const keepBasis: number[] = [];

      for (let r = 0; r < state.rows.length; r++) {
        if (rowsToDrop.has(r)) continue;
        keepRows.push(state.rows[r].slice(0, firstArtificialIdx));
        keepRhs.push(state.rhs[r]);
        keepBasis.push(state.basis[r]);
      }

      const phase2Cols = firstArtificialIdx;
      const phase2ObjRow = new Array<Rational>(phase2Cols).fill(Rational.ZERO);
      let phase2ObjRhs = std.objectiveOffset;

      // Compute Delta_j = c_j - sum_i c_{B_i} * T_{i,j}
      for (let j = 0; j < phase2Cols; j++) {
        let zj = Rational.ZERO;
        for (let i = 0; i < keepRows.length; i++) {
          const cBi = std.variables[keepBasis[i]].objectiveCoeff;
          if (!cBi.isZero()) {
            zj = zj.add(cBi.mul(keepRows[i][j]));
          }
        }
        phase2ObjRow[j] = std.variables[j].objectiveCoeff.sub(zj);
      }
      for (let i = 0; i < keepRows.length; i++) {
        const cBi = std.variables[keepBasis[i]].objectiveCoeff;
        if (!cBi.isZero()) {
          phase2ObjRhs = phase2ObjRhs.add(cBi.mul(keepRhs[i]));
        }
      }

      state = {
        varNames: std.variables.slice(0, phase2Cols).map((v) => v.name),
        numCols: phase2Cols,
        basis: keepBasis,
        rows: keepRows,
        rhs: keepRhs,
        objRow: phase2ObjRow,
        objRhs: phase2ObjRhs,
      };
    } else {
      // Direct Primal Simplex (1 phase)
      const totalCols = std.variables.length;
      const rows = std.aMatrix.map((r) => [...r]);
      const rhs = [...std.bVector];
      const basis = [...std.initialBasis];
      const objRow = std.variables.map((v) => v.objectiveCoeff);
      const objRhs = std.objectiveOffset;

      state = {
        varNames: std.variables.map((v) => v.name),
        numCols: totalCols,
        basis,
        rows,
        rhs,
        objRow,
        objRhs,
      };
    }

    const phase2Res = runSimplexPhase(state, 2, iterations, opts, diagnostics);
    degeneracyDetected = degeneracyDetected || phase2Res.degeneracyDetected;
    blandActivated = blandActivated || phase2Res.blandActivated;

    if (phase2Res.status === 'unbounded') {
      return {
        outcome: 'unbounded',
        methodUsed,
        internalValues: [],
        objectiveValue: null,
        reducedCosts: state.objRow,
        finalBasis: state.basis,
        finalMatrix: state.rows,
        finalRhs: state.rhs,
        activeVarNames: state.varNames,
        iterations,
        degeneracyDetected,
        blandActivated,
        diagnostics,
      };
    }

    const internalValues = extractInternalValues(
      state.basis,
      state.rhs,
      std.variables.length
    );
    const originalX = reconstructOriginalVariables(parsed, std, internalValues);
    const hasMultiple = detectMultipleOptima(parsed, std, state, originalX);

    const reportedZ =
      std.senseMultiplier === 1 ? state.objRhs : state.objRhs.neg();

    return {
      outcome: hasMultiple ? 'optimal_multiple' : 'optimal_unique',
      methodUsed,
      internalValues,
      objectiveValue: reportedZ,
      reducedCosts: state.objRow,
      finalBasis: state.basis,
      finalMatrix: state.rows,
      finalRhs: state.rhs,
      activeVarNames: state.varNames,
      iterations,
      degeneracyDetected,
      blandActivated,
      diagnostics,
    };
  } catch (err) {
    if (err instanceof SolverTimeoutError) {
      diagnostics.push(err.message);
      return {
        outcome: 'timed_out',
        methodUsed,
        internalValues: [],
        objectiveValue: null,
        reducedCosts: [],
        finalBasis: [],
        finalMatrix: [],
        finalRhs: [],
        activeVarNames: [],
        iterations,
        degeneracyDetected: false,
        blandActivated: false,
        diagnostics,
      };
    }
    if (err instanceof SolverCancelledError) {
      diagnostics.push(err.message);
      return {
        outcome: 'cancelled',
        methodUsed,
        internalValues: [],
        objectiveValue: null,
        reducedCosts: [],
        finalBasis: [],
        finalMatrix: [],
        finalRhs: [],
        activeVarNames: [],
        iterations,
        degeneracyDetected: false,
        blandActivated: false,
        diagnostics,
      };
    }
    if (err instanceof RationalPrecisionError) {
      diagnostics.push(err.message);
      return {
        outcome: 'numerical_instability',
        methodUsed,
        internalValues: [],
        objectiveValue: null,
        reducedCosts: [],
        finalBasis: [],
        finalMatrix: [],
        finalRhs: [],
        activeVarNames: [],
        iterations,
        degeneracyDetected: false,
        blandActivated: false,
        diagnostics,
      };
    }
    throw err;
  }
}
