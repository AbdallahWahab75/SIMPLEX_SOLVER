import { Rational } from './rational.js';
import type { ParsedProblem } from './validator.js';
import type { ConstraintOperator } from './types.js';

export type InternalVarRole = 'decision' | 'slack' | 'surplus' | 'artificial';

export interface InternalVariable {
  index: number;
  name: string;
  role: InternalVarRole;
  objectiveCoeff: Rational;
  originalVar?: string;
}

export interface VariableMapping {
  originalVar: string;
  kind: 'fixed' | 'shifted' | 'reflected_shifted' | 'split';
  constant: Rational;
  posVarIndex?: number;
  negVarIndex?: number;
  sign: 1 | -1;
}

export interface ConstraintRowMapping {
  originalConstraintIndex: number;
  /** Sign multiplier (+1 if untouched, -1 if row was multiplied by -1 to make RHS >= 0) */
  rowFlipSign: 1 | -1;
  /** Index of slack (+1), surplus (-1), or artificial (+1) column associated with this constraint */
  kind: 'slack' | 'surplus_artificial' | 'artificial';
  slackOrSurplusVarIndex?: number;
  artificialVarIndex?: number;
}

export interface StandardFormProblem {
  senseMultiplier: 1 | -1; // +1 for maximize, -1 for minimize
  objectiveOffset: Rational; // constant part in maximized internal objective
  variables: InternalVariable[];
  variableMappings: Record<string, VariableMapping>;
  constraintMappings: ConstraintRowMapping[];
  aMatrix: Rational[][];
  bVector: Rational[];
  initialBasis: number[];
  artificialIndices: number[];
  requiresTwoPhase: boolean;
  /** True if a trivial 0-variable or fixed-variable constraint is already violated before pivoting */
  immediatelyInfeasible: boolean;
  infeasibleReason?: string;
}

function flipOperator(op: ConstraintOperator): ConstraintOperator {
  if (op === '<=') return '>=';
  if (op === '>=') return '<=';
  return '=';
}

