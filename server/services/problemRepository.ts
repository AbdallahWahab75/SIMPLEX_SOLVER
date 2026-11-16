import crypto from 'node:crypto';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';
import {
  activityLogs,
  collaborations,
  folders,
  invitations,
  iterations,
  modelVersions,
  problems,
  projects,
  resolutions,
  shareLinks,
  userPreferences,
  users,
} from '../../src/db/schema.ts';
import type { IterationSnapshot, ProblemModel } from '../solver/types.ts';

export type CollaboratorRole = 'reader' | 'editor' | 'admin';
export type ProblemAccessRole = 'owner' | CollaboratorRole;

const MAX_COLLABORATORS_PER_PROBLEM = 5;
const INVITATION_TTL_DAYS = 7;

export class NotFoundError extends Error {
  constructor(message = 'Ressource introuvable.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(
    message = 'Vous n’avez pas les droits nécessaires pour cette action.'
  ) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  readonly code: string;
  readonly currentVersionId?: number | null;
  readonly latestVersionNumber?: number | null;

  constructor(
    message: string,
    code = 'CONFLICT',
    currentVersionId?: number | null,
    latestVersionNumber?: number | null
  ) {
    super(message);
    this.name = 'ConflictError';
    this.code = code;
    this.currentVersionId = currentVersionId;
    this.latestVersionNumber = latestVersionNumber;
  }
}

export class ValidationRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationRuleError';
  }
}

export class SharePasswordError extends Error {
  readonly passwordRequired: boolean;

  constructor(message: string, passwordRequired = true) {
    super(message);
    this.name = 'SharePasswordError';
    this.passwordRequired = passwordRequired;
  }
}

function dbFail(action: string, error: unknown): never {
  console.error(`[repo] ${action} failed:`, error);
  throw new Error(
    'Une erreur de base de données est survenue. Veuillez réessayer.',
    {
      cause: error,
    }
  );
}

function hashSharePassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifySharePassword(password: string, storedHash: string): boolean {
  const [salt, hex] = storedHash.split(':');
  if (!salt || !hex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function canRead(role: ProblemAccessRole): boolean {
  return (
    role === 'owner' ||
    role === 'admin' ||
    role === 'editor' ||
    role === 'reader'
  );
}

export function canEditModel(role: ProblemAccessRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function canEditMetadata(role: ProblemAccessRole): boolean {
  return role === 'owner' || role === 'admin';
}

export async function resolveProblemAccess(
  userId: number,
  problemId: number
): Promise<{
  problem: typeof problems.$inferSelect;
  role: ProblemAccessRole;
}> {
  const [problem] = await db
    .select()
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (!problem) {
    throw new NotFoundError('Problème introuvable.');
  }

  if (problem.ownerId === userId) {
    return { problem, role: 'owner' };
  }

  const [collab] = await db
    .select()
    .from(collaborations)
    .where(
      and(
        eq(collaborations.problemId, problemId),
        eq(collaborations.userId, userId)
      )
    )
    .limit(1);

  if (!collab) {
    throw new NotFoundError('Problème introuvable.');
  }

  const role = collab.role as CollaboratorRole;
  return { problem, role };
}

export async function logUserActivity(params: {
  userId: number;
  problemId?: number | null;
  action: string;
  metadataJson?: Record<string, unknown>;
}) {
  try {
    await db.insert(activityLogs).values({
      userId: params.userId,
      problemId: params.problemId ?? null,
      action: params.action,
      metadataJson: params.metadataJson ?? null,
    });
  } catch (error) {
    console.error('[repo] logUserActivity failed:', error);
  }
}

export async function listProblemsForUser(userId: number) {
  try {
    const collabRows = await db
      .select({
        problemId: collaborations.problemId,
        role: collaborations.role,
      })
      .from(collaborations)
      .where(eq(collaborations.userId, userId));

    const collabMap = new Map<number, CollaboratorRole>();
    const sharedProblemIds: number[] = [];
    for (const c of collabRows) {
      collabMap.set(c.problemId, c.role as CollaboratorRole);
      sharedProblemIds.push(c.problemId);
    }

    const userProblems = await db
      .select()
      .from(problems)
      .where(
        sharedProblemIds.length > 0
          ? or(
              eq(problems.ownerId, userId),
              inArray(problems.id, sharedProblemIds)
            )
          : eq(problems.ownerId, userId)
      )
      .orderBy(desc(problems.updatedAt));

    const ownerIds = Array.from(new Set(userProblems.map((p) => p.ownerId)));
    const ownerRows =
      ownerIds.length > 0
        ? await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(inArray(users.id, ownerIds))
        : [];
    const ownerEmailMap = new Map(ownerRows.map((o) => [o.id, o.email]));

    const enriched = await Promise.all(
      userProblems.map(async (p) => {
        const [currentVer] = p.currentVersionId
          ? await db
              .select({
                id: modelVersions.id,
                versionNumber: modelVersions.versionNumber,
                modelJson: modelVersions.modelJson,
                createdAt: modelVersions.createdAt,
              })
              .from(modelVersions)
              .where(eq(modelVersions.id, p.currentVersionId))
              .limit(1)
          : [];

        const [latestRes] = await db
          .select({
            id: resolutions.id,
            status: resolutions.status,
            outcomeStatus: resolutions.outcomeStatus,
            methodUsed: resolutions.methodUsed,
            objectiveValueJson: resolutions.objectiveValueJson,
            durationMs: resolutions.durationMs,
            createdAt: resolutions.createdAt,
          })
          .from(resolutions)
          .where(eq(resolutions.problemId, p.id))
          .orderBy(desc(resolutions.createdAt))
          .limit(1);

        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(resolutions)
          .where(eq(resolutions.problemId, p.id));

        const accessRole: ProblemAccessRole =
          p.ownerId === userId
            ? 'owner'
            : collabMap.get(p.id) ?? 'reader';

        return {
          ...p,
          accessRole,
          ownerEmail: ownerEmailMap.get(p.ownerId) ?? null,
          currentVersion: currentVer ?? null,
          latestResolution: latestRes ?? null,
          resolutionCount: count ?? 0,
        };
      })
    );

    return enriched;
  } catch (error) {
    dbFail('listProblemsForUser', error);
  }
}

export async function getProblemDetailForUser(
  userId: number,
  problemId: number
) {
  try {
    const { problem, role } = await resolveProblemAccess(userId, problemId);
    if (!canRead(role)) {
      throw new ForbiddenError();
    }

    const versions = await db
      .select()
      .from(modelVersions)
      .where(eq(modelVersions.problemId, problem.id))
      .orderBy(desc(modelVersions.versionNumber));

    const currentVersion =
      versions.find((v) => v.id === problem.currentVersionId) ??
      versions[0] ??
      null;

    return {
      problem: {
        ...problem,
        accessRole: role,
      },
      accessRole: role,
      currentVersion,
      versions,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('getProblemDetailForUser', error);
  }
}

export async function createProblemWithVersion(
  userId: number,
  model: ProblemModel,
  description?: string,
  note?: string
) {
  try {
    return await db.transaction(async (tx) => {
      const [problem] = await tx
        .insert(problems)
        .values({
          ownerId: userId,
          name: model.name.trim(),
          description: description?.trim() ?? null,
        })
        .returning();

      const [version] = await tx
        .insert(modelVersions)
        .values({
          problemId: problem.id,
          versionNumber: 1,
          createdById: userId,
          modelJson: model,
          note: note?.trim() ?? 'Version initiale',
        })
        .returning();

      const [updatedProblem] = await tx
        .update(problems)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(problems.id, problem.id))
        .returning();

      await tx.insert(activityLogs).values({
        userId,
        problemId: problem.id,
        action: 'problem_created',
        metadataJson: { name: updatedProblem.name, versionNumber: 1 },
      });

      return {
        problem: { ...updatedProblem, accessRole: 'owner' as ProblemAccessRole },
        version,
      };
    });
  } catch (error) {
    dbFail('createProblemWithVersion', error);
  }
}

export async function updateProblemMetadata(
  userId: number,
  problemId: number,
  updates: {
    name?: string;
    description?: string | null;
    restoreVersionId?: number;
    expectedVersionId?: number;
    projectId?: number | null;
    folderId?: number | null;
  }
) {
  try {
    const { problem: existing, role } = await resolveProblemAccess(
      userId,
      problemId
    );

    const wantsMetadataEdit =
      updates.name !== undefined ||
      updates.description !== undefined ||
      updates.projectId !== undefined ||
      updates.folderId !== undefined;

    if (wantsMetadataEdit && !canEditMetadata(role)) {
      throw new ForbiddenError(
        'Seul le propriétaire ou un administrateur peut modifier ces propriétés.'
      );
    }
    if (updates.restoreVersionId !== undefined && !canEditModel(role)) {
      throw new ForbiddenError(
        'Les lecteurs ne peuvent pas restaurer de version.'
      );
    }

    if (
      (updates.projectId !== undefined || updates.folderId !== undefined) &&
      role !== 'owner'
    ) {
      throw new ForbiddenError(
        'Seul le propriétaire peut classer ce problème dans ses projets.'
      );
    }

    return await db.transaction(async (tx) => {
      if (
        updates.expectedVersionId !== undefined &&
        existing.currentVersionId !== updates.expectedVersionId
      ) {
        const [latestVer] = existing.currentVersionId
          ? await tx
              .select({ versionNumber: modelVersions.versionNumber })
              .from(modelVersions)
              .where(eq(modelVersions.id, existing.currentVersionId))
              .limit(1)
          : [];

        await tx.insert(activityLogs).values({
          userId,
          problemId,
          action: 'edit_conflict_detected',
          metadataJson: {
            expectedVersionId: updates.expectedVersionId,
            currentVersionId: existing.currentVersionId,
          },
        });

        throw new ConflictError(
          'Conflit d’édition détecté : le modèle a été modifié entre-temps par un autre utilisateur.',
          'EDIT_CONFLICT',
          existing.currentVersionId,
          latestVer?.versionNumber ?? null
        );
      }

      if (updates.projectId !== undefined && updates.projectId !== null) {
        const [proj] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(eq(projects.id, updates.projectId), eq(projects.ownerId, userId))
          )
          .limit(1);
        if (!proj) throw new NotFoundError('Projet introuvable.');
      }

      if (updates.folderId !== undefined && updates.folderId !== null) {
        const [fold] = await tx
          .select({ id: folders.id })
          .from(folders)
          .where(
            and(eq(folders.id, updates.folderId), eq(folders.ownerId, userId))
          )
          .limit(1);
        if (!fold) throw new NotFoundError('Dossier introuvable.');
      }

      let restoredVersion = null;
      if (updates.restoreVersionId !== undefined) {
        const [sourceVer] = await tx
          .select()
          .from(modelVersions)
          .where(
            and(
              eq(modelVersions.id, updates.restoreVersionId),
              eq(modelVersions.problemId, problemId)
            )
          )
          .limit(1);

        if (!sourceVer) {
          throw new NotFoundError(
            'Version source introuvable pour ce problème.'
          );
        }

        const [{ maxVer }] = await tx
          .select({
            maxVer: sql<number>`coalesce(max(${modelVersions.versionNumber}), 0)::int`,
          })
          .from(modelVersions)
          .where(eq(modelVersions.problemId, problemId));

        const [createdVer] = await tx
          .insert(modelVersions)
          .values({
            problemId,
            versionNumber: (maxVer ?? 0) + 1,
            createdById: userId,
            modelJson: sourceVer.modelJson,
            note: `Restauration de la version v${sourceVer.versionNumber}`,
          })
          .returning();

        restoredVersion = createdVer;
      }

      const [updated] = await tx
        .update(problems)
        .set({
          ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
          ...(updates.description !== undefined
            ? { description: updates.description?.trim() ?? null }
            : {}),
          ...(updates.projectId !== undefined
            ? { projectId: updates.projectId }
            : {}),
          ...(updates.folderId !== undefined
            ? { folderId: updates.folderId }
            : {}),
          ...(restoredVersion ? { currentVersionId: restoredVersion.id } : {}),
          updatedAt: new Date(),
        })
        .where(eq(problems.id, problemId))
        .returning();

      return { problem: updated, restoredVersion };
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    dbFail('updateProblemMetadata', error);
  }
}

export async function deleteProblemPermanently(
  userId: number,
  problemId: number
) {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(problems)
        .where(eq(problems.id, problemId))
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Problème introuvable.');
      }
      if (existing.ownerId !== userId) {
        throw new ForbiddenError(
          'Seul le propriétaire peut supprimer définitivement un problème.'
        );
      }

      await tx.delete(problems).where(eq(problems.id, problemId));

      await tx.insert(activityLogs).values({
        userId,
        problemId: null,
        action: 'problem_deleted',
        metadataJson: {
          deletedProblemId: problemId,
          deletedProblemName: existing.name,
        },
      });

      return { deletedId: problemId };
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('deleteProblemPermanently', error);
  }
}

export async function createNewModelVersion(
  userId: number,
  problemId: number,
  model: ProblemModel,
  note?: string,
  expectedVersionId?: number
) {
  try {
    const { role } = await resolveProblemAccess(userId, problemId);
    if (!canEditModel(role)) {
      throw new ForbiddenError(
        'Votre rôle Lecteur ne permet pas d’enregistrer de modifications.'
      );
    }

    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(problems)
        .where(eq(problems.id, problemId))
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Problème introuvable.');
      }

      if (
        expectedVersionId !== undefined &&
        existing.currentVersionId !== null &&
        existing.currentVersionId !== expectedVersionId
      ) {
        const [latestVer] = await tx
          .select({ versionNumber: modelVersions.versionNumber })
          .from(modelVersions)
          .where(eq(modelVersions.id, existing.currentVersionId))
          .limit(1);

        await tx.insert(activityLogs).values({
          userId,
          problemId,
          action: 'edit_conflict_detected',
          metadataJson: {
            expectedVersionId,
            currentVersionId: existing.currentVersionId,
          },
        });

        throw new ConflictError(
          'Conflit d’édition détecté : une version plus récente a été enregistrée entre-temps. Rechargez le modèle avant de sauvegarder.',
          'EDIT_CONFLICT',
          existing.currentVersionId,
          latestVer?.versionNumber ?? null
        );
      }

      const [{ maxVer }] = await tx
        .select({
          maxVer: sql<number>`coalesce(max(${modelVersions.versionNumber}), 0)::int`,
        })
        .from(modelVersions)
        .where(eq(modelVersions.problemId, problemId));

      const nextVersionNumber = (maxVer ?? 0) + 1;

      const [version] = await tx
        .insert(modelVersions)
        .values({
          problemId,
          versionNumber: nextVersionNumber,
          createdById: userId,
          modelJson: model,
          note: note?.trim() ?? `Version ${nextVersionNumber}`,
        })
        .returning();

      await tx
        .update(problems)
        .set({
          name: model.name.trim(),
          currentVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(problems.id, problemId));

      await tx.insert(activityLogs).values({
        userId,
        problemId,
        action: 'version_created',
        metadataJson: { versionId: version.id, versionNumber: nextVersionNumber },
      });

      return version;
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    dbFail('createNewModelVersion', error);
  }
}

export async function listVersionsForProblem(
  userId: number,
  problemId: number
) {
  try {
    const { role } = await resolveProblemAccess(userId, problemId);
    if (!canRead(role)) throw new ForbiddenError();

    return await db
      .select()
      .from(modelVersions)
      .where(eq(modelVersions.problemId, problemId))
      .orderBy(desc(modelVersions.versionNumber));
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('listVersionsForProblem', error);
  }
}

export async function getVersionForUser(
  userId: number,
  versionId: number,
  requireWrite = false
) {
  try {
    const [version] = await db
      .select()
      .from(modelVersions)
      .where(eq(modelVersions.id, versionId))
      .limit(1);

    if (!version) {
      throw new NotFoundError('Version de modèle introuvable.');
    }

    const { role } = await resolveProblemAccess(userId, version.problemId);
    if (requireWrite && !canEditModel(role)) {
      throw new ForbiddenError(
        'Votre rôle Lecteur ne permet pas de lancer une résolution.'
      );
    }

    return version;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('getVersionForUser', error);
  }
}

export function sanitizeResolutionRow(row: typeof resolutions.$inferSelect) {
  return {
    id: row.id,
    problemId: row.problemId,
    modelVersionId: row.modelVersionId,
    status: row.status,
    outcomeStatus: row.outcomeStatus,
    methodUsed: row.methodUsed,
    engineVersion: row.engineVersion,
    durationMs: row.durationMs,
    objectiveValue: row.objectiveValueJson,
    variables: row.variablesJson,
    constraints: row.constraintsJson,
    economicAnalysisAvailable: row.economicAnalysisAvailable,
    degeneracyDetected: row.degeneracyDetected,
    blandActivated: row.blandActivated,
    verification: row.verificationJson,
    iterationCount: row.iterationCount,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    userErrorMessage:
      row.status === 'numerical_instability' || row.status === 'failed'
        ? 'Une erreur est survenue. Veuillez réessayer.'
        : null,
  };
}

export async function listResolutionsForProblem(
  userId: number,
  problemId: number
) {
  try {
    const { role } = await resolveProblemAccess(userId, problemId);
    if (!canRead(role)) throw new ForbiddenError();

    const rows = await db
      .select()
      .from(resolutions)
      .where(eq(resolutions.problemId, problemId))
      .orderBy(desc(resolutions.createdAt));

    return rows.map(sanitizeResolutionRow);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('listResolutionsForProblem', error);
  }
}

export async function getResolutionForUser(
  userId: number,
  resolutionId: number,
  requireWrite = false
) {
  try {
    const [resRow] = await db
      .select()
      .from(resolutions)
      .where(eq(resolutions.id, resolutionId))
      .limit(1);

    if (!resRow) {
      throw new NotFoundError('Résolution introuvable.');
    }

    const { role } = await resolveProblemAccess(userId, resRow.problemId);
    if (requireWrite && !canEditModel(role)) {
      throw new ForbiddenError(
        'Votre rôle Lecteur ne permet pas d’annuler cette résolution.'
      );
    }

    return sanitizeResolutionRow(resRow);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('getResolutionForUser', error);
  }
}

export async function getIterationsForResolution(
  userId: number,
  resolutionId: number
) {
  try {
    const [resRow] = await db
      .select({ id: resolutions.id, problemId: resolutions.problemId })
      .from(resolutions)
      .where(eq(resolutions.id, resolutionId))
      .limit(1);

    if (!resRow) {
      throw new NotFoundError('Résolution introuvable.');
    }

    await resolveProblemAccess(userId, resRow.problemId);

    const iterRows = await db
      .select()
      .from(iterations)
      .where(eq(iterations.resolutionId, resolutionId))
      .orderBy(iterations.iterationNumber);

    return iterRows.map((r) => r.tableauJson as IterationSnapshot);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('getIterationsForResolution', error);
  }
}

export async function getSingleIterationForResolution(
  userId: number,
  resolutionId: number,
  iterationNumber: number
) {
  try {
    const [resRow] = await db
      .select({ id: resolutions.id, problemId: resolutions.problemId })
      .from(resolutions)
      .where(eq(resolutions.id, resolutionId))
      .limit(1);

    if (!resRow) {
      throw new NotFoundError('Résolution introuvable.');
    }

    await resolveProblemAccess(userId, resRow.problemId);

    const [iterRow] = await db
      .select()
      .from(iterations)
      .where(
        and(
          eq(iterations.resolutionId, resolutionId),
          eq(iterations.iterationNumber, iterationNumber)
        )
      )
      .limit(1);

    if (!iterRow) {
      throw new NotFoundError('Itération introuvable.');
    }

    return iterRow.tableauJson as IterationSnapshot;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('getSingleIterationForResolution', error);
  }
}

export async function getUserPreferences(userId: number) {
  try {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    return (
      prefs ?? {
        userId,
        locale: 'fr',
        theme: 'light',
        numberFormat: 'both',
        decimalPrecision: 4,
      }
    );
  } catch (error) {
    dbFail('getUserPreferences', error);
  }
}

export async function updateUserPreferences(
  userId: number,
  updates: {
    locale?: 'fr' | 'en';
    theme?: 'light' | 'dark';
    numberFormat?: 'fraction' | 'decimal' | 'both';
    decimalPrecision?: number;
  }
) {
  try {
    const [updated] = await db
      .insert(userPreferences)
      .values({
        userId,
        locale: updates.locale ?? 'fr',
        theme: updates.theme ?? 'light',
        numberFormat: updates.numberFormat ?? 'both',
        decimalPrecision: updates.decimalPrecision ?? 4,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          ...(updates.locale ? { locale: updates.locale } : {}),
          ...(updates.theme ? { theme: updates.theme } : {}),
          ...(updates.numberFormat ? { numberFormat: updates.numberFormat } : {}),
          ...(updates.decimalPrecision !== undefined
            ? { decimalPrecision: updates.decimalPrecision }
            : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    return updated;
  } catch (error) {
    dbFail('updateUserPreferences', error);
  }
}

export async function duplicateProblemForUser(
  userId: number,
  problemId: number
) {
  try {
    const { problem: existing } = await resolveProblemAccess(userId, problemId);

    return await db.transaction(async (tx) => {
      const [sourceVersion] = existing.currentVersionId
        ? await tx
            .select()
            .from(modelVersions)
            .where(eq(modelVersions.id, existing.currentVersionId))
            .limit(1)
        : await tx
            .select()
            .from(modelVersions)
            .where(eq(modelVersions.problemId, existing.id))
            .orderBy(desc(modelVersions.versionNumber))
            .limit(1);

      if (!sourceVersion) {
        throw new NotFoundError(
          'Aucune version de modèle disponible à dupliquer.'
        );
      }

      const copiedName = `${existing.name} (copie)`;
      const sourceModel = sourceVersion.modelJson as ProblemModel;
      const copiedModel: ProblemModel = {
        ...sourceModel,
        name: copiedName,
      };

      const isOwnProblem = existing.ownerId === userId;

      const [newProblem] = await tx
        .insert(problems)
        .values({
          ownerId: userId,
          projectId: isOwnProblem ? existing.projectId : null,
          folderId: isOwnProblem ? existing.folderId : null,
          name: copiedName,
          description: existing.description,
        })
        .returning();

      const [newVersion] = await tx
        .insert(modelVersions)
        .values({
          problemId: newProblem.id,
          versionNumber: 1,
          createdById: userId,
          modelJson: copiedModel,
          note: `Dupliqué depuis "${existing.name}"`,
        })
        .returning();

      const [finalProblem] = await tx
        .update(problems)
        .set({ currentVersionId: newVersion.id, updatedAt: new Date() })
        .where(eq(problems.id, newProblem.id))
        .returning();

      await tx.insert(activityLogs).values({
        userId,
        problemId: finalProblem.id,
        action: 'problem_duplicated',
        metadataJson: { sourceProblemId: problemId, name: copiedName },
      });

      return {
        problem: { ...finalProblem, accessRole: 'owner' as ProblemAccessRole },
        version: newVersion,
      };
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('duplicateProblemForUser', error);
  }
}

export async function getDashboardSummary(userId: number) {
  try {
    const [{ totalProblems }] = await db
      .select({ totalProblems: sql<number>`count(*)::int` })
      .from(problems)
      .where(eq(problems.ownerId, userId));

    const [{ totalResolutions }] = await db
      .select({ totalResolutions: sql<number>`count(*)::int` })
      .from(resolutions)
      .innerJoin(problems, eq(resolutions.problemId, problems.id))
      .where(eq(problems.ownerId, userId));

    const [{ successfulResolutions }] = await db
      .select({ successfulResolutions: sql<number>`count(*)::int` })
      .from(resolutions)
      .innerJoin(problems, eq(resolutions.problemId, problems.id))
      .where(
        and(eq(problems.ownerId, userId), eq(resolutions.status, 'completed'))
      );

    const [{ failedResolutions }] = await db
      .select({ failedResolutions: sql<number>`count(*)::int` })
      .from(resolutions)
      .innerJoin(problems, eq(resolutions.problemId, problems.id))
      .where(
        and(
          eq(problems.ownerId, userId),
          sql`${resolutions.status} IN ('failed', 'numerical_instability', 'timed_out', 'cancelled')`
        )
      );

    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(desc(projects.updatedAt));

    const userFolders = await db
      .select()
      .from(folders)
      .where(eq(folders.ownerId, userId))
      .orderBy(folders.name);

    const recentActivity = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(12);

    return {
      stats: {
        totalProblems: totalProblems ?? 0,
        totalResolutions: totalResolutions ?? 0,
        successfulResolutions: successfulResolutions ?? 0,
        failedResolutions: failedResolutions ?? 0,
      },
      projects: userProjects,
      folders: userFolders,
      recentActivity,
    };
  } catch (error) {
    dbFail('getDashboardSummary', error);
  }
}

export async function createProjectForUser(
  userId: number,
  name: string,
  description?: string
) {
  try {
    const [created] = await db
      .insert(projects)
      .values({
        ownerId: userId,
        name: name.trim(),
        description: description?.trim() ?? null,
      })
      .returning();
    return created;
  } catch (error) {
    dbFail('createProjectForUser', error);
  }
}

export async function deleteProjectForUser(userId: number, projectId: number) {
  try {
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Projet introuvable.');
    await db.delete(projects).where(eq(projects.id, projectId));
    return { deletedId: projectId };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    dbFail('deleteProjectForUser', error);
  }
}

export async function createFolderForUser(
  userId: number,
  projectId: number,
  name: string
) {
  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);
    if (!project) throw new NotFoundError('Projet introuvable.');

    const [created] = await db
      .insert(folders)
      .values({
        ownerId: userId,
        projectId,
        name: name.trim(),
      })
      .returning();
    return created;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    dbFail('createFolderForUser', error);
  }
}

export async function deleteFolderForUser(userId: number, folderId: number) {
  try {
    const [existing] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.ownerId, userId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Dossier introuvable.');
    await db.delete(folders).where(eq(folders.id, folderId));
    return { deletedId: folderId };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    dbFail('deleteFolderForUser', error);
  }
}

// ============================================================
// Collaboration, Invitations & Share Links (Step 5)
// ============================================================

export async function getProblemSharingState(
  userId: number,
  problemId: number
) {
  try {
    const { problem, role } = await resolveProblemAccess(userId, problemId);
    const [owner] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, problem.ownerId))
      .limit(1);

    const collabRows = await db
      .select({
        id: collaborations.id,
        userId: collaborations.userId,
        role: collaborations.role,
        createdAt: collaborations.createdAt,
        email: users.email,
        displayName: users.displayName,
      })
      .from(collaborations)
      .innerJoin(users, eq(collaborations.userId, users.id))
      .where(eq(collaborations.problemId, problemId))
      .orderBy(collaborations.createdAt);

    const isOwner = role === 'owner';

    const inviteRows = isOwner
      ? await db
          .select({
            id: invitations.id,
            email: invitations.email,
            role: invitations.role,
            token: invitations.token,
            status: invitations.status,
            expiresAt: invitations.expiresAt,
            createdAt: invitations.createdAt,
          })
          .from(invitations)
          .where(
            and(
              eq(invitations.problemId, problemId),
              eq(invitations.status, 'pending')
            )
          )
          .orderBy(desc(invitations.createdAt))
      : [];

    const rawLinks = isOwner
      ? await db
          .select()
          .from(shareLinks)
          .where(
            and(
              eq(shareLinks.problemId, problemId),
              sql`${shareLinks.revokedAt} IS NULL`
            )
          )
          .orderBy(desc(shareLinks.createdAt))
      : [];

    const links = rawLinks.map((l) => ({
      id: l.id,
      token: l.token,
      role: l.role,
      hasPassword: Boolean(l.passwordHash),
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
    }));

    const problemActivity = await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        metadataJson: activityLogs.metadataJson,
        createdAt: activityLogs.createdAt,
        actorEmail: users.email,
      })
      .from(activityLogs)
      .innerJoin(users, eq(activityLogs.userId, users.id))
      .where(eq(activityLogs.problemId, problemId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(20);

    return {
      problemId,
      problemName: problem.name,
      accessRole: role,
      isOwner,
      maxCollaborators: MAX_COLLABORATORS_PER_PROBLEM,
      owner: owner ?? null,
      collaborators: collabRows,
      invitations: inviteRows.filter((inv) => inv.expiresAt > new Date()),
      shareLinks: links.filter((l) => l.expiresAt > new Date()),
      activity: problemActivity,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('getProblemSharingState', error);
  }
}

export async function inviteCollaborator(
  ownerId: number,
  problemId: number,
  targetEmailRaw: string,
  role: CollaboratorRole
) {
  try {
    const email = targetEmailRaw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationRuleError('Adresse e-mail invalide.');
    }

    const { problem, role: actorRole } = await resolveProblemAccess(
      ownerId,
      problemId
    );
    if (actorRole !== 'owner') {
      throw new ForbiddenError(
        'Seul le propriétaire gère les invitations et les rôles.'
      );
    }

    const [ownerUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);

    if (ownerUser && ownerUser.email.toLowerCase() === email) {
      throw new ValidationRuleError(
        'Vous êtes déjà propriétaire de ce problème.'
      );
    }

    return await db.transaction(async (tx) => {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(collaborations)
        .where(eq(collaborations.problemId, problemId));

      if ((count ?? 0) >= MAX_COLLABORATORS_PER_PROBLEM) {
        throw new ValidationRuleError(
          `Limite atteinte : maximum ${MAX_COLLABORATORS_PER_PROBLEM} collaborateurs actifs par problème.`
        );
      }

      // Check if user already collaborator
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);

      if (existingUser) {
        const [existingCollab] = await tx
          .select({ id: collaborations.id })
          .from(collaborations)
          .where(
            and(
              eq(collaborations.problemId, problemId),
              eq(collaborations.userId, existingUser.id)
            )
          )
          .limit(1);
        if (existingCollab) {
          throw new ValidationRuleError(
            'Cet utilisateur est déjà collaborateur sur ce problème.'
          );
        }
      }

      // Revoke any previous pending invite for the same email/problem
      await tx
        .update(invitations)
        .set({ status: 'revoked' })
        .where(
          and(
            eq(invitations.problemId, problemId),
            eq(invitations.email, email),
            eq(invitations.status, 'pending')
          )
        );

      const expiresAt = new Date(
        Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000
      );
      const token = crypto.randomBytes(24).toString('hex');

      const [created] = await tx
        .insert(invitations)
        .values({
          problemId,
          invitedById: ownerId,
          email,
          role,
          token,
          status: 'pending',
          expiresAt,
        })
        .returning();

      await tx.insert(activityLogs).values({
        userId: ownerId,
        problemId,
        action: 'invitation_sent',
        metadataJson: { email, role, problemName: problem.name },
      });

      return created;
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof ValidationRuleError
    ) {
      throw error;
    }
    dbFail('inviteCollaborator', error);
  }
}

export async function listPendingInvitationsForUser(userEmail: string) {
  try {
    const emailLower = userEmail.trim().toLowerCase();
    const rows = await db
      .select({
        id: invitations.id,
        problemId: invitations.problemId,
        problemName: problems.name,
        role: invitations.role,
        token: invitations.token,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        inviterEmail: users.email,
      })
      .from(invitations)
      .innerJoin(problems, eq(invitations.problemId, problems.id))
      .innerJoin(users, eq(invitations.invitedById, users.id))
      .where(
        and(
          sql`lower(${invitations.email}) = ${emailLower}`,
          eq(invitations.status, 'pending'),
          sql`${invitations.expiresAt} > now()`
        )
      )
      .orderBy(desc(invitations.createdAt));

    return rows;
  } catch (error) {
    dbFail('listPendingInvitationsForUser', error);
  }
}

export async function acceptInvitationByToken(
  userId: number,
  userEmail: string,
  token: string
) {
  try {
    return await db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.token, token))
        .limit(1);

      if (!inv) {
        throw new NotFoundError('Invitation introuvable.');
      }
      if (inv.status !== 'pending') {
        throw new ValidationRuleError(
          'Cette invitation a déjà été utilisée ou révoquée.'
        );
      }
      if (inv.expiresAt <= new Date()) {
        await tx
          .update(invitations)
          .set({ status: 'expired' })
          .where(eq(invitations.id, inv.id));
        throw new ValidationRuleError('Cette invitation a expiré (validité 7 jours).');
      }
      if (inv.email.toLowerCase() !== userEmail.trim().toLowerCase()) {
        throw new ForbiddenError(
          'Cette invitation est destinée à une autre adresse e-mail.'
        );
      }

      const [existingCollab] = await tx
        .select()
        .from(collaborations)
        .where(
          and(
            eq(collaborations.problemId, inv.problemId),
            eq(collaborations.userId, userId)
          )
        )
        .limit(1);

      if (!existingCollab) {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(collaborations)
          .where(eq(collaborations.problemId, inv.problemId));

        if ((count ?? 0) >= MAX_COLLABORATORS_PER_PROBLEM) {
          throw new ValidationRuleError(
            `Impossible d’accepter : ce problème a atteint la limite de ${MAX_COLLABORATORS_PER_PROBLEM} collaborateurs actifs.`
          );
        }

        await tx.insert(collaborations).values({
          problemId: inv.problemId,
          userId,
          role: inv.role,
          invitedById: inv.invitedById,
        });
      }

      await tx
        .update(invitations)
        .set({ status: 'accepted', acceptedById: userId })
        .where(eq(invitations.id, inv.id));

      await tx.insert(activityLogs).values({
        userId,
        problemId: inv.problemId,
        action: 'invitation_accepted',
        metadataJson: { role: inv.role },
      });

      return { problemId: inv.problemId, role: inv.role };
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof ValidationRuleError
    ) {
      throw error;
    }
    dbFail('acceptInvitationByToken', error);
  }
}

