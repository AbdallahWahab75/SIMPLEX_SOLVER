import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solveLinearProgram,
  Rational,
  type ProblemModel,
} from '../server/solver/index.js';

function getVar(result: ReturnType<typeof solveLinearProgram>, name: string): number {
  const found = result.variables.find((v) => v.name === name);
  assert.ok(found, `Expected variable ${name} in result`);
  return found.value.decimal;
}

test('1. Maximisation avec contraintes <= (exemple de référence Section 8)', () => {
  const model: ProblemModel = {
    name: 'Production',
    sense: 'maximize',
    objective: { x1: 40, x2: 30 },
    variables: {
      x1: { type: 'lower_bounded', lower: 0 },
      x2: { type: 'lower_bounded', lower: 0 },
    },
    constraints: [
      { name: 'Ressource A', coefficients: { x1: 2, x2: 1 }, operator: '<=', rhs: 100 },
      { name: 'Ressource B', coefficients: { x1: 1, x2: 2 }, operator: '<=', rhs: 80 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(res.methodUsed, 'primal_simplex');
  assert.equal(res.objectiveValue?.fraction, '2200');
  assert.equal(getVar(res, 'x1'), 40);
  assert.equal(getVar(res, 'x2'), 20);
  assert.equal(res.verification?.passed, true);
  assert.equal(res.economicAnalysisAvailable, true);
  assert.equal(res.constraints[0].isBinding, true);
  assert.equal(res.constraints[1].isBinding, true);
  assert.equal(res.constraints[0].shadowPrice?.fraction, '50/3');
  assert.equal(res.constraints[1].shadowPrice?.fraction, '20/3');
  assert.ok(res.iterations.length >= 3);
});

test('2. Minimisation avec contraintes >= (méthode en deux phases)', () => {
  // Min Z = 3x1 + 2x2 s.t. x1 + x2 >= 4, 2x1 + x2 >= 6, x1, x2 >= 0
  // Optimum at x1 = 2, x2 = 2, Z = 10
  const model: ProblemModel = {
    name: 'Diète minimale',
    sense: 'minimize',
    objective: { x1: 3, x2: 2 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'C1', coefficients: { x1: 1, x2: 1 }, operator: '>=', rhs: 4 },
      { name: 'C2', coefficients: { x1: 2, x2: 1 }, operator: '>=', rhs: 6 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(res.methodUsed, 'two_phase_simplex');
  assert.equal(res.objectiveValue?.fraction, '10');
  assert.equal(getVar(res, 'x1'), 2);
  assert.equal(getVar(res, 'x2'), 2);
  assert.equal(res.verification?.passed, true);
});

test('3. Contraintes >= et <= combinées (deux phases)', () => {
  const model: ProblemModel = {
    name: 'Mixte',
    sense: 'maximize',
    objective: { x1: 5, x2: 4 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'Cap', coefficients: { x1: 1, x2: 1 }, operator: '<=', rhs: 10 },
      { name: 'MinX1', coefficients: { x1: 1 }, operator: '>=', rhs: 3 },
      { name: 'MinX2', coefficients: { x2: 1 }, operator: '>=', rhs: 2 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(res.methodUsed, 'two_phase_simplex');
  assert.equal(getVar(res, 'x1'), 8);
  assert.equal(getVar(res, 'x2'), 2);
  assert.equal(res.objectiveValue?.fraction, '48');
  assert.equal(res.verification?.passed, true);
});

test('4. Contraintes d\'égalité (=) et RHS négatif', () => {
  // Max 2x1 + 3x2 s.t. x1 + x2 = 6, -x1 + 2x2 <= -2 (i.e. x1 - 2x2 >= 2), x1,x2 >= 0
  // Wait: x1 + x2 = 6 and x1 - 2x2 >= 2 -> x1 = 6 - x2 -> 6 - 3x2 >= 2 -> x2 <= 4/3
  // Max 2(6 - x2) + 3x2 = 12 + x2 -> max at x2 = 4/3, x1 = 14/3, Z = 40/3
  const model: ProblemModel = {
    name: 'Égalité et RHS négatif',
    sense: 'maximize',
    objective: { x1: 2, x2: 3 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'Somme', coefficients: { x1: 1, x2: 1 }, operator: '=', rhs: 6 },
      { name: 'NegRhs', coefficients: { x1: -1, x2: 2 }, operator: '<=', rhs: -2 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(res.methodUsed, 'two_phase_simplex');
  assert.equal(res.objectiveValue?.fraction, '40/3');
  assert.equal(res.variables.find((v) => v.name === 'x1')?.value.fraction, '14/3');
  assert.equal(res.variables.find((v) => v.name === 'x2')?.value.fraction, '4/3');
  assert.equal(res.verification?.passed, true);
});

test('5. Variable libre prenant une valeur négative à l\'optimum', () => {
  // Max -x1 + 4x2 s.t. x1 + x2 = 2, x1 >= -5 (represented via x1 free and -x1 <= 5), x2 >= 0
  // Wait: x1 free, x2 >= 0, x1 + x2 = 2, x1 >= -5 -> x2 = 2 - x1; obj = -x1 + 4(2 - x1) = 8 - 5x1
  // Max at x1 = -5, x2 = 7, Z = 33
  const model: ProblemModel = {
    name: 'Variable libre',
    sense: 'maximize',
    objective: { x1: -1, x2: 4 },
    variables: {
      x1: { type: 'free' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'Eq', coefficients: { x1: 1, x2: 1 }, operator: '=', rhs: 2 },
      { name: 'MinX1', coefficients: { x1: 1 }, operator: '>=', rhs: -5 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(getVar(res, 'x1'), -5);
  assert.equal(getVar(res, 'x2'), 7);
  assert.equal(res.objectiveValue?.fraction, '33');
  assert.equal(res.verification?.passed, true);
});

test('6. Variable non positive (x <= 0)', () => {
  // Min 2x1 + 3x2 s.t. x1 <= 0, x2 >= 0, x1 + x2 >= 1, x1 >= -4
  // x1 = -4, x2 = 5 => Z = -8 + 15 = 7? Wait: Min 2x1 + 3x2 -> wants x1 small (-4) and x2 small (1 - x1 = 5):
  // Let's check: x1 = 0, x2 = 1 gives Z = 3 < 7! Because x2 = max(0, 1 - x1), obj = 2x1 + 3(1 - x1) = 3 - x1.
  // Since x1 <= 0, -x1 >= 0, so minimum is at x1 = 0, x2 = 1, Z = 3!
  const model: ProblemModel = {
    name: 'Non positive',
    sense: 'minimize',
    objective: { x1: 2, x2: 3 },
    variables: {
      x1: { type: 'non_positive' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'C1', coefficients: { x1: 1, x2: 1 }, operator: '>=', rhs: 1 },
      { name: 'C2', coefficients: { x1: 1 }, operator: '>=', rhs: -4 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(getVar(res, 'x1'), 0);
  assert.equal(getVar(res, 'x2'), 1);
  assert.equal(res.objectiveValue?.fraction, '3');
  assert.equal(res.verification?.passed, true);
});

test('7. Bornes inférieure, supérieure et intervalle [l, u]', () => {
  // Max 5x1 + 3x2 - 2x3 s.t. x1 + x2 + x3 <= 12
  // x1 in [2, 6], x2 <= 5 (upper_bounded, let's also add x2 >= 1), x3 in [-3, 1]
  // Wants x1=6, x2=5, x3=-3 => sum = 8 <= 12 => Z = 30 + 15 + 6 = 51
  const model: ProblemModel = {
    name: 'Variables bornées',
    sense: 'maximize',
    objective: { x1: 5, x2: 3, x3: -2 },
    variables: {
      x1: { type: 'bounded', lower: 2, upper: 6 },
      x2: { type: 'upper_bounded', upper: 5 },
      x3: { type: 'bounded', lower: -3, upper: 1 },
    },
    constraints: [
      { name: 'Somme', coefficients: { x1: 1, x2: 1, x3: 1 }, operator: '<=', rhs: 12 },
      { name: 'MinX2', coefficients: { x2: 1 }, operator: '>=', rhs: 1 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(getVar(res, 'x1'), 6);
  assert.equal(getVar(res, 'x2'), 5);
  assert.equal(getVar(res, 'x3'), -3);
  assert.equal(res.objectiveValue?.fraction, '51');
  assert.equal(res.verification?.passed, true);
});

test('8. Phase 1 avec contrainte redondante (artificielle nulle en base)', () => {
  // x1 + x2 = 4 and 2x1 + 2x2 = 8 (redundant!), Max 3x1 + x2 => x1 = 4, x2 = 0, Z = 12
  const model: ProblemModel = {
    name: 'Redondance Phase 1',
    sense: 'maximize',
    objective: { x1: 3, x2: 1 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'E1', coefficients: { x1: 1, x2: 1 }, operator: '=', rhs: 4 },
      { name: 'E2', coefficients: { x1: 2, x2: 2 }, operator: '=', rhs: 8 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(res.methodUsed, 'two_phase_simplex');
  assert.equal(getVar(res, 'x1'), 4);
  assert.equal(getVar(res, 'x2'), 0);
  assert.equal(res.objectiveValue?.fraction, '12');
  assert.equal(res.verification?.passed, true);
});

test('9. Problème infaisable', () => {
  const model: ProblemModel = {
    name: 'Infaisable',
    sense: 'maximize',
    objective: { x1: 1, x2: 1 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'Max', coefficients: { x1: 1, x2: 1 }, operator: '<=', rhs: 3 },
      { name: 'Min', coefficients: { x1: 1, x2: 1 }, operator: '>=', rhs: 5 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'infeasible');
  assert.equal(res.objectiveValue, null);
  assert.equal(res.variables.length, 0);
});

test('10. Problème non borné', () => {
  const model: ProblemModel = {
    name: 'Non borné',
    sense: 'maximize',
    objective: { x1: 2, x2: 1 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'Diff', coefficients: { x1: 1, x2: -1 }, operator: '<=', rhs: 4 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'unbounded');
  assert.equal(res.objectiveValue, null);
  assert.equal(res.variables.length, 0);
});

test('11. Optimum multiple', () => {
  // Max 4x1 + 2x2 s.t. 2x1 + x2 <= 10, x1 <= 4, x2 <= 6
  // Objective is parallel to 2x1 + x2 <= 10! Multiple optima along segment (4,2) to (2,6), Z = 20
  const model: ProblemModel = {
    name: 'Optimum multiple',
    sense: 'maximize',
    objective: { x1: 4, x2: 2 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'Pente', coefficients: { x1: 2, x2: 1 }, operator: '<=', rhs: 10 },
      { name: 'B1', coefficients: { x1: 1 }, operator: '<=', rhs: 4 },
      { name: 'B2', coefficients: { x2: 1 }, operator: '<=', rhs: 6 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_multiple');
  assert.equal(res.objectiveValue?.fraction, '20');
  assert.equal(res.verification?.passed, true);
});

test('12 & 13. Dégénérescence et départage déterministe', () => {
  // Classic degenerate LP: Max 3x1 + 9x2 s.t. x1 + 4x2 <= 8, x1 + 2x2 <= 4, x1,x2 >= 0
  // At (0,2), both constraints bind (RHS tie 8/4 = 2 and 4/2 = 2 -> degenerate step!)
  // Optimum at x1=0, x2=2, Z=18 (or along segment? No, 3/9=1/3 vs 1/4 & 1/2 -> Z=18 at (0,2) since (4,0) gives 12)
  const model: ProblemModel = {
    name: 'Dégénérescence',
    sense: 'maximize',
    objective: { x1: 3, x2: 9 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'C1', coefficients: { x1: 1, x2: 4 }, operator: '<=', rhs: 8 },
      { name: 'C2', coefficients: { x1: 1, x2: 2 }, operator: '<=', rhs: 4 },
    ],
  };

  const res1 = solveLinearProgram(model);
  const res2 = solveLinearProgram(model);
  assert.equal(res1.status, 'optimal_unique');
  assert.equal(res1.objectiveValue?.fraction, '18');
  assert.equal(getVar(res1, 'x1'), 0);
  assert.equal(getVar(res1, 'x2'), 2);
  assert.equal(res1.degeneracyDetected, true);
  assert.equal(res1.iterationCount, res2.iterationCount);
  assert.deepEqual(res1.variables, res2.variables);
});

test('14. Prévention du cyclage — Exemple classique de Beale (activation de Bland)', () => {
  // Beale's cycling example (1955):
  // Max (3/4)x1 - 20 x2 + (1/2)x3 - 6 x4
  // s.t.
  //   (1/4)x1 - 8 x2 - x3 + 9 x4 <= 0
  //   (1/2)x1 - 12 x2 - (1/2)x3 + 3 x4 <= 0
  //   x3 <= 1
  //   x1, x2, x3, x4 >= 0
  // Optimal value: Z = 5/4 = 1.25 at x1 = 1, x2 = 0, x3 = 1, x4 = 0
  const model: ProblemModel = {
    name: 'Cycle de Beale',
    sense: 'maximize',
    objective: { x1: '3/4', x2: -20, x3: '1/2', x4: -6 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
      x3: { type: 'non_negative' },
      x4: { type: 'non_negative' },
    },
    constraints: [
      {
        name: 'B1',
        coefficients: { x1: '1/4', x2: -8, x3: -1, x4: 9 },
        operator: '<=',
        rhs: 0,
      },
      {
        name: 'B2',
        coefficients: { x1: '1/2', x2: -12, x3: '-1/2', x4: 3 },
        operator: '<=',
        rhs: 0,
      },
      {
        name: 'B3',
        coefficients: { x3: 1 },
        operator: '<=',
        rhs: 1,
      },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(res.degeneracyDetected, true);
  assert.equal(res.blandActivated, true);
  assert.equal(res.objectiveValue?.fraction, '5/4');
  assert.equal(getVar(res, 'x1'), 1);
  assert.equal(getVar(res, 'x2'), 0);
  assert.equal(getVar(res, 'x3'), 1);
  assert.equal(getVar(res, 'x4'), 0);
  assert.equal(res.verification?.passed, true);
});

test('15. Saisie de fractions, décimaux et rejet des expressions symboliques', () => {
  assert.equal(Rational.parse('1/2')?.toFractionString(), '1/2');
  assert.equal(Rational.parse('-3/4')?.toFractionString(), '-3/4');
  assert.equal(Rational.parse('0.125')?.toFractionString(), '1/8');
  assert.equal(Rational.parse('2*x1'), null);
  assert.equal(Rational.parse('1/0'), null);
  assert.equal(Rational.parse('sqrt(2)'), null);

  const model: ProblemModel = {
    name: 'Fractions exactes',
    sense: 'maximize',
    objective: { x1: '1/3', x2: '2/3' },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      { name: 'C1', coefficients: { x1: '1/2', x2: '1/4' }, operator: '<=', rhs: '3/2' },
      { name: 'C2', coefficients: { x1: 1, x2: 1 }, operator: '<=', rhs: 4 },
    ],
  };

  const res = solveLinearProgram(model);
  assert.equal(res.status, 'optimal_unique');
  assert.equal(res.verification?.passed, true);
  // Max (1/3)x1 + (2/3)x2 with x2 <= 4 (from C2 when x1=0, C1: (1/4)*4 = 1 <= 3/2) => x1=0, x2=4, Z=8/3
  assert.equal(res.objectiveValue?.fraction, '8/3');
});

test('16. Validation stricte et limites serveur (100 variables / 200 contraintes)', () => {
  // Exceed 100 variables
  const tooManyVars: Record<string, { type: 'non_negative' }> = {};
  const obj: Record<string, number> = {};
  for (let i = 1; i <= 101; i++) {
    tooManyVars[`x${i}`] = { type: 'non_negative' };
    obj[`x${i}`] = 1;
  }
  const resVars = solveLinearProgram({
    name: 'Trop de variables',
    sense: 'maximize',
    objective: obj,
    variables: tooManyVars,
    constraints: [{ coefficients: { x1: 1 }, operator: '<=', rhs: 10 }],
  });
  assert.equal(resVars.status, 'invalid_model');
  assert.ok(resVars.validationErrors.some((e) => e.code === 'MAX_VARIABLES_EXCEEDED'));

  // Exceed 200 constraints
  const tooManyCons = Array.from({ length: 201 }, (_, idx) => ({
    name: `C${idx + 1}`,
    coefficients: { x1: 1 },
    operator: '<=' as const,
    rhs: 10,
  }));
  const resCons = solveLinearProgram({
    name: 'Trop de contraintes',
    sense: 'maximize',
    objective: { x1: 1 },
    variables: { x1: { type: 'non_negative' } },
    constraints: tooManyCons,
  });
  assert.equal(resCons.status, 'invalid_model');
  assert.ok(resCons.validationErrors.some((e) => e.code === 'MAX_CONSTRAINTS_EXCEEDED'));

  // Inverted bounds + unknown variable
  const resBadBounds = solveLinearProgram({
    name: 'Bornes inversées',
    sense: 'maximize',
    objective: { x1: 1, ghost: 2 },
    variables: { x1: { type: 'bounded', lower: 10, upper: 5 } },
    constraints: [{ coefficients: { x1: 1 }, operator: '<=', rhs: 8 }],
  });
  assert.equal(resBadBounds.status, 'invalid_model');
  assert.ok(resBadBounds.validationErrors.some((e) => e.code === 'INVERTED_BOUNDS'));
  assert.ok(
    resBadBounds.validationErrors.some((e) => e.code === 'UNKNOWN_VARIABLE_IN_OBJECTIVE')
  );
});

test('17. Annulation via AbortSignal', () => {
  const controller = new AbortController();
  controller.abort();

  const res = solveLinearProgram(
    {
      name: 'Annulé',
      sense: 'maximize',
      objective: { x1: 1 },
      variables: { x1: { type: 'non_negative' } },
      constraints: [{ coefficients: { x1: 1 }, operator: '<=', rhs: 5 }],
    },
    { signal: controller.signal }
  );

  assert.equal(res.status, 'cancelled');
});
