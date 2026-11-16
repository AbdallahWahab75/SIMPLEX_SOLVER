import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { loadServerConfig } from '../server/core/config.js';
import { createApiV1Router } from '../server/api/v1.js';

function startTestApp(): Promise<{ server: http.Server; baseUrl: string }> {
  const config = loadServerConfig();
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', createApiV1Router(config));

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Failed to bind ephemeral port');
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test('API v1 health, model validation, limits, and auth protection', async () => {
  const { server, baseUrl } = await startTestApp();
  try {
    // 1. Health endpoint
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    const health = (await healthRes.json()) as {
      status: string;
      limits: { maxVariables: number; maxConstraints: number };
    };
    assert.equal(health.status, 'ok');
    assert.equal(health.limits.maxVariables, 100);
    assert.equal(health.limits.maxConstraints, 200);

    // 2. Valid formulation check
    const valOk = await fetch(`${baseUrl}/api/v1/models/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
        ],
      }),
    });
    assert.equal(valOk.status, 200);
    const valOkBody = (await valOk.json()) as {
      valid: boolean;
      summary: { variableCount: number; constraintCount: number };
    };
    assert.equal(valOkBody.valid, true);
    assert.equal(valOkBody.summary.variableCount, 2);
    assert.equal(valOkBody.summary.constraintCount, 1);

    // 3. Invalid formulation check (inverted bounds + unknown variable)
    const valBad = await fetch(`${baseUrl}/api/v1/models/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalide',
        sense: 'maximize',
        objective: { x1: 10, x99: 5 },
        variables: { x1: { type: 'bounded', lower: 20, upper: 5 } },
        constraints: [{ coefficients: { x1: 1 }, operator: '<=', rhs: 10 }],
      }),
    });
    assert.equal(valBad.status, 400);
    const valBadBody = (await valBad.json()) as {
      valid: boolean;
      errors: Array<{ code: string; field: string }>;
    };
    assert.equal(valBadBody.valid, false);
    assert.ok(valBadBody.errors.some((e) => e.code === 'INVERTED_BOUNDS'));
    assert.ok(
      valBadBody.errors.some((e) => e.code === 'UNKNOWN_VARIABLE_IN_OBJECTIVE')
    );

    // 4. Protected routes must reject unauthenticated requests with 401
    const unauthProblems = await fetch(`${baseUrl}/api/v1/problems`);
    assert.equal(unauthProblems.status, 401);

    const unauthCreate = await fetch(`${baseUrl}/api/v1/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unauthCreate.status, 401);

    const unauthSolve = await fetch(`${baseUrl}/api/v1/versions/1/resolutions`, {
      method: 'POST',
    });
    assert.equal(unauthSolve.status, 401);

    const unauthDashboard = await fetch(`${baseUrl}/api/v1/dashboard`);
    assert.equal(unauthDashboard.status, 401);

    const unauthCreateProject = await fetch(`${baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Projet A' }),
    });
    assert.equal(unauthCreateProject.status, 401);

    const unauthDeleteProject = await fetch(`${baseUrl}/api/v1/projects/1`, {
      method: 'DELETE',
    });
    assert.equal(unauthDeleteProject.status, 401);

    const unauthCreateFolder = await fetch(
      `${baseUrl}/api/v1/projects/1/folders`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Dossier 1' }),
      }
    );
    assert.equal(unauthCreateFolder.status, 401);

    const unauthDeleteFolder = await fetch(`${baseUrl}/api/v1/folders/1`, {
      method: 'DELETE',
    });
    assert.equal(unauthDeleteFolder.status, 401);

    const unauthDuplicate = await fetch(
      `${baseUrl}/api/v1/problems/1/duplicate`,
      {
        method: 'POST',
      }
    );
    assert.equal(unauthDuplicate.status, 401);

    const unauthImport = await fetch(`${baseUrl}/api/v1/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unauthImport.status, 401);

    const unauthExportPdf = await fetch(`${baseUrl}/api/v1/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unauthExportPdf.status, 401);

    const unauthExportXlsx = await fetch(`${baseUrl}/api/v1/export/xlsx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unauthExportXlsx.status, 401);

    const unauthInvitations = await fetch(`${baseUrl}/api/v1/invitations`);
    assert.equal(unauthInvitations.status, 401);

    const unauthSharing = await fetch(`${baseUrl}/api/v1/problems/1/sharing`);
    assert.equal(unauthSharing.status, 401);

    const unauthShareJoin = await fetch(
      `${baseUrl}/api/v1/share-links/testtoken/join`,
      { method: 'POST' }
    );
    assert.equal(unauthShareJoin.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
