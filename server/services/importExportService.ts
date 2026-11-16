import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Rational } from '../solver/rational.ts';
import { validateAndParseModel } from '../solver/validator.ts';
import type {
  ConstraintEvaluation,
  ConstraintOperator,
  FormattedValue,
  IterationSnapshot,
  ProblemModel,
  SolverLimits,
  SolveVerification,
  ValidationIssue,
  VariableResult,
} from '../solver/types.ts';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB raw file cap

export interface ImportVariableMapping {
  colIndex: number;
  varName: string;
}

export interface ImportMapping {
  problemName: string;
  sense: 'maximize' | 'minimize';
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

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount >= tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      row.push(cell.trim());
      if (clean[i + 1] === '\n') i += 1;
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  rows.push(row);

  return rows;
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i += 1) {
    idx = idx * 26 + (upper.charCodeAt(i) - 64);
  }
  return idx - 1; // 0-based
}

function parseCellRange(
  rangeStr: string
): { r1: number; c1: number; r2: number; c2: number } | null {
  const match = rangeStr
    .trim()
    .match(/^\$?([A-Za-z]{1,3})\$?(\d+):\$?([A-Za-z]{1,3})\$?(\d+)$/);
  if (!match) return null;
  const c1 = colLettersToIndex(match[1]);
  const r1 = Number.parseInt(match[2], 10) - 1;
  const c2 = colLettersToIndex(match[3]);
  const r2 = Number.parseInt(match[4], 10) - 1;
  if (r1 < 0 || c1 < 0 || r2 < r1 || c2 < c1) return null;
  return { r1, c1, r2, c2 };
}

function cellValueToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') {
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result).trim();
    }
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText
        .map((part) => part.text)
        .join('')
        .trim();
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
  }
  return String(val).trim();
}

function normalizeGrid(rawRows: string[][]): string[][] {
  const maxCols = rawRows.reduce((m, r) => Math.max(m, r.length), 0);
  return rawRows.map((r) => {
    const out = r.slice(0, maxCols);
    while (out.length < maxCols) out.push('');
    return out;
  });
}

function buildSuggestedMapping(
  rows: string[][],
  fileName: string
): ImportMapping {
  const baseName =
    fileName.replace(/\.(csv|xlsx)$/i, '').trim() || 'Modèle importé';
  const totalCols = rows[0]?.length ?? 0;
  const firstRow = rows[0] ?? [];

  // Heuristic: does row 0 look like headers (not purely numbers)?
  const numericInFirstRow = firstRow.filter(
    (c) => c !== '' && !Number.isNaN(Number(c))
  ).length;
  const hasHeaderRow = totalCols >= 3 && numericInFirstRow === 0;
  const dataStart = hasHeaderRow ? 1 : 0;

  let operatorCol = totalCols >= 4 ? totalCols - 2 : -1;
  let rhsCol = totalCols >= 4 ? totalCols - 1 : -1;
  let labelCol = totalCols >= 4 ? 0 : -1;

  if (hasHeaderRow) {
    firstRow.forEach((h, idx) => {
      const lower = h.toLowerCase();
      if (/^(op|rel|relation|operator|signe)$/.test(lower)) operatorCol = idx;
      if (/^(rhs|membre droit|droite|b|limit|limite|cap)$/.test(lower))
        rhsCol = idx;
      if (/^(nom|name|contrainte|constraint|ligne|row)$/.test(lower))
        labelCol = idx;
    });
  }

  const variableCols: ImportVariableMapping[] = [];
  for (let c = 0; c < totalCols; c += 1) {
    if (c === labelCol || c === operatorCol || c === rhsCol) continue;
    const headerName = hasHeaderRow && firstRow[c] ? firstRow[c].trim() : `x${variableCols.length + 1}`;
    variableCols.push({ colIndex: c, varName: headerName });
  }

  let objectiveRowIndex = -1;
  for (let r = dataStart; r < rows.length; r += 1) {
    const label = (labelCol >= 0 ? rows[r][labelCol] : rows[r][0] ?? '').toLowerCase();
    if (/^(z|obj|objectif|objective|max|min)/.test(label)) {
      objectiveRowIndex = r;
      break;
    }
  }
  if (objectiveRowIndex === -1 && rows.length > dataStart) {
    objectiveRowIndex = dataStart;
  }

  return {
    problemName: baseName,
    sense: 'maximize',
    hasHeaderRow,
    labelCol,
    objectiveRowIndex,
    operatorCol,
    rhsCol,
    variableCols,
  };
}

