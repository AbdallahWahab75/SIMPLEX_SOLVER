import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createApp } from '../server.ts';
import { loadServerConfig } from '../server/core/config.ts';
import { createApiV1Router } from '../server/api/v1.ts';
import { solveLinearProgram } from '../server/solver/index.ts';
import type { ProblemModel, SolverLimits } from '../server/solver/types.ts';

function listenApp(
  app: express.Express
): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Failed to bind test port');
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test('Security headers, SemVer 1.0.0, malformed JSON 400, and SQL-like ID protection', async () => {
  const { app } = createApp();
  const { server, baseUrl } = await listenApp(app);
  try {
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-powered-by'), null);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('cache-control'), 'no-store');
    assert.equal(
      healthRes.headers.get('referrer-policy'),
      'strict-origin-when-cross-origin'
    );

    const health = (await healthRes.json()) as {
      appVersion: string;
      engineVersion: string;
    };
    assert.equal(health.appVersion, '1.0.0');
    assert.equal(health.engineVersion, '1.0.0-mvp');

    // Malformed JSON must return clean 400 without stack trace
    const badJsonRes = await fetch(`${baseUrl}/api/v1/models/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name": broken',
    });
    assert.equal(badJsonRes.status, 400);
    const badJsonText = await badJsonRes.text();
    assert.ok(!badJsonText.includes('SyntaxError'));
    assert.ok(!badJsonText.includes('node_modules'));

    // SQL-like parameter tampering on protected route -> 401 (auth gate first)
    const sqliRes = await fetch(
      `${baseUrl}/api/v1/problems/${encodeURIComponent("1 OR 1=1")}`
    );
    assert.equal(sqliRes.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Rate limiter blocks excessive requests with HTTP 429 and Retry-After', async () => {
  const config = loadServerConfig();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createApiV1Router(config, {
      apiRateLimitMax: 4,
      strictRateLimitMax: 2,
    })
  );

  const { server, baseUrl } = await listenApp(app);
  try {
    for (let i = 0; i < 4; i += 1) {
      const okRes = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(okRes.status, 200);
    }

    const blockedRes = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(blockedRes.status, 429);
    assert.ok(blockedRes.headers.get('retry-after'));
    const body = (await blockedRes.json()) as { error: string };
    assert.ok(body.error.length > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Server rejects models exceeding 100 variables or 200 constraints via /models/validate', async () => {
  const { app } = createApp();
  const { server, baseUrl } = await listenApp(app);
  try {
    const overVars: Record<string, { type: 'non_negative' }> = {};
    const overObj: Record<string, number> = {};
    for (let i = 1; i <= 101; i += 1) {
      overVars[`x${i}`] = { type: 'non_negative' };
      overObj[`x${i}`] = 1;
    }

    const resVars = await fetch(`${baseUrl}/api/v1/models/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Too many vars',
        sense: 'maximize',
        objective: overObj,
        variables: overVars,
        constraints: [{ coefficients: { x1: 1 }, operator: '<=', rhs: 10 }],
      }),
    });
    assert.equal(resVars.status, 400);
    const bodyVars = (await resVars.json()) as {
      errors: Array<{ code: string }>;
    };
    assert.ok(bodyVars.errors.some((e) => e.code === 'MAX_VARIABLES_EXCEEDED'));

    const tooManyConstraints = Array.from({ length: 201 }, (_, idx) => ({
      name: `C${idx + 1}`,
      coefficients: { x1: 1 },
      operator: '<=',
      rhs: 100,
    }));

    const resCons = await fetch(`${baseUrl}/api/v1/models/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Too many constraints',
        sense: 'maximize',
        objective: { x1: 5 },
        variables: { x1: { type: 'non_negative' } },
        constraints: tooManyConstraints,
      }),
    });
    assert.equal(resCons.status, 400);
    const bodyCons = (await resCons.json()) as {
      errors: Array<{ code: string }>;
    };
    assert.ok(
      bodyCons.errors.some((e) => e.code === 'MAX_CONSTRAINTS_EXCEEDED')
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Load check: 100 variables x 200 constraints max MVP LP solves cleanly and passes independent verification', () => {
  const limits: SolverLimits = {
    maxVariables: 100,
    maxConstraints: 200,
    timeoutMs: 120_000,
    tolerance: 1e-9,
  };

  const variables: ProblemModel['variables'] = {};
  const objective: ProblemModel['objective'] = {};
  for (let i = 1; i <= 100; i += 1) {
    variables[`x${i}`] = { type: 'non_negative' };
    objective[`x${i}`] = (i % 7) + 1;
  }

  // 100 individual upper-bound constraints + 100 coupled capacity constraints = 200 constraints
  const constraints: ProblemModel['constraints'] = [];
  for (let i = 1; i <= 100; i += 1) {
    constraints.push({
      name: `Cap_${i}`,
      coefficients: { [`x${i}`]: 1 },
      operator: '<=',
      rhs: 10,
    });
  }
  for (let i = 1; i <= 100; i += 1) {
    const next = i === 100 ? 1 : i + 1;
    constraints.push({
      name: `Pair_${i}`,
      coefficients: { [`x${i}`]: 1, [`x${next}`]: 2 },
      operator: '<=',
      rhs: 24,
    });
  }

  const start = Date.now();
  const result = solveLinearProgram(
    {
      name: 'Max MVP Scale 100x200',
      sense: 'maximize',
      objective,
      variables,
      constraints,
    },
    { limits }
  );
  const elapsedMs = Date.now() - start;

  assert.ok(
    result.status === 'optimal_unique' || result.status === 'optimal_multiple'
  );
  assert.ok(result.verification);
  assert.equal(result.verification.passed, true);
  assert.ok(elapsedMs < 15_000, `Expected <15s, took ${elapsedMs}ms`);
});
