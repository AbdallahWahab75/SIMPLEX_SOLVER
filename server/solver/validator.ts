import { Rational } from './rational.js';
import type {
  ConstraintOperator,
  ProblemModel,
  SolverLimits,
  ValidationIssue,
  VariableDomainType,
} from './types.js';

export const DEFAULT_SOLVER_LIMITS: SolverLimits = {
  maxVariables: 100,
  maxConstraints: 200,
  timeoutMs: 120_000,
  tolerance: 1e-9,
};

export interface ParsedVariable {
  name: string;
  type: VariableDomainType;
  lower: Rational | null;
  upper: Rational | null;
  unit?: string;
}

export interface ParsedConstraint {
  name: string;
  index: number;
  coefficients: Record<string, Rational>;
  operator: ConstraintOperator;
  rhs: Rational;
}

export interface ParsedProblem {
  name: string;
  sense: 'maximize' | 'minimize';
  variableOrder: string[];
  variables: Record<string, ParsedVariable>;
  objective: Record<string, Rational>;
  constraints: ParsedConstraint[];
  objectiveUnit?: string;
}

const VALID_SENSES = new Set(['maximize', 'minimize']);
const VALID_OPERATORS = new Set(['<=', '>=', '=']);
const VALID_DOMAINS = new Set<VariableDomainType>([
  'non_negative',
  'non_positive',
  'free',
  'lower_bounded',
  'upper_bounded',
  'bounded',
]);

