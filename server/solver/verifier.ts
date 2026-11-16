import { Rational } from './rational.js';
import type { SimplexCoreOutput } from './simplex.js';
import type { StandardFormProblem } from './transform.js';
import type { ParsedProblem } from './validator.js';
import type { ConstraintEvaluation, SolveVerification } from './types.js';

export interface VerificationReport {
  verification: SolveVerification;
  constraints: ConstraintEvaluation[];
  economicAnalysisAvailable: boolean;
  recalculatedObjective: Rational;
}

export function verifyOptimalSolution(
  parsed: ParsedProblem,
  std: StandardFormProblem,
  core: SimplexCoreOutput,
  originalX: Record<string, Rational>,
  tolerance: number
): VerificationReport {
  let maxConstraintViolation = 0;
  let maxBoundViolation = 0;

  // 1. Check original variable bounds independently
  let boundsSatisfied = true;
  for (const varName of parsed.variableOrder) {
    const val = originalX[varName];
    const numVal = val.toNumber();
    if (!Number.isFinite(numVal)) {
      boundsSatisfied = false;
      maxBoundViolation = Number.POSITIVE_INFINITY;
      break;
    }
    const def = parsed.variables[varName];
    if (def.lower !== null) {
      const diff = def.lower.sub(val).toNumber();
      if (diff > maxBoundViolation) maxBoundViolation = diff;
      if (diff > tolerance) boundsSatisfied = false;
    }
    if (def.upper !== null) {
      const diff = val.sub(def.upper).toNumber();
      if (diff > maxBoundViolation) maxBoundViolation = diff;
      if (diff > tolerance) boundsSatisfied = false;
    }
  }

  // 2. Check all original constraints independently
  let constraintsSatisfied = true;
  const constraintEvaluations: ConstraintEvaluation[] = [];

  for (const con of parsed.constraints) {
    let lhs = Rational.ZERO;
    for (const varName of parsed.variableOrder) {
      const coeff = con.coefficients[varName] ?? Rational.ZERO;
      if (!coeff.isZero()) {
        lhs = lhs.add(coeff.mul(originalX[varName]));
      }
    }

    let violation = 0;
    let slackOrSurplus: Rational;

    if (con.operator === '<=') {
      violation = lhs.sub(con.rhs).toNumber();
      slackOrSurplus = con.rhs.sub(lhs);
    } else if (con.operator === '>=') {
      violation = con.rhs.sub(lhs).toNumber();
      slackOrSurplus = lhs.sub(con.rhs);
    } else {
      violation = Math.abs(lhs.sub(con.rhs).toNumber());
      slackOrSurplus = lhs.sub(con.rhs).abs();
    }

    if (violation > maxConstraintViolation) {
      maxConstraintViolation = violation;
    }
    if (violation > tolerance) {
      constraintsSatisfied = false;
    }

    const isBinding = Math.abs(slackOrSurplus.toNumber()) <= tolerance;

    constraintEvaluations.push({
      name: con.name,
      index: con.index,
      lhs: lhs.toFormattedValue(),
      operator: con.operator,
      rhs: con.rhs.toFormattedValue(),
      slackOrSurplus: slackOrSurplus.toFormattedValue(),
      isBinding,
      shadowPrice: null,
    });
  }

  // 3. Recalculate original objective Z = sum c_j x_j
  let recalculatedObjective = Rational.ZERO;
  for (const varName of parsed.variableOrder) {
    const c = parsed.objective[varName] ?? Rational.ZERO;
    if (!c.isZero()) {
      recalculatedObjective = recalculatedObjective.add(c.mul(originalX[varName]));
    }
  }

  const solverZ = core.objectiveValue ?? Rational.ZERO;
  const objDiff = Math.abs(recalculatedObjective.sub(solverZ).toNumber());
  const objScale = Math.max(1, Math.abs(recalculatedObjective.toNumber()));
  const objectiveConsistent = objDiff <= tolerance * objScale;

  // 4. Verify optimality conditions on final reduced costs (Delta_j <= tolerance)
  let optimalityConditionsMet = true;
  for (const rc of core.reducedCosts) {
    if (rc.toNumber() > tolerance) {
      optimalityConditionsMet = false;
      break;
    }
  }

  // 5. Shadow prices / dual verification (only when cleanly computable and strong duality holds)
  let economicAnalysisAvailable = false;
  let dualityDiscrepancy: number | null = null;

  const canComputeShadowPrices =
    parsed.constraints.length > 0 &&
    parsed.constraints.every((con) => {
      const mapping = std.constraintMappings.find(
        (m) => m.originalConstraintIndex === con.index
      );
      return (
        mapping !== undefined &&
        mapping.slackOrSurplusVarIndex !== undefined &&
        mapping.slackOrSurplusVarIndex < core.reducedCosts.length
      );
    });

  if (canComputeShadowPrices) {
    // For slack s_i (coeff +1 on row): dual variable in max form is y_tilde = -Delta_{s_i} >= 0
    // For surplus e_i (coeff -1 on row): dual variable in max form is y_tilde = +Delta_{e_i} <= 0
    // If constraint was multiplied by -1 (rowFlipSign = -1), multiply by -1
    // If original problem was minimize, multiply by -1 so shadow price is dZ / db_i
    const candidateShadowPrices: Rational[] = [];
    let dualDotRhs = Rational.ZERO;

    for (const con of parsed.constraints) {
      const mapping = std.constraintMappings.find(
        (m) => m.originalConstraintIndex === con.index
      )!;
      const rc = core.reducedCosts[mapping.slackOrSurplusVarIndex!];
      let yMax = mapping.kind === 'slack' ? rc.neg() : rc;
      if (mapping.rowFlipSign === -1) {
        yMax = yMax.neg();
      }
      const shadow = std.senseMultiplier === 1 ? yMax : yMax.neg();
      candidateShadowPrices.push(shadow);
      dualDotRhs = dualDotRhs.add(shadow.mul(con.rhs));
    }

    // Also include contributions from variable shift/bound offsets if any:
    // Strong duality holds iff dualDotRhs matches recalculatedObjective when all bounds are 0
    const allZeroBounds = parsed.variableOrder.every((v) => {
      const d = parsed.variables[v];
      if (d.type === 'non_negative' || d.type === 'non_positive' || d.type === 'free') {
        return true;
      }
      if (d.type === 'lower_bounded') {
        return d.lower !== null && d.lower.isZero();
      }
      if (d.type === 'upper_bounded') {
        return d.upper !== null && d.upper.isZero();
      }
      return false;
    });

    if (allZeroBounds) {
      dualityDiscrepancy = Math.abs(
        dualDotRhs.sub(recalculatedObjective).toNumber()
      );
      if (dualityDiscrepancy <= tolerance * objScale) {
        economicAnalysisAvailable = true;
        candidateShadowPrices.forEach((sp, i) => {
          constraintEvaluations[i].shadowPrice = sp.toFormattedValue();
        });
      }
    }
  }

  const passed =
    boundsSatisfied &&
    constraintsSatisfied &&
    objectiveConsistent &&
    optimalityConditionsMet;

  return {
    verification: {
      passed,
      maxConstraintViolation,
      maxBoundViolation,
      objectiveDiscrepancy: objDiff,
      dualityDiscrepancy,
      checks: {
        constraintsSatisfied,
        boundsSatisfied,
        objectiveConsistent,
        optimalityConditionsMet,
      },
    },
    constraints: constraintEvaluations,
    economicAnalysisAvailable,
    recalculatedObjective,
  };
}