export async function revokeInvitationForOwner(
  ownerId: number,
  problemId: number,
  invitationId: number
) {
  try {
    const { role } = await resolveProblemAccess(ownerId, problemId);
    if (role !== 'owner') {
      throw new ForbiddenError('Seul le propriétaire gère les invitations.');
    }

    const [updated] = await db
      .update(invitations)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.problemId, problemId)
        )
      )
      .returning();

    if (!updated) throw new NotFoundError('Invitation introuvable.');

    await logUserActivity({
      userId: ownerId,
      problemId,
      action: 'invitation_revoked',
      metadataJson: { email: updated.email },
    });

    return { revokedId: invitationId };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('revokeInvitationForOwner', error);
  }
}

export async function updateCollaboratorRoleForOwner(
  ownerId: number,
  problemId: number,
  collaboratorUserId: number,
  nextRole: CollaboratorRole
) {
  try {
    const { role } = await resolveProblemAccess(ownerId, problemId);
    if (role !== 'owner') {
      throw new ForbiddenError('Seul le propriétaire modifie les rôles.');
    }

    const [updated] = await db
      .update(collaborations)
      .set({ role: nextRole, updatedAt: new Date() })
      .where(
        and(
          eq(collaborations.problemId, problemId),
          eq(collaborations.userId, collaboratorUserId)
        )
      )
      .returning();

    if (!updated) throw new NotFoundError('Collaborateur introuvable.');

    await logUserActivity({
      userId: ownerId,
      problemId,
      action: 'collaborator_role_updated',
      metadataJson: { targetUserId: collaboratorUserId, role: nextRole },
    });

    return updated;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('updateCollaboratorRoleForOwner', error);
  }
}