export function validateAndParseModel(
  raw: unknown,
  limits: SolverLimits = DEFAULT_SOLVER_LIMITS
): { valid: true; parsed: ParsedProblem } | { valid: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      issues: [
        {
          code: 'INVALID_PAYLOAD',
          field: 'model',
          message: 'Le modèle doit être un objet JSON valide.',
        },
      ],
    };
  }

  const model = raw as Partial<ProblemModel>;

  const name = typeof model.name === 'string' ? model.name.trim() : '';
  if (!name) {
    issues.push({
      code: 'MISSING_NAME',
      field: 'name',
      message: 'Le nom du problème est obligatoire.',
    });
  }

  if (!model.sense || !VALID_SENSES.has(model.sense)) {
    issues.push({
      code: 'INVALID_SENSE',
      field: 'sense',
      message: 'Le sens de la fonction objectif doit être "maximize" ou "minimize".',
    });
  }

  // Variables validation
  if (
    !model.variables ||
    typeof model.variables !== 'object' ||
    Array.isArray(model.variables)
  ) {
    issues.push({
      code: 'MISSING_VARIABLES',
      field: 'variables',
      message: 'Au moins une variable de décision doit être définie.',
    });
    return { valid: false, issues };
  }

  const varEntries = Object.entries(model.variables);
  if (varEntries.length === 0) {
    issues.push({
      code: 'NO_VARIABLES',
      field: 'variables',
      message: 'Le problème doit contenir au moins une variable de décision.',
    });
  }

  if (varEntries.length > limits.maxVariables) {
    issues.push({
      code: 'MAX_VARIABLES_EXCEEDED',
      field: 'variables',
      message: `Le nombre de variables (${varEntries.length}) dépasse la limite maximale autorisée (${limits.maxVariables}).`,
      details: { count: varEntries.length, limit: limits.maxVariables },
    });
  }

  const parsedVars: Record<string, ParsedVariable> = {};
  const variableOrder: string[] = [];
  const seenNormalizedNames = new Set<string>();

  for (const [rawVarName, def] of varEntries) {
    const varName = rawVarName.trim();
    if (!varName || varName !== rawVarName) {
      issues.push({
        code: 'INVALID_VARIABLE_NAME',
        field: `variables.${rawVarName}`,
        message: 'Le nom de variable ne peut pas être vide ni contenir d’espaces en bordure.',
      });
      continue;
    }
    if (seenNormalizedNames.has(varName)) {
      issues.push({
        code: 'DUPLICATE_VARIABLE',
        field: `variables.${varName}`,
        message: `La variable "${varName}" est définie en double.`,
      });
      continue;
    }
    seenNormalizedNames.add(varName);
    variableOrder.push(varName);

    if (!def || typeof def !== 'object') {
      issues.push({
        code: 'INVALID_VARIABLE_DEF',
        field: `variables.${varName}`,
        message: `La définition de la variable "${varName}" est invalide.`,
      });
      continue;
    }

    if (!def.type || !VALID_DOMAINS.has(def.type)) {
      issues.push({
        code: 'INVALID_VARIABLE_DOMAIN',
        field: `variables.${varName}.type`,
        message: `Le type de domaine de "${varName}" est invalide.`,
      });
      continue;
    }

    let lower: Rational | null = null;
    let upper: Rational | null = null;

    if (def.type === 'non_negative') {
      lower = Rational.ZERO;
    } else if (def.type === 'non_positive') {
      upper = Rational.ZERO;
    } else if (def.type === 'lower_bounded') {
      if (def.lower === undefined || def.lower === null || def.lower === '') {
        issues.push({
          code: 'MISSING_LOWER_BOUND',
          field: `variables.${varName}.lower`,
          message: `La borne inférieure de "${varName}" est requise.`,
        });
      } else {
        const parsedLower = Rational.parse(def.lower);
        if (!parsedLower) {
          issues.push({
            code: 'INVALID_NUMBER',
            field: `variables.${varName}.lower`,
            message: `La borne inférieure de "${varName}" n'est pas un nombre ou une fraction valide.`,
          });
        } else {
          lower = parsedLower;
        }
      }
    } else if (def.type === 'upper_bounded') {
      if (def.upper === undefined || def.upper === null || def.upper === '') {
        issues.push({
          code: 'MISSING_UPPER_BOUND',
          field: `variables.${varName}.upper`,
          message: `La borne supérieure de "${varName}" est requise.`,
        });
      } else {
        const parsedUpper = Rational.parse(def.upper);
        if (!parsedUpper) {
          issues.push({
            code: 'INVALID_NUMBER',
            field: `variables.${varName}.upper`,
            message: `La borne supérieure de "${varName}" n'est pas un nombre ou une fraction valide.`,
          });
        } else {
          upper = parsedUpper;
        }
      }
    } else if (def.type === 'bounded') {
      if (def.lower === undefined || def.lower === null || def.lower === '') {
        issues.push({
          code: 'MISSING_LOWER_BOUND',
          field: `variables.${varName}.lower`,
          message: `La borne inférieure de "${varName}" est requise.`,
        });
      } else {
        const parsedLower = Rational.parse(def.lower);
        if (!parsedLower) {
          issues.push({
            code: 'INVALID_NUMBER',
            field: `variables.${varName}.lower`,
            message: `La borne inférieure de "${varName}" n'est pas un nombre valide.`,
          });
        } else {
          lower = parsedLower;
        }
      }

      if (def.upper === undefined || def.upper === null || def.upper === '') {
        issues.push({
          code: 'MISSING_UPPER_BOUND',
          field: `variables.${varName}.upper`,
          message: `La borne supérieure de "${varName}" est requise.`,
        });
      } else {
        const parsedUpper = Rational.parse(def.upper);
        if (!parsedUpper) {
          issues.push({
            code: 'INVALID_NUMBER',
            field: `variables.${varName}.upper`,
            message: `La borne supérieure de "${varName}" n'est pas un nombre valide.`,
          });
        } else {
          upper = parsedUpper;
        }
      }

      if (lower && upper && lower.cmp(upper) > 0) {
        issues.push({
          code: 'INVERTED_BOUNDS',
          field: `variables.${varName}`,
          message: `Pour "${varName}", la borne inférieure (${lower.toFractionString()}) dépasse la borne supérieure (${upper.toFractionString()}).`,
        });
      }
    }

    parsedVars[varName] = {
      name: varName,
      type: def.type,
      lower,
      upper,
      unit: typeof def.unit === 'string' && def.unit.trim() ? def.unit.trim() : undefined,
    };
  }

  // Objective validation
  const parsedObjective: Record<string, Rational> = {};
  for (const v of variableOrder) {
    parsedObjective[v] = Rational.ZERO;
  }

  if (
    !model.objective ||
    typeof model.objective !== 'object' ||
    Array.isArray(model.objective) ||
    Object.keys(model.objective).length === 0
  ) {
    issues.push({
      code: 'MISSING_OBJECTIVE',
      field: 'objective',
      message: 'La fonction objectif est absente ou vide.',
    });
  } else {
    for (const [varName, coeffRaw] of Object.entries(model.objective)) {
      if (!Object.prototype.hasOwnProperty.call(parsedVars, varName)) {
        issues.push({
          code: 'UNKNOWN_VARIABLE_IN_OBJECTIVE',
          field: `objective.${varName}`,
          message: `La variable "${varName}" utilisée dans l'objectif n'est pas déclarée dans la liste des variables.`,
        });
        continue;
      }
      const parsedCoeff = Rational.parse(coeffRaw);
      if (!parsedCoeff) {
        issues.push({
          code: 'INVALID_OBJECTIVE_COEFFICIENT',
          field: `objective.${varName}`,
          message: `Le coefficient de "${varName}" dans la fonction objectif est invalide.`,
        });
        continue;
      }
      parsedObjective[varName] = parsedCoeff;
    }
  }

  // Constraints validation
  if (!Array.isArray(model.constraints)) {
    issues.push({
      code: 'MISSING_CONSTRAINTS',
      field: 'constraints',
      message: 'La liste des contraintes est requise.',
    });
    return { valid: false, issues };
  }

  if (model.constraints.length > limits.maxConstraints) {
    issues.push({
      code: 'MAX_CONSTRAINTS_EXCEEDED',
      field: 'constraints',
      message: `Le nombre de contraintes (${model.constraints.length}) dépasse la limite maximale autorisée (${limits.maxConstraints}).`,
      details: { count: model.constraints.length, limit: limits.maxConstraints },
    });
  }

  const parsedConstraints: ParsedConstraint[] = [];
  model.constraints.forEach((con, idx) => {
    const baseField = `constraints[${idx}]`;
    if (!con || typeof con !== 'object' || Array.isArray(con)) {
      issues.push({
        code: 'INVALID_CONSTRAINT',
        field: baseField,
        message: `La contrainte #${idx + 1} est mal formée.`,
      });
      return;
    }

    const cName =
      typeof con.name === 'string' && con.name.trim()
        ? con.name.trim()
        : `C${idx + 1}`;

    if (!con.operator || !VALID_OPERATORS.has(con.operator)) {
      issues.push({
        code: 'INVALID_OPERATOR',
        field: `${baseField}.operator`,
        message: `L'opérateur de la contrainte "${cName}" doit être <=, >= ou =.`,
      });
    }

    let parsedRhs: Rational | null = null;
    if (con.rhs === undefined || con.rhs === null || con.rhs === '') {
      issues.push({
        code: 'MISSING_RHS',
        field: `${baseField}.rhs`,
        message: `Le membre droit (RHS) de la contrainte "${cName}" est manquant.`,
      });
    } else {
      parsedRhs = Rational.parse(con.rhs);
      if (!parsedRhs) {
        issues.push({
          code: 'INVALID_RHS',
          field: `${baseField}.rhs`,
          message: `Le membre droit (RHS) de la contrainte "${cName}" n'est pas un nombre valide.`,
        });
      }
    }

    const coeffs: Record<string, Rational> = {};
    for (const v of variableOrder) {
      coeffs[v] = Rational.ZERO;
    }

    if (
      !con.coefficients ||
      typeof con.coefficients !== 'object' ||
      Array.isArray(con.coefficients) ||
      Object.keys(con.coefficients).length === 0
    ) {
      issues.push({
        code: 'INCOMPLETE_CONSTRAINT',
        field: `${baseField}.coefficients`,
        message: `La contrainte "${cName}" ne contient aucun coefficient.`,
      });
    } else {
      for (const [varName, coeffRaw] of Object.entries(con.coefficients)) {
        if (!Object.prototype.hasOwnProperty.call(parsedVars, varName)) {
          issues.push({
            code: 'UNKNOWN_VARIABLE_IN_CONSTRAINT',
            field: `${baseField}.coefficients.${varName}`,
            message: `La variable "${varName}" dans la contrainte "${cName}" n'est pas déclarée.`,
          });
          continue;
        }
        const parsedCoeff = Rational.parse(coeffRaw);
        if (!parsedCoeff) {
          issues.push({
            code: 'INVALID_CONSTRAINT_COEFFICIENT',
            field: `${baseField}.coefficients.${varName}`,
            message: `Le coefficient de "${varName}" dans la contrainte "${cName}" est invalide.`,
          });
          continue;
        }
        coeffs[varName] = parsedCoeff;
      }
    }

    if (parsedRhs && con.operator && VALID_OPERATORS.has(con.operator)) {
      parsedConstraints.push({
        name: cName,
        index: idx,
        coefficients: coeffs,
        operator: con.operator,
        rhs: parsedRhs,
      });
    }
  });

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  return {
    valid: true,
    parsed: {
      name,
      sense: model.sense!,
      variableOrder,
      variables: parsedVars,
      objective: parsedObjective,
      constraints: parsedConstraints,
      objectiveUnit:
        typeof model.objectiveUnit === 'string' && model.objectiveUnit.trim()
          ? model.objectiveUnit.trim()
          : undefined,
    },
  };
}
