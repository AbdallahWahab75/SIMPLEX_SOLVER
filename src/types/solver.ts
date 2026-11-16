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

export interface ModelVersionRecord {
  id: number;
  problemId: number;
  versionNumber: number;
  modelJson: ProblemModel;
  note: string | null;
  createdAt: string;
}

export interface ResolutionRecord {
  id: number;
  problemId: number;
  modelVersionId: number;
  status:
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timed_out'
    | 'numerical_instability';
  outcomeStatus:
    | 'optimal_unique'
    | 'optimal_multiple'
    | 'infeasible'
    | 'unbounded'
    | 'invalid_model'
    | 'numerical_instability'
    | 'timed_out'
    | 'cancelled'
    | 'failed'
    | null;
  methodUsed: 'primal_simplex' | 'two_phase_simplex' | 'none' | null;
  engineVersion: string;
  durationMs: number | null;
  objectiveValue: FormattedValue | null;
  variables: VariableResult[] | null;
  constraints: ConstraintEvaluation[] | null;
  economicAnalysisAvailable: boolean;
  degeneracyDetected: boolean;
  blandActivated: boolean;
  verification: SolveVerification | null;
  iterationCount: number;
  createdAt: string;
  completedAt: string | null;
  userErrorMessage: string | null;
}

export interface ProblemListItem {
  id: number;
  name: string;
  description: string | null;
  projectId: number | null;
  folderId: number | null;
  currentVersionId: number | null;
  accessRole?: ProblemAccessRole;
  ownerEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: {
    id: number;
    versionNumber: number;
    modelJson: ProblemModel;
    createdAt: string;
  } | null;
  latestResolution: {
    id: number;
    status: string;
    outcomeStatus: string | null;
    methodUsed: string | null;
    objectiveValueJson: FormattedValue | null;
    durationMs: number | null;
    createdAt: string;
  } | null;
  resolutionCount: number;
}

export interface ProjectRecord {
  id: number;
  ownerId: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FolderRecord {
  id: number;
  projectId: number;
  ownerId: number;
  name: string;
  createdAt: string;
}

export interface ActivityLogRecord {
  id: number;
  userId: number;
  problemId: number | null;
  action: string;
  metadataJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface DashboardSummary {
  stats: {
    totalProblems: number;
    totalResolutions: number;
    successfulResolutions: number;
    failedResolutions: number;
  };
  projects: ProjectRecord[];
  folders: FolderRecord[];
  recentActivity: ActivityLogRecord[];
}

export type CollaboratorRole = 'reader' | 'editor' | 'admin';
export type ProblemAccessRole = 'owner' | CollaboratorRole;

export interface ImportVariableMapping {
  colIndex: number;
  varName: string;
}

export interface ImportMapping {
  problemName: string;
  sense: ObjectiveSense;
  hasHeaderRow: boolean;
  labelCol: number;
  objectiveRowIndex: number;
  operatorCol: number;
  rhsCol: number;
  variableCols: ImportVariableMapping[];
}

export interface ImportIssue {
  code: string;
  field: string;
  row?: number;
  col?: number;
  message: string;
}

export interface ImportPreviewResult {
  fileType: 'csv' | 'xlsx';
  sheetNames: string[];
  selectedSheet: string;
  rangeApplied: string | null;
  totalRows: number;
  totalCols: number;
  previewRows: string[][];
  suggestedMapping: ImportMapping;
  candidateModel: ProblemModel | null;
  issues: ImportIssue[];
  valid: boolean;
}

export interface CollaboratorRecord {
  id: number;
  userId: number;
  role: CollaboratorRole;
  createdAt: string;
  email: string;
  displayName: string | null;
}

export interface InvitationRecord {
  id: number;
  email: string;
  role: CollaboratorRole;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface PendingUserInvitation {
  id: number;
  problemId: number;
  problemName: string;
  role: CollaboratorRole;
  token: string;
  expiresAt: string;
  createdAt: string;
  inviterEmail: string;
}

export interface ShareLinkRecord {
  id: number;
  token: string;
  role: 'reader' | 'editor';
  hasPassword: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface ProblemActivityRecord {
  id: number;
  action: string;
  metadataJson: Record<string, unknown> | null;
  createdAt: string;
  actorEmail: string;
}

export interface ProblemSharingState {
  problemId: number;
  problemName: string;
  accessRole: ProblemAccessRole;
  isOwner: boolean;
  maxCollaborators: number;
  owner: { id: number; email: string; displayName: string | null } | null;
  collaborators: CollaboratorRecord[];
  invitations: InvitationRecord[];
  shareLinks: ShareLinkRecord[];
  activity: ProblemActivityRecord[];
}

export type NumberDisplayMode = 'fraction' | 'decimal' | 'both';
export type ThemeMode = 'light' | 'dark';