export async function revokeCollaboratorForOwner(
  ownerId: number,
  problemId: number,
  collaboratorUserId: number
) {
  try {
    const { role } = await resolveProblemAccess(ownerId, problemId);
    if (role !== 'owner') {
      throw new ForbiddenError('Seul le propriétaire révoque les droits.');
    }

    const deleted = await db
      .delete(collaborations)
      .where(
        and(
          eq(collaborations.problemId, problemId),
          eq(collaborations.userId, collaboratorUserId)
        )
      )
      .returning();

    if (!deleted[0]) throw new NotFoundError('Collaborateur introuvable.');

    await logUserActivity({
      userId: ownerId,
      problemId,
      action: 'collaborator_revoked',
      metadataJson: { targetUserId: collaboratorUserId },
    });

    return { revokedUserId: collaboratorUserId };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('revokeCollaboratorForOwner', error);
  }
}

export async function createShareLinkForOwner(
  ownerId: number,
  problemId: number,
  options: {
    role: 'reader' | 'editor';
    expiresInDays?: number;
    password?: string;
  }
) {
  try {
    const { role } = await resolveProblemAccess(ownerId, problemId);
    if (role !== 'owner') {
      throw new ForbiddenError(
        'Seul le propriétaire peut créer un lien de partage.'
      );
    }

    const days =
      options.expiresInDays &&
      Number.isInteger(options.expiresInDays) &&
      options.expiresInDays >= 1 &&
      options.expiresInDays <= 365
        ? options.expiresInDays
        : 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const token = crypto.randomBytes(24).toString('hex');
    const passwordHash =
      options.password && options.password.trim()
        ? hashSharePassword(options.password.trim())
        : null;

    const [created] = await db
      .insert(shareLinks)
      .values({
        problemId,
        createdById: ownerId,
        token,
        role: options.role,
        passwordHash,
        expiresAt,
      })
      .returning();

    await logUserActivity({
      userId: ownerId,
      problemId,
      action: 'share_link_created',
      metadataJson: {
        role: options.role,
        expiresInDays: days,
        hasPassword: Boolean(passwordHash),
      },
    });

    return {
      id: created.id,
      token: created.token,
      role: created.role,
      hasPassword: Boolean(created.passwordHash),
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('createShareLinkForOwner', error);
  }
}

export async function revokeShareLinkForOwner(
  ownerId: number,
  problemId: number,
  linkId: number
) {
  try {
    const { role } = await resolveProblemAccess(ownerId, problemId);
    if (role !== 'owner') {
      throw new ForbiddenError(
        'Seul le propriétaire peut révoquer un lien de partage.'
      );
    }

    const [updated] = await db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(shareLinks.id, linkId), eq(shareLinks.problemId, problemId))
      )
      .returning();

    if (!updated) throw new NotFoundError('Lien de partage introuvable.');

    await logUserActivity({
      userId: ownerId,
      problemId,
      action: 'share_link_revoked',
      metadataJson: { linkId },
    });

    return { revokedId: linkId };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError)
      throw error;
    dbFail('revokeShareLinkForOwner', error);
  }
}