export function toStandardForm(parsed: ParsedProblem): StandardFormProblem {
  const senseMultiplier: 1 | -1 = parsed.sense === 'maximize' ? 1 : -1;
  const internalVars: InternalVariable[] = [];
  const variableMappings: Record<string, VariableMapping> = {};

  let objectiveOffset = Rational.ZERO;

  interface BoundRow {
    name: string;
    varIndex: number;
    upperDelta: Rational;
  }
  const extraBoundRows: BoundRow[] = [];

  // 1. Transform decision variables into non-negative variables >= 0
  for (const varName of parsed.variableOrder) {
    const def = parsed.variables[varName];
    const origObj = parsed.objective[varName] ?? Rational.ZERO;
    const maxObjCoeff =
      senseMultiplier === 1 ? origObj : origObj.neg();

    if (def.type === 'non_negative') {
      const idx = internalVars.length;
      internalVars.push({
        index: idx,
        name: varName,
        role: 'decision',
        objectiveCoeff: maxObjCoeff,
        originalVar: varName,
      });
      variableMappings[varName] = {
        originalVar: varName,
        kind: 'shifted',
        constant: Rational.ZERO,
        posVarIndex: idx,
        sign: 1,
      };
    } else if (def.type === 'lower_bounded') {
      const lower = def.lower!;
      const idx = internalVars.length;
      const internalName = lower.isZero() ? varName : `${varName}_shift`;
      internalVars.push({
        index: idx,
        name: internalName,
        role: 'decision',
        objectiveCoeff: maxObjCoeff,
        originalVar: varName,
      });
      objectiveOffset = objectiveOffset.add(maxObjCoeff.mul(lower));
      variableMappings[varName] = {
        originalVar: varName,
        kind: 'shifted',
        constant: lower,
        posVarIndex: idx,
        sign: 1,
      };
    } else if (def.type === 'non_positive' || def.type === 'upper_bounded') {
      const upper = def.upper ?? Rational.ZERO;
      const idx = internalVars.length;
      const internalName = upper.isZero() ? `${varName}_neg` : `${varName}_rshift`;
      internalVars.push({
        index: idx,
        name: internalName,
        role: 'decision',
        objectiveCoeff: maxObjCoeff.neg(),
        originalVar: varName,
      });
      objectiveOffset = objectiveOffset.add(maxObjCoeff.mul(upper));
      variableMappings[varName] = {
        originalVar: varName,
        kind: 'reflected_shifted',
        constant: upper,
        posVarIndex: idx,
        sign: -1,
      };
    } else if (def.type === 'bounded') {
      const lower = def.lower!;
      const upper = def.upper!;
      if (lower.equals(upper)) {
        // Fixed variable x = lower
        objectiveOffset = objectiveOffset.add(maxObjCoeff.mul(lower));
        variableMappings[varName] = {
          originalVar: varName,
          kind: 'fixed',
          constant: lower,
          sign: 1,
        };
      } else {
        const idx = internalVars.length;
        const internalName = lower.isZero() ? varName : `${varName}_shift`;
        internalVars.push({
          index: idx,
          name: internalName,
          role: 'decision',
          objectiveCoeff: maxObjCoeff,
          originalVar: varName,
        });
        objectiveOffset = objectiveOffset.add(maxObjCoeff.mul(lower));
        variableMappings[varName] = {
          originalVar: varName,
          kind: 'shifted',
          constant: lower,
          posVarIndex: idx,
          sign: 1,
        };
        extraBoundRows.push({
          name: `${varName}_ub`,
          varIndex: idx,
          upperDelta: upper.sub(lower),
        });
      }
    } else {
      // free variable: x = x+ - x-
      const posIdx = internalVars.length;
      internalVars.push({
        index: posIdx,
        name: `${varName}+`,
        role: 'decision',
        objectiveCoeff: maxObjCoeff,
        originalVar: varName,
      });
      const negIdx = internalVars.length;
      internalVars.push({
        index: negIdx,
        name: `${varName}-`,
        role: 'decision',
        objectiveCoeff: maxObjCoeff.neg(),
        originalVar: varName,
      });
      variableMappings[varName] = {
        originalVar: varName,
        kind: 'split',
        constant: Rational.ZERO,
        posVarIndex: posIdx,
        negVarIndex: negIdx,
        sign: 1,
      };
    }
  }

  const decisionVarCount = internalVars.length;

  interface TempRow {
    rowCoeffs: Rational[];
    rhs: Rational;
    operator: ConstraintOperator;
    originalConstraintIndex: number | null;
    rowFlipSign: 1 | -1;
    label: string;
  }

  const tempRows: TempRow[] = [];
  let immediatelyInfeasible = false;
  let infeasibleReason: string | undefined;

  // 2. Transform original constraints using variable mappings
  for (const con of parsed.constraints) {
    const rowCoeffs = new Array<Rational>(decisionVarCount).fill(Rational.ZERO);
    let rhs = con.rhs;

    for (const varName of parsed.variableOrder) {
      const aij = con.coefficients[varName] ?? Rational.ZERO;
      if (aij.isZero()) continue;
      const mapping = variableMappings[varName];

      if (mapping.kind === 'fixed') {
        rhs = rhs.sub(aij.mul(mapping.constant));
      } else if (mapping.kind === 'shifted') {
        if (!mapping.constant.isZero()) {
          rhs = rhs.sub(aij.mul(mapping.constant));
        }
        rowCoeffs[mapping.posVarIndex!] = rowCoeffs[mapping.posVarIndex!].add(aij);
      } else if (mapping.kind === 'reflected_shifted') {
        if (!mapping.constant.isZero()) {
          rhs = rhs.sub(aij.mul(mapping.constant));
        }
        rowCoeffs[mapping.posVarIndex!] = rowCoeffs[mapping.posVarIndex!].sub(aij);
      } else {
        // split
        rowCoeffs[mapping.posVarIndex!] = rowCoeffs[mapping.posVarIndex!].add(aij);
        rowCoeffs[mapping.negVarIndex!] = rowCoeffs[mapping.negVarIndex!].sub(aij);
      }
    }

    // Check if all coefficients in this row are zero (e.g., all variables fixed or zero coeffs)
    const allZero = rowCoeffs.every((c) => c.isZero());
    if (allZero) {
      let satisfied = true;
      if (con.operator === '<=') satisfied = rhs.cmp(Rational.ZERO) >= 0;
      else if (con.operator === '>=') satisfied = rhs.cmp(Rational.ZERO) <= 0;
      else satisfied = rhs.isZero();

      if (!satisfied) {
        immediatelyInfeasible = true;
        infeasibleReason = `Constraint "${con.name}" reduces to 0 ${con.operator} ${rhs.toFractionString()}`;
      }
      // Redundant 0 <= >= = row does not enter simplex basis, or we still track it
      // Keep non-trivial constraints only in simplex tableau; constraintMappings won't have it, verifier still checks original constraints!
      continue;
    }

    let op = con.operator;
    let flipSign: 1 | -1 = 1;
    if (rhs.isNegative()) {
      rhs = rhs.neg();
      for (let j = 0; j < rowCoeffs.length; j++) {
        rowCoeffs[j] = rowCoeffs[j].neg();
      }
      op = flipOperator(op);
      flipSign = -1;
    }

    tempRows.push({
      rowCoeffs,
      rhs,
      operator: op,
      originalConstraintIndex: con.index,
      rowFlipSign: flipSign,
      label: con.name,
    });
  }

  // 3. Add upper-bound constraints v_j <= upper - lower for bounded variables
  for (const bRow of extraBoundRows) {
    const rowCoeffs = new Array<Rational>(decisionVarCount).fill(Rational.ZERO);
    rowCoeffs[bRow.varIndex] = Rational.ONE;
    tempRows.push({
      rowCoeffs,
      rhs: bRow.upperDelta,
      operator: '<=',
      originalConstraintIndex: null,
      rowFlipSign: 1,
      label: bRow.name,
    });
  }

  // 4. Add slack / surplus / artificial variables (artificials ordered last for clean Phase 2 drop)
  const slackCols: { rowIdx: number; varIndex: number; coeff: Rational }[] = [];
  const artificialCols: { rowIdx: number; varIndex: number }[] = [];
  const initialBasis = new Array<number>(tempRows.length).fill(-1);
  const constraintMappings: ConstraintRowMapping[] = [];

  tempRows.forEach((row, rIdx) => {
    if (row.operator === '<=') {
      const sIdx = internalVars.length;
      internalVars.push({
        index: sIdx,
        name: `s${rIdx + 1}`,
        role: 'slack',
        objectiveCoeff: Rational.ZERO,
      });
      slackCols.push({ rowIdx: rIdx, varIndex: sIdx, coeff: Rational.ONE });
      initialBasis[rIdx] = sIdx;
      if (row.originalConstraintIndex !== null) {
        constraintMappings.push({
          originalConstraintIndex: row.originalConstraintIndex,
          rowFlipSign: row.rowFlipSign,
          kind: 'slack',
          slackOrSurplusVarIndex: sIdx,
        });
      }
    } else if (row.operator === '>=') {
      const eIdx = internalVars.length;
      internalVars.push({
        index: eIdx,
        name: `e${rIdx + 1}`,
        role: 'surplus',
        objectiveCoeff: Rational.ZERO,
      });
      slackCols.push({ rowIdx: rIdx, varIndex: eIdx, coeff: Rational.NEG_ONE });

      // Artificial variable deferred to second pass so all artificials sit at the end
      artificialCols.push({ rowIdx: rIdx, varIndex: -1 });
      if (row.originalConstraintIndex !== null) {
        constraintMappings.push({
          originalConstraintIndex: row.originalConstraintIndex,
          rowFlipSign: row.rowFlipSign,
          kind: 'surplus_artificial',
          slackOrSurplusVarIndex: eIdx,
        });
      }
    } else {
      // '='
      artificialCols.push({ rowIdx: rIdx, varIndex: -1 });
      if (row.originalConstraintIndex !== null) {
        constraintMappings.push({
          originalConstraintIndex: row.originalConstraintIndex,
          rowFlipSign: row.rowFlipSign,
          kind: 'artificial',
        });
      }
    }
  });

  const artificialIndices: number[] = [];
  for (let i = 0; i < artificialCols.length; i++) {
    const entry = artificialCols[i];
    const aIdx = internalVars.length;
    internalVars.push({
      index: aIdx,
      name: `a${i + 1}`,
      role: 'artificial',
      objectiveCoeff: Rational.ZERO,
    });
    entry.varIndex = aIdx;
    initialBasis[entry.rowIdx] = aIdx;
    artificialIndices.push(aIdx);

    const rowOriginalIdx = tempRows[entry.rowIdx].originalConstraintIndex;
    if (rowOriginalIdx !== null) {
      const cm = constraintMappings.find(
        (m) => m.originalConstraintIndex === rowOriginalIdx
      );
      if (cm) cm.artificialVarIndex = aIdx;
    }
  }

  const totalCols = internalVars.length;
  const aMatrix: Rational[][] = tempRows.map((row) => {
    const fullRow = new Array<Rational>(totalCols).fill(Rational.ZERO);
    for (let j = 0; j < decisionVarCount; j++) {
      fullRow[j] = row.rowCoeffs[j];
    }
    return fullRow;
  });

  for (const sc of slackCols) {
    aMatrix[sc.rowIdx][sc.varIndex] = sc.coeff;
  }
  for (const ac of artificialCols) {
    aMatrix[ac.rowIdx][ac.varIndex] = Rational.ONE;
  }

  const bVector = tempRows.map((r) => r.rhs);

  return {
    senseMultiplier,
    objectiveOffset,
    variables: internalVars,
    variableMappings,
    constraintMappings,
    aMatrix,
    bVector,
    initialBasis,
    artificialIndices,
    requiresTwoPhase: artificialIndices.length > 0,
    immediatelyInfeasible,
    infeasibleReason,
  };
}

export function reconstructOriginalVariables(
  parsed: ParsedProblem,
  std: StandardFormProblem,
  internalValues: Rational[]
): Record<string, Rational> {
  const result: Record<string, Rational> = {};
  for (const varName of parsed.variableOrder) {
    const mapping = std.variableMappings[varName];
    if (mapping.kind === 'fixed') {
      result[varName] = mapping.constant;
    } else if (mapping.kind === 'shifted') {
      const v = internalValues[mapping.posVarIndex!] ?? Rational.ZERO;
      result[varName] = mapping.constant.add(v);
    } else if (mapping.kind === 'reflected_shifted') {
      const v = internalValues[mapping.posVarIndex!] ?? Rational.ZERO;
      result[varName] = mapping.constant.sub(v);
    } else {
      const vPos = internalValues[mapping.posVarIndex!] ?? Rational.ZERO;
      const vNeg = internalValues[mapping.negVarIndex!] ?? Rational.ZERO;
      result[varName] = vPos.sub(vNeg);
    }
  }
  return result;
}
