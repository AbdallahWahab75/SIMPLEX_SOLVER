import { eq } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';
import {
  activityLogs,
  iterations,
  resolutions,
} from '../../src/db/schema.ts';
import type { ServerConfig } from '../core/config.ts';
import { solveLinearProgram } from '../solver/index.ts';
import type { ProblemModel, SolveResult } from '../solver/types.ts';
import {
  ForbiddenError,
  NotFoundError,
  canEditModel,
  resolveProblemAccess,
} from '../services/problemRepository.ts';

interface ActiveJob {
  controller: AbortController;
  cancelledBeforeStart: boolean;
}

const activeJobs = new Map<number, ActiveJob>();

function mapSolveStatusToResolutionStatus(status: SolveResult['status']): string {
  switch (status) {
    case 'optimal_unique':
    case 'optimal_multiple':
    case 'infeasible':
    case 'unbounded':
      return 'completed';
    case 'numerical_instability':
      return 'numerical_instability';
    case 'timed_out':
      return 'timed_out';
    case 'cancelled':
      return 'cancelled';
    case 'invalid_model':
    case 'failed':
    default:
      return 'failed';
  }
}

async function executeResolutionJob(
  resolutionId: number,
  problemId: number,
  userId: number,
  model: ProblemModel,
  config: ServerConfig
) {
  const job = activeJobs.get(resolutionId);
  if (!job || job.cancelledBeforeStart) {
    activeJobs.delete(resolutionId);
    return;
  }

  try {
    await db
      .update(resolutions)
      .set({ status: 'running' })
      .where(eq(resolutions.id, resolutionId));

    const result = solveLinearProgram(model, {
      limits: config.limits,
      signal: job.controller.signal,
      engineVersion: config.engineVersion,
    });

    const mappedStatus = mapSolveStatusToResolutionStatus(result.status);

    await db.transaction(async (tx) => {
      if (result.iterations.length > 0) {
        const iterationRows = result.iterations.map((snap) => ({
          resolutionId,
          iterationNumber: snap.iterationNumber,
          phase: snap.phase,
          tableauJson: snap,
          enteringVariable: snap.enteringVariable,
          leavingVariable: snap.leavingVariable,
          pivotRow: snap.pivotRow,
          pivotColumn: snap.pivotColumn,
          ruleUsed: snap.ruleUsed,
          isDegenerate: snap.isDegenerate,
        }));
        await tx.insert(iterations).values(iterationRows);
      }

      await tx
        .update(resolutions)
        .set({
          status: mappedStatus,
          outcomeStatus: result.status,
          methodUsed: result.methodUsed,
          durationMs: result.durationMs,
          objectiveValueJson: result.objectiveValue,
          variablesJson: result.variables,
          constraintsJson: result.constraints,
          economicAnalysisAvailable: result.economicAnalysisAvailable,
          degeneracyDetected: result.degeneracyDetected,
          blandActivated: result.blandActivated,
          verificationJson: result.verification,
          iterationCount: result.iterationCount,
          internalDiagnosticsJson: result.internalDiagnostics,
          completedAt: new Date(),
        })
        .where(eq(resolutions.id, resolutionId));

      await tx.insert(activityLogs).values({
        userId,
        problemId,
        action: 'resolution_finished',
        metadataJson: {
          resolutionId,
          status: mappedStatus,
          outcomeStatus: result.status,
          durationMs: result.durationMs,
        },
      });
    });
  } catch (error) {
    console.error(`[queue] Resolution ${resolutionId} execution error:`, error);
    try {
      await db
        .update(resolutions)
        .set({
          status: 'failed',
          outcomeStatus: 'failed',
          internalDiagnosticsJson: [
            error instanceof Error ? error.message : 'Unexpected worker error',
          ],
          completedAt: new Date(),
        })
        .where(eq(resolutions.id, resolutionId));
    } catch (persistErr) {
      console.error(
        `[queue] Failed to persist failure status for resolution ${resolutionId}:`,
        persistErr
      );
    }
  } finally {
    activeJobs.delete(resolutionId);
  }
}

export async function enqueueResolution(params: {
  problemId: number;
  modelVersionId: number;
  requestedById: number;
  model: ProblemModel;
  config: ServerConfig;
}) {
  const { problemId, modelVersionId, requestedById, model, config } = params;

  try {
    const [created] = await db
      .insert(resolutions)
      .values({
        problemId,
        modelVersionId,
        requestedById,
        status: 'queued',
        engineVersion: config.engineVersion,
      })
      .returning();

    const controller = new AbortController();
    activeJobs.set(created.id, {
      controller,
      cancelledBeforeStart: false,
    });

    setImmediate(() => {
      void executeResolutionJob(
        created.id,
        problemId,
        requestedById,
        model,
        config
      );
    });

    return {
      resolutionId: created.id,
      problemId,
      modelVersionId,
      status: created.status,
      engineVersion: created.engineVersion,
      createdAt: created.createdAt,
    };
  } catch (error) {
    console.error('[queue] Failed to enqueue resolution:', error);
    throw new Error('Impossible de planifier la résolution.', { cause: error });
  }
}

export async function cancelResolution(userId: number, resolutionId: number) {
  try {
    const rows = await db
      .select()
      .from(resolutions)
      .where(eq(resolutions.id, resolutionId))
      .limit(1);

    const resRow = rows[0];
    if (!resRow) {
      throw new NotFoundError('Résolution introuvable.');
    }

    const access = await resolveProblemAccess(userId, resRow.problemId);
    if (!canEditModel(access.role)) {
      throw new ForbiddenError(
        'Un lecteur ne peut pas annuler une résolution.'
      );
    }

    if (resRow.status !== 'queued' && resRow.status !== 'running') {
      return {
        resolutionId: resRow.id,
        status: resRow.status,
        cancelled: false,
      };
    }

    const active = activeJobs.get(resolutionId);
    if (active) {
      active.cancelledBeforeStart = true;
      active.controller.abort();
    }

    const [updated] = await db
      .update(resolutions)
      .set({
        status: 'cancelled',
        outcomeStatus: 'cancelled',
        completedAt: new Date(),
      })
      .where(eq(resolutions.id, resolutionId))
      .returning();

    return {
      resolutionId: updated.id,
      status: updated.status,
      cancelled: true,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      throw error;
    }
    console.error('[queue] Failed to cancel resolution:', error);
    throw new Error('Impossible d’annuler la résolution.', { cause: error });
  }
}