export async function redeemShareLinkForUser(
  userId: number,
  token: string,
  password?: string
) {
  try {
    const [link] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, token))
      .limit(1);

    if (!link || link.revokedAt !== null) {
      throw new NotFoundError('Lien de partage invalide ou révoqué.');
    }
    if (link.expiresAt <= new Date()) {
      throw new ValidationRuleError('Ce lien de partage a expiré.');
    }

    if (link.passwordHash) {
      if (!password || !password.trim()) {
        throw new SharePasswordError(
          'Un mot de passe est requis pour accéder à ce lien de partage.',
          true
        );
      }
      if (!verifySharePassword(password.trim(), link.passwordHash)) {
        throw new SharePasswordError('Mot de passe incorrect.', true);
      }
    }

    const [problem] = await db
      .select()
      .from(problems)
      .where(eq(problems.id, link.problemId))
      .limit(1);

    if (!problem) {
      throw new NotFoundError('Problème introuvable.');
    }

    if (problem.ownerId === userId) {
      return { problemId: problem.id, role: 'owner' as ProblemAccessRole };
    }

    const [existing] = await db
      .select()
      .from(collaborations)
      .where(
        and(
          eq(collaborations.problemId, problem.id),
          eq(collaborations.userId, userId)
        )
      )
      .limit(1);

    if (!existing) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(collaborations)
        .where(eq(collaborations.problemId, problem.id));

      if ((count ?? 0) >= MAX_COLLABORATORS_PER_PROBLEM) {
        throw new ValidationRuleError(
          `Ce problème a déjà atteint la limite maximale de ${MAX_COLLABORATORS_PER_PROBLEM} collaborateurs actifs.`
        );
      }

      await db.insert(collaborations).values({
        problemId: problem.id,
        userId,
        role: link.role,
        invitedById: link.createdById,
      });

      await logUserActivity({
        userId,
        problemId: problem.id,
        action: 'share_link_joined',
        metadataJson: { role: link.role },
      });
    }

    return {
      problemId: problem.id,
      role: (existing?.role ?? link.role) as ProblemAccessRole,
    };
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationRuleError ||
      error instanceof SharePasswordError
    ) {
      throw error;
    }
    dbFail('redeemShareLinkForUser', error);
  }
}
