import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCsvExport,
  generatePdfExport,
  generateXlsxExport,
  previewImportModel,
} from '../server/services/importExportService.ts';
import { solveLinearProgram } from '../server/solver/index.ts';
import type { ProblemModel, SolverLimits } from '../server/solver/types.ts';

const DEFAULT_LIMITS: SolverLimits = {
  maxVariables: 100,
  maxConstraints: 200,
  timeoutMs: 120000,
  tolerance: 1e-9,
};

const SAMPLE_MODEL: ProblemModel = {
  name: 'Production',
  sense: 'maximize',
  objective: { x1: 40, x2: 30 },
  variables: {
    x1: { type: 'lower_bounded', lower: 0 },
    x2: { type: 'lower_bounded', lower: 0 },
  },
  constraints: [
    {
      name: 'Ressource A',
      coefficients: { x1: 2, x2: 1 },
      operator: '<=',
      rhs: 100,
    },
    {
      name: 'Ressource B',
      coefficients: { x1: 1, x2: 2 },
      operator: '<=',
      rhs: 80,
    },
  ],
};

test('CSV import preview parses valid spreadsheet and maps LP model cleanly', async () => {
  const csv = [
    'Ligne,x1,x2,Relation,RHS',
    'Z,40,30,,',
    'Ressource A,2,1,<=,100',
    'Ressource B,1,2,<=,80',
  ].join('\n');

  const result = await previewImportModel({
    fileName: 'production.csv',
    contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
    limits: DEFAULT_LIMITS,
  });

  assert.equal(result.fileType, 'csv');
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
  assert.ok(result.candidateModel);
  assert.equal(result.candidateModel.constraints.length, 2);
  assert.equal(result.candidateModel.objective.x1, '40');
  assert.equal(result.candidateModel.constraints[0].rhs, '100');
});

test('CSV import flags missing values, duplicate variables, and invalid operators without silent fixes', async () => {
  const badCsv = [
    'Ligne,x1,x1,Relation,RHS',
    'Z,40,abc,,',
    'C1,,1,<>,100',
  ].join('\n');

  const result = await previewImportModel({
    fileName: 'bad.csv',
    contentBase64: Buffer.from(badCsv, 'utf8').toString('base64'),
    limits: DEFAULT_LIMITS,
  });

  assert.equal(result.valid, false);
  assert.equal(result.candidateModel, null);
  assert.ok(result.issues.some((i) => i.code === 'DUPLICATE_VARIABLE'));
  assert.ok(result.issues.some((i) => i.code === 'INVALID_NUMBER'));
  assert.ok(result.issues.some((i) => i.code === 'MISSING_VALUE'));
  assert.ok(result.issues.some((i) => i.code === 'INVALID_OPERATOR'));
});

test('XLSX export and range-sliced XLSX import roundtrip without tableaux in Excel', async () => {
  const solved = solveLinearProgram(SAMPLE_MODEL, { limits: DEFAULT_LIMITS });
  const xlsxBuf = await generateXlsxExport({
    model: SAMPLE_MODEL,
    resolution: {
      status: 'completed',
      outcomeStatus: solved.status,
      methodUsed: solved.methodUsed,
      engineVersion: '1.0.0-mvp',
      durationMs: solved.durationMs,
      iterationCount: solved.iterations.length,
      objectiveValue: solved.objectiveValue,
      variables: solved.variables,
      constraints: solved.constraints,
      economicAnalysisAvailable: solved.economicAnalysisAvailable,
      verification: solved.verification,
    },
    iterations: solved.iterations,
    includeTableaux: false,
  });

  assert.ok(xlsxBuf.byteLength > 1000);

  // Preview the exact model table range A4:E7 from sheet "Modèle"
  const imported = await previewImportModel({
    fileName: 'export.xlsx',
    contentBase64: xlsxBuf.toString('base64'),
    sheetName: 'Modèle',
    range: 'A4:E7',
    limits: DEFAULT_LIMITS,
  });

  assert.equal(imported.fileType, 'xlsx');
  assert.deepEqual(imported.sheetNames, ['Modèle', 'Résultats']);
  assert.equal(imported.selectedSheet, 'Modèle');
  assert.equal(imported.rangeApplied, 'A4:E7');
  assert.equal(imported.valid, true);
  assert.ok(imported.candidateModel);
  assert.equal(imported.candidateModel.constraints.length, 2);
});

test('CSV export omits simplex tableaux and PDF export generates valid PDF with tableaux', async () => {
  const solved = solveLinearProgram(SAMPLE_MODEL, { limits: DEFAULT_LIMITS });
  const resSummary = {
    status: 'completed',
    outcomeStatus: solved.status,
    methodUsed: solved.methodUsed,
    engineVersion: '1.0.0-mvp',
    durationMs: solved.durationMs,
    iterationCount: solved.iterations.length,
    objectiveValue: solved.objectiveValue,
    variables: solved.variables,
    constraints: solved.constraints,
    economicAnalysisAvailable: solved.economicAnalysisAvailable,
    verification: solved.verification,
  };

  const csv = generateCsvExport({
    model: SAMPLE_MODEL,
    resolution: resSummary,
    iterations: solved.iterations,
    includeTableaux: true, // must still exclude tableaux in CSV
  });
  assert.ok(csv.includes('2200'));
  assert.ok(!csv.includes('Δj'));

  const pdfWithout = await generatePdfExport({
    model: SAMPLE_MODEL,
    resolution: resSummary,
    iterations: solved.iterations,
    includeTableaux: false,
    locale: 'fr',
  });
  const pdfWith = await generatePdfExport({
    model: SAMPLE_MODEL,
    resolution: resSummary,
    iterations: solved.iterations,
    includeTableaux: true,
    locale: 'fr',
  });

  assert.equal(pdfWithout.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(pdfWith.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdfWith.byteLength > pdfWithout.byteLength);
});