function normalizeOperator(raw: string): ConstraintOperator | null {
  const s = raw.trim();
  if (s === '<=' || s === '≤') return '<=';
  if (s === '>=' || s === '≥') return '>=';
  if (s === '=' || s === '==') return '=';
  return null;
}

function tryParseNumeric(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = Rational.parse(trimmed);
    return parsed ? trimmed : null;
  } catch {
    return null;
  }
}

export async function previewImportModel(params: {
  fileName: string;
  contentBase64: string;
  sheetName?: string;
  range?: string;
  mapping?: ImportMapping;
  limits: SolverLimits;
}): Promise<ImportPreviewResult> {
  const rawBuffer = Buffer.from(params.contentBase64, 'base64');
  if (rawBuffer.byteLength === 0) {
    throw new Error('Le fichier importé est vide.');
  }
  if (rawBuffer.byteLength > MAX_IMPORT_BYTES) {
    throw new Error('Le fichier dépasse la limite autorisée de 2 Mo.');
  }

  const lowerName = params.fileName.toLowerCase();
  const isCsv = lowerName.endsWith('.csv');
  const isXlsx = lowerName.endsWith('.xlsx');
  if (!isCsv && !isXlsx) {
    throw new Error('Format non supporté. Utilisez un fichier .csv ou .xlsx.');
  }

  let sheetNames: string[] = [];
  let selectedSheet = '';
  let rawGrid: string[][] = [];

  if (isCsv) {
    sheetNames = ['CSV'];
    selectedSheet = 'CSV';
    rawGrid = parseCsvRows(rawBuffer.toString('utf8'));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(rawBuffer as unknown as ArrayBuffer);
    sheetNames = wb.worksheets.map((ws) => ws.name);
    if (sheetNames.length === 0) {
      throw new Error('Le classeur Excel ne contient aucune feuille.');
    }
    selectedSheet =
      params.sheetName && sheetNames.includes(params.sheetName)
        ? params.sheetName
        : sheetNames[0];
    const ws = wb.getWorksheet(selectedSheet);
    if (!ws) {
      throw new Error(`Feuille "${selectedSheet}" introuvable.`);
    }
    const maxRow = ws.rowCount;
    const maxCol = ws.columnCount;
    for (let r = 1; r <= maxRow; r += 1) {
      const row = ws.getRow(r);
      const vals: string[] = [];
      for (let c = 1; c <= maxCol; c += 1) {
        vals.push(cellValueToString(row.getCell(c).value));
      }
      rawGrid.push(vals);
    }
  }

  rawGrid = normalizeGrid(rawGrid);

  let rangeApplied: string | null = null;
  if (params.range && params.range.trim()) {
    const parsedRange = parseCellRange(params.range);
    if (!parsedRange) {
      const nonEmptyPreview = rawGrid.filter((r) => r.some((c) => c !== ''));
      return {
        fileType: isCsv ? 'csv' : 'xlsx',
        sheetNames,
        selectedSheet,
        rangeApplied: params.range.trim(),
        totalRows: nonEmptyPreview.length,
        totalCols: nonEmptyPreview[0]?.length ?? 0,
        previewRows: nonEmptyPreview.slice(0, 60),
        suggestedMapping: buildSuggestedMapping(nonEmptyPreview, params.fileName),
        candidateModel: null,
        issues: [
          {
            code: 'INVALID_RANGE',
            field: 'range',
            message:
              'Plage invalide. Format attendu : A1:E10 (colonne/ligne début : colonne/ligne fin).',
          },
        ],
        valid: false,
      };
    }
    const sliced: string[][] = [];
    for (
      let r = parsedRange.r1;
      r <= Math.min(parsedRange.r2, rawGrid.length - 1);
      r += 1
    ) {
      const srcRow = rawGrid[r] ?? [];
      const rowSlice: string[] = [];
      for (let c = parsedRange.c1; c <= parsedRange.c2; c += 1) {
        rowSlice.push(srcRow[c] ?? '');
      }
      sliced.push(rowSlice);
    }
    rawGrid = normalizeGrid(sliced);
    rangeApplied = params.range.trim().toUpperCase();
  }

  rawGrid = rawGrid.filter((r) => r.some((c) => c !== ''));

  const totalRows = rawGrid.length;
  const totalCols = rawGrid[0]?.length ?? 0;
  const suggestedMapping = buildSuggestedMapping(rawGrid, params.fileName);
  const mapping = params.mapping ?? suggestedMapping;
  const issues: ImportIssue[] = [];

  if (totalRows === 0 || totalCols === 0) {
    issues.push({
      code: 'EMPTY_DATA',
      field: 'file',
      message: 'Aucune donnée exploitable trouvée dans la feuille ou la plage sélectionnée.',
    });
    return {
      fileType: isCsv ? 'csv' : 'xlsx',
      sheetNames,
      selectedSheet,
      rangeApplied,
      totalRows,
      totalCols,
      previewRows: [],
      suggestedMapping,
      candidateModel: null,
      issues,
      valid: false,
    };
  }

  if (!mapping.problemName.trim()) {
    issues.push({
      code: 'MISSING_NAME',
      field: 'problemName',
      message: 'Le nom du problème est requis.',
    });
  }

  if (mapping.variableCols.length === 0) {
    issues.push({
      code: 'NO_VARIABLES',
      field: 'variableCols',
      message: 'Sélectionnez au moins une colonne de variable de décision.',
    });
  }

  const seenVarNames = new Set<string>();
  const duplicateVarNames = new Set<string>();
  for (const vc of mapping.variableCols) {
    const cleanVar = vc.varName.trim();
    if (!cleanVar) {
      issues.push({
        code: 'EMPTY_VARIABLE_NAME',
        field: `col.${vc.colIndex}`,
        col: vc.colIndex,
        message: `La colonne ${vc.colIndex + 1} a un nom de variable vide.`,
      });
      continue;
    }
    if (seenVarNames.has(cleanVar)) {
      duplicateVarNames.add(cleanVar);
      issues.push({
        code: 'DUPLICATE_VARIABLE',
        field: `variables.${cleanVar}`,
        col: vc.colIndex,
        message: `Variable en double détectée : "${cleanVar}".`,
      });
    }
    seenVarNames.add(cleanVar);
    if (vc.colIndex < 0 || vc.colIndex >= totalCols) {
      issues.push({
        code: 'OUT_OF_RANGE_COL',
        field: `variables.${cleanVar}`,
        col: vc.colIndex,
        message: `La colonne sélectionnée pour "${cleanVar}" n’existe pas.`,
      });
    }
  }

  if (mapping.operatorCol < 0 || mapping.operatorCol >= totalCols) {
    issues.push({
      code: 'MISSING_OPERATOR_COL',
      field: 'operatorCol',
      message: 'Sélectionnez la colonne contenant la relation (<=, >=, =).',
    });
  }

  if (mapping.rhsCol < 0 || mapping.rhsCol >= totalCols) {
    issues.push({
      code: 'MISSING_RHS_COL',
      field: 'rhsCol',
      message: 'Sélectionnez la colonne contenant le membre droit (RHS).',
    });
  }

  const startDataRow = mapping.hasHeaderRow ? 1 : 0;
  if (
    mapping.objectiveRowIndex < startDataRow ||
    mapping.objectiveRowIndex >= totalRows
  ) {
    issues.push({
      code: 'MISSING_OBJECTIVE_ROW',
      field: 'objectiveRowIndex',
      message: 'Sélectionnez une ligne valide pour la fonction objectif.',
    });
  }

  const objective: Record<string, string> = {};
  const variables: ProblemModel['variables'] = {};
  const constraints: ProblemModel['constraints'] = [];

  if (
    mapping.objectiveRowIndex >= startDataRow &&
    mapping.objectiveRowIndex < totalRows
  ) {
    const objRow = rawGrid[mapping.objectiveRowIndex];
    for (const vc of mapping.variableCols) {
      const varName = vc.varName.trim();
      if (!varName) continue;
      if (!duplicateVarNames.has(varName)) {
        variables[varName] = { type: 'non_negative' };
      }
      const rawCell = objRow[vc.colIndex] ?? '';
      if (rawCell === '') {
        issues.push({
          code: 'MISSING_VALUE',
          field: `objective.${varName}`,
          row: mapping.objectiveRowIndex + 1,
          col: vc.colIndex + 1,
          message: `Ligne ${mapping.objectiveRowIndex + 1}, colonne "${varName}" : coefficient objectif manquant (aucune valeur par défaut ajoutée silencieusement).`,
        });
      } else {
        const parsed = tryParseNumeric(rawCell);
        if (parsed === null) {
          issues.push({
            code: 'INVALID_NUMBER',
            field: `objective.${varName}`,
            row: mapping.objectiveRowIndex + 1,
            col: vc.colIndex + 1,
            message: `Ligne ${mapping.objectiveRowIndex + 1}, colonne "${varName}" : valeur "${rawCell}" non numérique.`,
          });
        } else if (!duplicateVarNames.has(varName)) {
          objective[varName] = parsed;
        }
      }
    }
  }

  const seenConstraintNames = new Set<string>();
  for (let r = startDataRow; r < totalRows; r += 1) {
    if (r === mapping.objectiveRowIndex) continue;
    const row = rawGrid[r];
    if (row.every((c) => c === '')) continue;

    const rawLabel =
      mapping.labelCol >= 0 && mapping.labelCol < totalCols
        ? row[mapping.labelCol]
        : '';
    const conName = rawLabel || `C${constraints.length + 1}`;
    if (rawLabel && seenConstraintNames.has(rawLabel)) {
      issues.push({
        code: 'DUPLICATE_CONSTRAINT',
        field: `constraints[${constraints.length}].name`,
        row: r + 1,
        message: `Ligne ${r + 1} : nom de contrainte en double ("${rawLabel}").`,
      });
    }
    if (rawLabel) seenConstraintNames.add(rawLabel);

    const coeffs: Record<string, string> = {};
    for (const vc of mapping.variableCols) {
      const varName = vc.varName.trim();
      if (!varName) continue;
      const rawCell = row[vc.colIndex] ?? '';
      if (rawCell === '') {
        issues.push({
          code: 'MISSING_VALUE',
          field: `constraints[${constraints.length}].coefficients.${varName}`,
          row: r + 1,
          col: vc.colIndex + 1,
          message: `Ligne ${r + 1}, colonne "${varName}" : coefficient manquant.`,
        });
      } else {
        const parsed = tryParseNumeric(rawCell);
        if (parsed === null) {
          issues.push({
            code: 'INVALID_NUMBER',
            field: `constraints[${constraints.length}].coefficients.${varName}`,
            row: r + 1,
            col: vc.colIndex + 1,
            message: `Ligne ${r + 1}, colonne "${varName}" : valeur "${rawCell}" invalide.`,
          });
        } else if (!duplicateVarNames.has(varName)) {
          coeffs[varName] = parsed;
        }
      }
    }

    let op: ConstraintOperator = '<=';
    if (mapping.operatorCol >= 0 && mapping.operatorCol < totalCols) {
      const rawOp = row[mapping.operatorCol] ?? '';
      const norm = normalizeOperator(rawOp);
      if (!norm) {
        issues.push({
          code: 'INVALID_OPERATOR',
          field: `constraints[${constraints.length}].operator`,
          row: r + 1,
          col: mapping.operatorCol + 1,
          message: `Ligne ${r + 1} : relation "${rawOp || '(vide)'}" invalide (attendu : <=, >= ou =).`,
        });
      } else {
        op = norm;
      }
    }

    let rhsVal = '0';
    if (mapping.rhsCol >= 0 && mapping.rhsCol < totalCols) {
      const rawRhs = row[mapping.rhsCol] ?? '';
      if (rawRhs === '') {
        issues.push({
          code: 'MISSING_VALUE',
          field: `constraints[${constraints.length}].rhs`,
          row: r + 1,
          col: mapping.rhsCol + 1,
          message: `Ligne ${r + 1} : membre droit (RHS) manquant.`,
        });
      } else {
        const parsedRhs = tryParseNumeric(rawRhs);
        if (parsedRhs === null) {
          issues.push({
            code: 'INVALID_NUMBER',
            field: `constraints[${constraints.length}].rhs`,
            row: r + 1,
            col: mapping.rhsCol + 1,
            message: `Ligne ${r + 1} : membre droit "${rawRhs}" non numérique.`,
          });
        } else {
          rhsVal = parsedRhs;
        }
      }
    }

    constraints.push({
      name: conName,
      coefficients: coeffs,
      operator: op,
      rhs: rhsVal,
    });
  }

  let candidateModel: ProblemModel | null = null;
  if (Object.keys(variables).length > 0) {
    candidateModel = {
      name: mapping.problemName.trim() || 'Modèle importé',
      sense: mapping.sense,
      objective,
      variables,
      constraints,
      objectiveUnit: '',
    };

    const serverCheck = validateAndParseModel(candidateModel, params.limits);
    if (!serverCheck.valid) {
      for (const issue of serverCheck.issues) {
        if (!issues.some((i) => i.field === issue.field && i.code === issue.code)) {
          issues.push({
            code: issue.code,
            field: issue.field,
            message: issue.message,
          });
        }
      }
    }
  }

  return {
    fileType: isCsv ? 'csv' : 'xlsx',
    sheetNames,
    selectedSheet,
    rangeApplied,
    totalRows,
    totalCols,
    previewRows: rawGrid.slice(0, 60),
    suggestedMapping,
    candidateModel: issues.length === 0 ? candidateModel : null,
    issues,
    valid: issues.length === 0 && candidateModel !== null,
  };
}

