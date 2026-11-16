export type ObjectiveSense = 'maximize' | 'minimize';

export type VariableDomainType =
  | 'non_negative'
  | 'non_positive'
  | 'free'
  | 'lower_bounded'
  | 'upper_bounded'
  | 'bounded';

export type ConstraintOperator = '<=' | '>=' | '=';

export type NumericInput = number | string;

export interface VariableDefinition {
  type: VariableDomainType;
  lower?: NumericInput | null;
  upper?: NumericInput | null;
  unit?: string;
}

export interface ConstraintDefinition {
  name?: string;
  coefficients: Record<string, NumericInput>;
  operator: ConstraintOperator;
  rhs: NumericInput;
}

export interface ProblemModel {
  name: string;
  sense: ObjectiveSense;
  objective: Record<string, NumericInput>;
  variables: Record<string, VariableDefinition>;
  constraints: ConstraintDefinition[];
  objectiveUnit?: string;
}

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SolverLimits {
  maxVariables: number;
  maxConstraints: number;
  timeoutMs: number;
  tolerance: number;
}

export interface FormattedValue {
  fraction: string;
  decimal: number;
}

export type PivotRule =
  | 'initial'
  | 'dantzig'
  | 'bland'
  | 'optimal'
  | 'infeasible'
  | 'unbounded';

export interface IterationSnapshot {
  iterationNumber: number;
  phase: 1 | 2;
  columnHeaders: string[];
  basicVariables: string[];
  rows: FormattedValue[][];
  objectiveRow: FormattedValue[];
  enteringVariable: string | null;
  leavingVariable: string | null;
  pivotRow: number | null;
  pivotColumn: number | null;
  pivotElement: FormattedValue | null;
  ruleUsed: PivotRule;
  isDegenerate: boolean;
}

export type SolveStatus =
  | 'optimal_unique'
  | 'optimal_multiple'
  | 'infeasible'
  | 'unbounded'
  | 'invalid_model'
  | 'numerical_instability'
  | 'timed_out'
  | 'cancelled'
  | 'failed';

export interface ConstraintEvaluation {
  name: string;
  index: number;
  lhs: FormattedValue;
  operator: ConstraintOperator;
  rhs: FormattedValue;
  slackOrSurplus: FormattedValue;
  isBinding: boolean;
  shadowPrice: FormattedValue | null;
}

export interface VariableResult {
  name: string;
  value: FormattedValue;
  unit?: string;
}

export interface SolveVerification {
  passed: boolean;
  maxConstraintViolation: number;
  maxBoundViolation: number;
  objectiveDiscrepancy: number;
  dualityDiscrepancy: number | null;
  checks: {
    constraintsSatisfied: boolean;
    boundsSatisfied: boolean;
    objectiveConsistent: boolean;
    optimalityConditionsMet: boolean;
  };
}

export interface SolveResult {
  status: SolveStatus;
  methodUsed: 'primal_simplex' | 'two_phase_simplex' | 'none';
  engineVersion: string;
  durationMs: number;
  objectiveValue: FormattedValue | null;
  variables: VariableResult[];
  constraints: ConstraintEvaluation[];
  economicAnalysisAvailable: boolean;
  iterations: IterationSnapshot[];
  iterationCount: number;
  degeneracyDetected: boolean;
  blandActivated: boolean;
  verification: SolveVerification | null;
  validationErrors: ValidationIssue[];
  userMessageKey: string;
  internalDiagnostics: string[];
}