export interface ExportPayload {
  model: ProblemModel;
  resolution?: {
    id?: number;
    status: string;
    outcomeStatus: string | null;
    methodUsed: string | null;
    engineVersion: string;
    durationMs: number | null;
    iterationCount: number;
    objectiveValue: FormattedValue | null;
    variables: VariableResult[] | null;
    constraints: ConstraintEvaluation[] | null;
    economicAnalysisAvailable: boolean;
    verification: SolveVerification | null;
  } | null;
  iterations?: IterationSnapshot[];
  includeTableaux?: boolean;
  locale?: 'fr' | 'en';
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateCsvExport(payload: ExportPayload): string {
  const { model, resolution } = payload;
  const varNames = Object.keys(model.variables);
  const lines: string[] = [];

  lines.push(['Section', 'Cle', ...varNames, 'Relation', 'Membre droit'].map(escapeCsvCell).join(','));
  lines.push(['Modele', 'Nom', model.name].map(escapeCsvCell).join(','));
  lines.push(['Modele', 'Objectif', model.sense, model.objectiveUnit ?? ''].map(escapeCsvCell).join(','));
  lines.push(
    [
      'Objectif',
      'Z',
      ...varNames.map((v) => String(model.objective[v] ?? 0)),
      '',
      '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  lines.push(
    [
      'Variables',
      'Domaine',
      ...varNames.map((v) => {
        const d = model.variables[v];
        if (d.type === 'bounded') return `[${d.lower};${d.upper}]`;
        if (d.type === 'lower_bounded') return `>=${d.lower}`;
        if (d.type === 'upper_bounded') return `<=${d.upper}`;
        return d.type;
      }),
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  model.constraints.forEach((con, idx) => {
    lines.push(
      [
        'Contrainte',
        con.name ?? `C${idx + 1}`,
        ...varNames.map((v) => String(con.coefficients[v] ?? 0)),
        con.operator,
        String(con.rhs),
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  });

  if (resolution) {
    lines.push('');
    lines.push(['Resultats', 'Statut', resolution.outcomeStatus ?? resolution.status].map(escapeCsvCell).join(','));
    lines.push(['Resultats', 'Methode', resolution.methodUsed ?? ''].map(escapeCsvCell).join(','));
    lines.push(
      [
        'Resultats',
        'Z*',
        resolution.objectiveValue?.fraction ?? '',
        resolution.objectiveValue ? String(resolution.objectiveValue.decimal) : '',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    if (resolution.variables) {
      lines.push(['Variable', 'Fraction', 'Decimale', 'Unite'].map(escapeCsvCell).join(','));
      for (const v of resolution.variables) {
        lines.push(
          [v.name, v.value.fraction, String(v.value.decimal), v.unit ?? '']
            .map(escapeCsvCell)
            .join(',')
        );
      }
    }
    if (resolution.constraints) {
      lines.push(
        ['Contrainte', 'Membre gauche', 'Rel', 'Membre droit', 'Marge', 'Saturee', 'Prix ombre']
          .map(escapeCsvCell)
          .join(',')
      );
      for (const c of resolution.constraints) {
        lines.push(
          [
            c.name,
            c.lhs.fraction,
            c.operator,
            c.rhs.fraction,
            c.slackOrSurplus.fraction,
            c.isBinding ? 'Oui' : 'Non',
            c.shadowPrice ? c.shadowPrice.fraction : '',
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
    }
  }

  // Note: Simplex tableaux are strictly excluded from CSV per Section 6.10
  return `\uFEFF${lines.join('\r\n')}`;
}

export async function generateXlsxExport(payload: ExportPayload): Promise<Buffer> {
  const { model, resolution } = payload;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Simplex Solver';
  wb.created = new Date();

  const varNames = Object.keys(model.variables);

  // Sheet 1: Modèle
  const wsModel = wb.addWorksheet('Modèle');
  wsModel.addRow(['Problème', model.name]);
  wsModel.addRow(['Objectif', model.sense === 'maximize' ? 'Maximiser' : 'Minimiser']);
  if (model.objectiveUnit) {
    wsModel.addRow(['Unité objectif', model.objectiveUnit]);
  }
  wsModel.addRow([]);

  wsModel.addRow(['Ligne', ...varNames, 'Relation', 'Membre droit']);
  wsModel.getRow(wsModel.rowCount).font = { bold: true };
  wsModel.addRow([
    'Z',
    ...varNames.map((v) => String(model.objective[v] ?? 0)),
    '',
    '',
  ]);
  model.constraints.forEach((con, idx) => {
    wsModel.addRow([
      con.name ?? `C${idx + 1}`,
      ...varNames.map((v) => String(con.coefficients[v] ?? 0)),
      con.operator,
      String(con.rhs),
    ]);
  });

  wsModel.addRow([]);
  wsModel.addRow(['Variable', 'Domaine', 'Borne inf.', 'Borne sup.', 'Unité']);
  wsModel.getRow(wsModel.rowCount).font = { bold: true };
  for (const v of varNames) {
    const def = model.variables[v];
    wsModel.addRow([
      v,
      def.type,
      def.lower ?? '',
      def.upper ?? '',
      def.unit ?? '',
    ]);
  }

  // Sheet 2: Résultats (NO simplex tableaux per Section 6.10)
  if (resolution) {
    const wsRes = wb.addWorksheet('Résultats');
    wsRes.addRow(['Statut', resolution.outcomeStatus ?? resolution.status]);
    wsRes.addRow(['Méthode', resolution.methodUsed ?? '—']);
    wsRes.addRow(['Moteur', resolution.engineVersion]);
    wsRes.addRow(['Durée (ms)', resolution.durationMs ?? '—']);
    wsRes.addRow(['Itérations', resolution.iterationCount]);
    if (resolution.objectiveValue) {
      wsRes.addRow([
        'Z* (fraction)',
        resolution.objectiveValue.fraction,
      ]);
      wsRes.addRow([
        'Z* (décimale)',
        resolution.objectiveValue.decimal,
      ]);
    }
    wsRes.addRow([]);

    if (resolution.variables) {
      wsRes.addRow(['Variable', 'Valeur (fraction)', 'Valeur (décimale)', 'Unité']);
      wsRes.getRow(wsRes.rowCount).font = { bold: true };
      for (const v of resolution.variables) {
        wsRes.addRow([v.name, v.value.fraction, v.value.decimal, v.unit ?? '']);
      }
      wsRes.addRow([]);
    }

    if (resolution.constraints) {
      wsRes.addRow([
        'Contrainte',
        'Membre gauche',
        'Rel.',
        'Membre droit',
        'Marge',
        'Saturée',
        'Prix d’ombre',
      ]);
      wsRes.getRow(wsRes.rowCount).font = { bold: true };
      for (const c of resolution.constraints) {
        wsRes.addRow([
          c.name,
          c.lhs.fraction,
          c.operator,
          c.rhs.fraction,
          c.slackOrSurplus.fraction,
          c.isBinding ? 'Oui' : 'Non',
          c.shadowPrice ? c.shadowPrice.fraction : '—',
        ]);
      }
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export function generatePdfExport(payload: ExportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const isFr = payload.locale !== 'en';
    const { model, resolution, iterations, includeTableaux } = payload;
    const varNames = Object.keys(model.variables);

    // Header
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#114855')
      .text('Simplex Solver — Rapport de modèle et résolution');
    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#4a5562')
      .text(
        `${isFr ? 'Problème' : 'Problem'}: ${model.name}   |   Date: ${new Date().toISOString().slice(0, 10)}`
      );
    doc.moveDown(0.8);

    // 1. Original Model
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#12181f')
      .text(isFr ? '1. Formulation mathématique' : '1. Mathematical formulation');
    doc.moveDown(0.3);

    const objTerms = varNames
      .map((v) => `${String(model.objective[v] ?? 0)}·${v}`)
      .join(' + ');
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(
        `${model.sense === 'maximize' ? (isFr ? 'Maximiser' : 'Maximize') : isFr ? 'Minimiser' : 'Minimize'} Z = ${objTerms}${model.objectiveUnit ? ` (${model.objectiveUnit})` : ''}`
      );
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').fontSize(10).text(isFr ? 'Contraintes :' : 'Constraints:');
    doc.font('Helvetica').fontSize(9.5);
    model.constraints.forEach((con, idx) => {
      const lhs = varNames
        .map((v) => `${String(con.coefficients[v] ?? 0)}·${v}`)
        .join(' + ');
      doc.text(`  • ${con.name ?? `C${idx + 1}`}: ${lhs} ${con.operator} ${String(con.rhs)}`);
    });
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').fontSize(10).text(isFr ? 'Domaines des variables :' : 'Variable domains:');
    doc.font('Helvetica').fontSize(9.5);
    for (const v of varNames) {
      const d = model.variables[v];
      let domainDesc: string = d.type;
      if (d.type === 'non_negative') domainDesc = 'x >= 0';
      else if (d.type === 'non_positive') domainDesc = 'x <= 0';
      else if (d.type === 'free') domainDesc = 'free (R)';
      else if (d.type === 'lower_bounded') domainDesc = `x >= ${String(d.lower ?? 0)}`;
      else if (d.type === 'upper_bounded') domainDesc = `x <= ${String(d.upper ?? 0)}`;
      else if (d.type === 'bounded') domainDesc = `${String(d.lower)} <= x <= ${String(d.upper)}`;
      doc.text(`  • ${v}: ${domainDesc}${d.unit ? ` (${d.unit})` : ''}`);
    }

    // 2. Results
    if (resolution) {
      doc.moveDown(0.9);
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#12181f')
        .text(isFr ? '2. Résultats de résolution' : '2. Solve results');
      doc.moveDown(0.3);

      doc.font('Helvetica').fontSize(10);
      doc.text(`${isFr ? 'Statut' : 'Status'}: ${resolution.outcomeStatus ?? resolution.status}`);
      doc.text(`${isFr ? 'Méthode' : 'Method'}: ${resolution.methodUsed ?? '—'}`);
      doc.text(`${isFr ? 'Itérations' : 'Iterations'}: ${resolution.iterationCount}`);
      doc.text(`${isFr ? 'Durée' : 'Duration'}: ${resolution.durationMs ?? 0} ms`);
      if (resolution.objectiveValue) {
        doc
          .font('Helvetica-Bold')
          .text(
            `Z* = ${resolution.objectiveValue.fraction} (${resolution.objectiveValue.decimal.toFixed(6)})`
          );
        doc.font('Helvetica');
      }

      if (resolution.verification) {
        doc.moveDown(0.3);
        doc.text(
          `${isFr ? 'Vérification indépendante' : 'Independent verification'}: ${resolution.verification.passed ? 'OK' : 'ECHEC'}`
        );
      }

      if (resolution.variables && resolution.variables.length > 0) {
        doc.moveDown(0.5);
        doc
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(isFr ? 'Variables optimales :' : 'Optimal variables:');
        doc.font('Courier').fontSize(9.5);
        for (const v of resolution.variables) {
          doc.text(
            `  ${v.name.padEnd(12)} = ${v.value.fraction.padEnd(12)} (${v.value.decimal.toFixed(6)})${v.unit ? ` ${v.unit}` : ''}`
          );
        }
      }

      if (resolution.constraints && resolution.constraints.length > 0) {
        doc.moveDown(0.5);
        doc
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(isFr ? 'Vérification des contraintes :' : 'Constraint verification:');
        doc.font('Courier').fontSize(9);
        for (const c of resolution.constraints) {
          const shadow = c.shadowPrice ? ` | shadow=${c.shadowPrice.fraction}` : '';
          doc.text(
            `  ${c.name.slice(0, 16).padEnd(17)} LHS=${c.lhs.fraction} ${c.operator} ${c.rhs.fraction} | slack=${c.slackOrSurplus.fraction} | ${c.isBinding ? 'SAT' : 'LIBRE'}${shadow}`
          );
        }
      }
    }

    // 3. Simplex Tableaux (PDF only per Section 6.10)
    if (includeTableaux && iterations && iterations.length > 0) {
      doc.addPage();
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#114855')
        .text(isFr ? '3. Tableaux du simplexe' : '3. Simplex tableaux');
      doc.moveDown(0.4);

      for (const snap of iterations) {
        if (doc.y > 680) {
          doc.addPage();
        }
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#12181f')
          .text(
            `Itération ${snap.iterationNumber} (Phase ${snap.phase}) — ${snap.ruleUsed} | Entrante: ${snap.enteringVariable ?? '—'} | Sortante: ${snap.leavingVariable ?? '—'}`
          );
        doc.moveDown(0.2);

        const colWidth = 9;
        const headerLine = ['Base'.padEnd(8), ...snap.columnHeaders.map((h) => h.slice(0, colWidth - 1).padStart(colWidth))].join(' ');
        doc.font('Courier').fontSize(8).fillColor('#2c3540').text(headerLine);

        snap.rows.forEach((row, rIdx) => {
          const base = (snap.basicVariables[rIdx] ?? `R${rIdx + 1}`).slice(0, 7).padEnd(8);
          const cells = row
            .map((cell) => cell.fraction.slice(0, colWidth - 1).padStart(colWidth))
            .join(' ');
          doc.text(`${base}${cells}`);
        });

        const objLine = [
          'Δj'.padEnd(8),
          ...snap.objectiveRow.map((cell) =>
            cell.fraction.slice(0, colWidth - 1).padStart(colWidth)
          ),
        ].join(' ');
        doc.font('Courier-Bold').text(objLine);
        doc.moveDown(0.6);
      }
    }

    doc.end();
  });
}
