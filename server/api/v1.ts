import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import type { ServerConfig } from '../core/config.ts';
import { createRateLimiter } from '../core/rateLimit.ts';
import { validateAndParseModel } from '../solver/validator.ts';
import type { ProblemModel } from '../solver/types.ts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SharePasswordError,
  ValidationRuleError,
  acceptInvitationByToken,
  createFolderForUser,
  createNewModelVersion,
  createProblemWithVersion,
  createProjectForUser,
  createShareLinkForOwner,
  deleteFolderForUser,
  deleteProblemPermanently,
  deleteProjectForUser,
  duplicateProblemForUser,
  getDashboardSummary,
  getIterationsForResolution,
  getProblemDetailForUser,
  getProblemSharingState,
  getResolutionForUser,
  getSingleIterationForResolution,
  getUserPreferences,
  getVersionForUser,
  inviteCollaborator,
  listPendingInvitationsForUser,
  listProblemsForUser,
  listResolutionsForProblem,
  listVersionsForProblem,
  logUserActivity,
  redeemShareLinkForUser,
  revokeCollaboratorForOwner,
  revokeInvitationForOwner,
  revokeShareLinkForOwner,
  updateCollaboratorRoleForOwner,
  updateProblemMetadata,
  updateUserPreferences,
  type CollaboratorRole,
} from '../services/problemRepository.ts';
import {
  generateCsvExport,
  generatePdfExport,
  generateXlsxExport,
  previewImportModel,
  type ExportPayload,
  type ImportMapping,
} from '../services/importExportService.ts';
import { cancelResolution, enqueueResolution } from '../workers/solveQueue.ts';

function parsePositiveId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') return null;
  if (!/^\d+$/.test(raw)) return null;
  const num = Number.parseInt(raw, 10);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function handleError(res: Response, error: unknown) {
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof ForbiddenError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof SharePasswordError) {
    res.status(403).json({
      error: error.message,
      passwordRequired: error.passwordRequired,
    });
    return;
  }
  if (error instanceof ConflictError) {
    res.status(409).json({
      error: error.message,
      code: error.code,
      currentVersionId: error.currentVersionId ?? null,
      latestVersionNumber: error.latestVersionNumber ?? null,
    });
    return;
  }
  if (error instanceof ValidationRuleError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error('[api] Unhandled server error:', error);
  res
    .status(500)
    .json({ error: 'Une erreur interne est survenue. Veuillez réessayer.' });
}

function sanitizeFileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'simplex-model';
}

export interface ApiRouterOptions {
  apiRateLimitMax?: number;
  strictRateLimitMax?: number;
}

export function createApiV1Router(
  config: ServerConfig,
  options: ApiRouterOptions = {}
): Router {
  const router = Router();

  const apiLimiter = createRateLimiter({
    windowMs: 60_000,
    max: options.apiRateLimitMax ?? 180,
    keyPrefix: 'v1-general',
  });

  const strictActionLimiter = createRateLimiter({
    windowMs: 60_000,
    max: options.strictRateLimitMax ?? 30,
    keyPrefix: 'v1-strict',
    message:
      'Limite de débit atteinte pour les calculs, imports ou accès partagés. Veuillez patienter une minute.',
  });

  router.use(apiLimiter);

  // Public health check (does not probe DB)
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'simplex-solver',
      appVersion: config.appVersion,
      engineVersion: config.engineVersion,
      limits: config.limits,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Public formulation validator (pure server-side validation, no DB write)
  router.post('/models/validate', (req: Request, res: Response) => {
    const result = validateAndParseModel(req.body, config.limits);
    if (!result.valid) {
      res.status(400).json({
        valid: false,
        errors: result.issues,
      });
      return;
    }
    res.json({
      valid: true,
      errors: [],
      summary: {
        name: result.parsed.name,
        sense: result.parsed.sense,
        variableCount: result.parsed.variableOrder.length,
        constraintCount: result.parsed.constraints.length,
      },
    });
  });

  // Authenticated user & preferences endpoints
  router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const prefs = await getUserPreferences(req.dbUser!.id);
      res.json({
        user: {
          id: req.dbUser!.id,
          email: req.dbUser!.email,
          displayName: req.dbUser!.displayName,
        },
        preferences: prefs,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.patch(
    '/me/preferences',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const updates: {
          locale?: 'fr' | 'en';
          theme?: 'light' | 'dark';
          numberFormat?: 'fraction' | 'decimal' | 'both';
          decimalPrecision?: number;
        } = {};

        if (body.locale === 'fr' || body.locale === 'en') {
          updates.locale = body.locale;
        }
        if (body.theme === 'light' || body.theme === 'dark') {
          updates.theme = body.theme;
        }
        if (
          body.numberFormat === 'fraction' ||
          body.numberFormat === 'decimal' ||
          body.numberFormat === 'both'
        ) {
          updates.numberFormat = body.numberFormat;
        }
        if (
          typeof body.decimalPrecision === 'number' &&
          Number.isInteger(body.decimalPrecision) &&
          body.decimalPrecision >= 0 &&
          body.decimalPrecision <= 12
        ) {
          updates.decimalPrecision = body.decimalPrecision;
        }

        const prefs = await updateUserPreferences(req.dbUser!.id, updates);
        res.json({ preferences: prefs });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // Dashboard, Projects & Folders
  router.get(
    '/dashboard',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const summary = await getDashboardSummary(req.dbUser!.id);
        res.json(summary);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/projects',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const body = req.body as { name?: unknown; description?: unknown };
      if (typeof body.name !== 'string' || !body.name.trim()) {
        res.status(400).json({ error: 'Le nom du projet est requis.' });
        return;
      }
      try {
        const project = await createProjectForUser(
          req.dbUser!.id,
          body.name,
          typeof body.description === 'string' ? body.description : undefined
        );
        res.status(201).json({ project });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.delete(
    '/projects/:projectId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const projectId = parsePositiveId(req.params.projectId);
      if (!projectId) {
        res.status(400).json({ error: 'Identifiant de projet invalide.' });
        return;
      }
      try {
        const result = await deleteProjectForUser(req.dbUser!.id, projectId);
        res.json(result);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/projects/:projectId/folders',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const projectId = parsePositiveId(req.params.projectId);
      const body = req.body as { name?: unknown };
      if (!projectId || typeof body.name !== 'string' || !body.name.trim()) {
        res.status(400).json({ error: 'Projet ou nom de dossier invalide.' });
        return;
      }
      try {
        const folder = await createFolderForUser(
          req.dbUser!.id,
          projectId,
          body.name
        );
        res.status(201).json({ folder });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.delete(
    '/folders/:folderId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const folderId = parsePositiveId(req.params.folderId);
      if (!folderId) {
        res.status(400).json({ error: 'Identifiant de dossier invalide.' });
        return;
      }
      try {
        const result = await deleteFolderForUser(req.dbUser!.id, folderId);
        res.json(result);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // Problems CRUD
  router.post(
    '/problems',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const body = req.body as {
          model?: unknown;
          description?: string;
          note?: string;
        };
        const candidateModel = body?.model ?? body;
        const validation = validateAndParseModel(candidateModel, config.limits);

        if (!validation.valid) {
          res.status(400).json({
            error: 'La formulation du modèle contient des erreurs.',
            errors: validation.issues,
          });
          return;
        }

        const created = await createProblemWithVersion(
          req.dbUser!.id,
          candidateModel as ProblemModel,
          typeof body?.description === 'string' ? body.description : undefined,
          typeof body?.note === 'string' ? body.note : undefined
        );

        res.status(201).json(created);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/problems',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const list = await listProblemsForUser(req.dbUser!.id);
        res.json({ problems: list });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/problems/:problemId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }
      try {
        const detail = await getProblemDetailForUser(req.dbUser!.id, problemId);
        res.json(detail);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.patch(
    '/problems/:problemId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }
      try {
        const body = req.body as {
          name?: unknown;
          description?: unknown;
          restoreVersionId?: unknown;
          expectedVersionId?: unknown;
          projectId?: unknown;
          folderId?: unknown;
        };

        const updates: {
          name?: string;
          description?: string | null;
          restoreVersionId?: number;
          expectedVersionId?: number;
          projectId?: number | null;
          folderId?: number | null;
        } = {};

        if (typeof body.name === 'string') {
          if (!body.name.trim()) {
            res
              .status(400)
              .json({ error: 'Le nom du problème ne peut pas être vide.' });
            return;
          }
          updates.name = body.name;
        }
        if (body.description === null || typeof body.description === 'string') {
          updates.description = body.description;
        }
        if (typeof body.restoreVersionId === 'number') {
          updates.restoreVersionId = body.restoreVersionId;
        }
        if (typeof body.expectedVersionId === 'number') {
          updates.expectedVersionId = body.expectedVersionId;
        }
        if (body.projectId === null || typeof body.projectId === 'number') {
          updates.projectId = body.projectId;
        }
        if (body.folderId === null || typeof body.folderId === 'number') {
          updates.folderId = body.folderId;
        }

        const updated = await updateProblemMetadata(
          req.dbUser!.id,
          problemId,
          updates
        );
        res.json(updated);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/problems/:problemId/duplicate',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }
      try {
        const duplicated = await duplicateProblemForUser(
          req.dbUser!.id,
          problemId
        );
        res.status(201).json(duplicated);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.delete(
    '/problems/:problemId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }
      const confirmed =
        req.query.confirm === 'true' ||
        (req.body as { confirmDelete?: boolean } | undefined)?.confirmDelete ===
          true;

      if (!confirmed) {
        res.status(400).json({
          error:
            'La suppression définitive nécessite une confirmation explicite (confirmDelete: true).',
        });
        return;
      }

      try {
        const deleted = await deleteProblemPermanently(
          req.dbUser!.id,
          problemId
        );
        res.json(deleted);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // Immutable versions
  router.post(
    '/problems/:problemId/versions',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }

      const body = req.body as {
        model?: unknown;
        note?: string;
        expectedVersionId?: unknown;
      };
      const candidateModel = body?.model ?? body;
      const validation = validateAndParseModel(candidateModel, config.limits);

      if (!validation.valid) {
        res.status(400).json({
          error: 'La formulation du modèle contient des erreurs.',
          errors: validation.issues,
        });
        return;
      }

      const expectedVersionId =
        typeof body?.expectedVersionId === 'number'
          ? body.expectedVersionId
          : undefined;

      try {
        const version = await createNewModelVersion(
          req.dbUser!.id,
          problemId,
          candidateModel as ProblemModel,
          typeof body?.note === 'string' ? body.note : undefined,
          expectedVersionId
        );
        res.status(201).json({ version });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/problems/:problemId/versions',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }
      try {
        const versions = await listVersionsForProblem(req.dbUser!.id, problemId);
        res.json({ versions });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/problems/:problemId/resolutions',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }
      try {
        const list = await listResolutionsForProblem(req.dbUser!.id, problemId);
        res.json({ resolutions: list });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/versions/:versionId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const versionId = parsePositiveId(req.params.versionId);
      if (!versionId) {
        res.status(400).json({ error: 'Identifiant de version invalide.' });
        return;
      }
      try {
        const version = await getVersionForUser(req.dbUser!.id, versionId);
        res.json({ version });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // Resolutions & Iterations
  router.post(
    '/versions/:versionId/resolutions',
    strictActionLimiter,
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const versionId = parsePositiveId(req.params.versionId);
      if (!versionId) {
        res.status(400).json({ error: 'Identifiant de version invalide.' });
        return;
      }

      try {
        const version = await getVersionForUser(
          req.dbUser!.id,
          versionId,
          true
        );
        const validation = validateAndParseModel(
          version.modelJson,
          config.limits
        );
        if (!validation.valid) {
          res.status(400).json({
            error:
              'La version sélectionnée ne respecte plus les limites ou règles du serveur.',
            errors: validation.issues,
          });
          return;
        }

        const queued = await enqueueResolution({
          problemId: version.problemId,
          modelVersionId: version.id,
          requestedById: req.dbUser!.id,
          model: version.modelJson as ProblemModel,
          config,
        });

        res.status(202).json(queued);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/resolutions/:resolutionId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const resolutionId = parsePositiveId(req.params.resolutionId);
      if (!resolutionId) {
        res.status(400).json({ error: 'Identifiant de résolution invalide.' });
        return;
      }
      try {
        const resolution = await getResolutionForUser(
          req.dbUser!.id,
          resolutionId
        );
        res.json({ resolution });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/resolutions/:resolutionId/iterations',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const resolutionId = parsePositiveId(req.params.resolutionId);
      if (!resolutionId) {
        res.status(400).json({ error: 'Identifiant de résolution invalide.' });
        return;
      }
      try {
        const list = await getIterationsForResolution(
          req.dbUser!.id,
          resolutionId
        );
        res.json({ iterations: list });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/resolutions/:resolutionId/iterations/:iterationNumber',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const resolutionId = parsePositiveId(req.params.resolutionId);
      const rawIter = req.params.iterationNumber;
      const iterationNumber =
        typeof rawIter === 'string' && /^\d+$/.test(rawIter)
          ? Number.parseInt(rawIter, 10)
          : -1;

      if (!resolutionId || iterationNumber < 0) {
        res.status(400).json({ error: 'Paramètres d’itération invalides.' });
        return;
      }
      try {
        const iteration = await getSingleIterationForResolution(
          req.dbUser!.id,
          resolutionId,
          iterationNumber
        );
        res.json({ iteration });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/resolutions/:resolutionId/cancel',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const resolutionId = parsePositiveId(req.params.resolutionId);
      if (!resolutionId) {
        res.status(400).json({ error: 'Identifiant de résolution invalide.' });
        return;
      }
      try {
        await getResolutionForUser(req.dbUser!.id, resolutionId, true);
        const cancelled = await cancelResolution(req.dbUser!.id, resolutionId);
        res.json(cancelled);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // ============================================================
  // Import / Export (Step 5)
  // ============================================================

  router.post(
    '/import/preview',
    strictActionLimiter,
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const body = req.body as {
        fileName?: unknown;
        contentBase64?: unknown;
        sheetName?: unknown;
        range?: unknown;
        mapping?: unknown;
      };
      if (
        typeof body.fileName !== 'string' ||
        !body.fileName.trim() ||
        typeof body.contentBase64 !== 'string' ||
        !body.contentBase64.trim()
      ) {
        res.status(400).json({
          error: 'Le nom et le contenu du fichier (.csv ou .xlsx) sont requis.',
        });
        return;
      }

      try {
        const preview = await previewImportModel({
          fileName: body.fileName,
          contentBase64: body.contentBase64,
          sheetName:
            typeof body.sheetName === 'string' ? body.sheetName : undefined,
          range: typeof body.range === 'string' ? body.range : undefined,
          mapping:
            body.mapping && typeof body.mapping === 'object'
              ? (body.mapping as ImportMapping)
              : undefined,
          limits: config.limits,
        });

        await logUserActivity({
          userId: req.dbUser!.id,
          action: 'model_import_previewed',
          metadataJson: {
            fileName: body.fileName,
            valid: preview.valid,
            issueCount: preview.issues.length,
          },
        });

        res.json(preview);
      } catch (error) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Impossible d’analyser ce fichier.',
        });
      }
    }
  );

  async function resolveExportData(
    userId: number,
    body: Record<string, unknown>,
    includeTableaux: boolean
  ): Promise<ExportPayload> {
    const resolutionId =
      typeof body.resolutionId === 'number' ? body.resolutionId : null;
    const problemId =
      typeof body.problemId === 'number' ? body.problemId : null;
    const locale = body.locale === 'en' ? 'en' : 'fr';

    if (resolutionId) {
      const resolution = await getResolutionForUser(userId, resolutionId);
      const version = await getVersionForUser(userId, resolution.modelVersionId);
      const iterations =
        includeTableaux && resolution.iterationCount > 0
          ? await getIterationsForResolution(userId, resolution.id)
          : undefined;
      return {
        model: version.modelJson as ProblemModel,
        resolution: resolution as ExportPayload['resolution'],
        iterations,
        includeTableaux,
        locale,
      };
    }

    if (problemId) {
      const detail = await getProblemDetailForUser(userId, problemId);
      if (!detail.currentVersion) {
        throw new NotFoundError('Aucune version de modèle à exporter.');
      }
      return {
        model: detail.currentVersion.modelJson as ProblemModel,
        resolution: null,
        includeTableaux: false,
        locale,
      };
    }

    const validation = validateAndParseModel(body.model, config.limits);
    if (!validation.valid) {
      throw new ValidationRuleError(
        'Le modèle fourni pour export contient des erreurs de formulation.'
      );
    }

    return {
      model: body.model as ProblemModel,
      resolution: null,
      includeTableaux: false,
      locale,
    };
  }

  router.post(
    '/export/pdf',
    strictActionLimiter,
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const includeTableaux = body.includeTableaux === true;
        const payload = await resolveExportData(
          req.dbUser!.id,
          body,
          includeTableaux
        );
        const pdfBuffer = await generatePdfExport(payload);
        const slug = sanitizeFileSlug(payload.model.name);

        await logUserActivity({
          userId: req.dbUser!.id,
          problemId:
            typeof body.problemId === 'number' ? body.problemId : null,
          action: 'export_generated',
          metadataJson: { format: 'pdf', includeTableaux },
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${slug}.pdf"`
        );
        res.send(pdfBuffer);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/export/xlsx',
    strictActionLimiter,
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        // Per Section 6.10: Excel export never includes simplex tableaux
        const payload = await resolveExportData(req.dbUser!.id, body, false);
        const xlsxBuffer = await generateXlsxExport(payload);
        const slug = sanitizeFileSlug(payload.model.name);

        await logUserActivity({
          userId: req.dbUser!.id,
          problemId:
            typeof body.problemId === 'number' ? body.problemId : null,
          action: 'export_generated',
          metadataJson: { format: 'xlsx' },
        });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${slug}.xlsx"`
        );
        res.send(xlsxBuffer);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/export/csv',
    strictActionLimiter,
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        // Per Section 6.10: CSV export never includes simplex tableaux
        const payload = await resolveExportData(req.dbUser!.id, body, false);
        const csvContent = generateCsvExport(payload);
        const slug = sanitizeFileSlug(payload.model.name);

        await logUserActivity({
          userId: req.dbUser!.id,
          problemId:
            typeof body.problemId === 'number' ? body.problemId : null,
          action: 'export_generated',
          metadataJson: { format: 'csv' },
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${slug}.csv"`
        );
        res.send(csvContent);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  // ============================================================
  // Sharing, Invitations, Roles & Share Links (Step 5)
  // ============================================================

  router.get(
    '/invitations',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const list = await listPendingInvitationsForUser(req.dbUser!.email);
        res.json({ invitations: list });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/invitations/:token/accept',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const token =
        typeof req.params.token === 'string' ? req.params.token.trim() : '';
      if (!token) {
        res.status(400).json({ error: 'Jeton d’invitation invalide.' });
        return;
      }
      try {
        const result = await acceptInvitationByToken(
          req.dbUser!.id,
          req.dbUser!.email,
          token
        );
        res.json(result);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    '/problems/:problemId/sharing',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }
      try {
        const state = await getProblemSharingState(req.dbUser!.id, problemId);
        res.json(state);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/problems/:problemId/invitations',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      const body = req.body as { email?: unknown; role?: unknown };
      if (!problemId || typeof body.email !== 'string') {
        res.status(400).json({ error: 'Paramètres d’invitation invalides.' });
        return;
      }
      const role = body.role;
      if (role !== 'reader' && role !== 'editor' && role !== 'admin') {
        res.status(400).json({
          error: 'Rôle invalide (attendu : reader, editor ou admin).',
        });
        return;
      }

      try {
        const invitation = await inviteCollaborator(
          req.dbUser!.id,
          problemId,
          body.email,
          role
        );
        res.status(201).json({ invitation });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.delete(
    '/problems/:problemId/invitations/:invitationId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      const invitationId = parsePositiveId(req.params.invitationId);
      if (!problemId || !invitationId) {
        res.status(400).json({ error: 'Identifiants invalides.' });
        return;
      }
      try {
        const result = await revokeInvitationForOwner(
          req.dbUser!.id,
          problemId,
          invitationId
        );
        res.json(result);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.patch(
    '/problems/:problemId/collaborators/:collaboratorUserId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      const collaboratorUserId = parsePositiveId(
        req.params.collaboratorUserId
      );
      const body = req.body as { role?: unknown };
      if (!problemId || !collaboratorUserId) {
        res.status(400).json({ error: 'Identifiants invalides.' });
        return;
      }
      if (
        body.role !== 'reader' &&
        body.role !== 'editor' &&
        body.role !== 'admin'
      ) {
        res.status(400).json({ error: 'Rôle invalide.' });
        return;
      }
      try {
        const updated = await updateCollaboratorRoleForOwner(
          req.dbUser!.id,
          problemId,
          collaboratorUserId,
          body.role as CollaboratorRole
        );
        res.json({ collaborator: updated });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.delete(
    '/problems/:problemId/collaborators/:collaboratorUserId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      const collaboratorUserId = parsePositiveId(
        req.params.collaboratorUserId
      );
      if (!problemId || !collaboratorUserId) {
        res.status(400).json({ error: 'Identifiants invalides.' });
        return;
      }
      try {
        const result = await revokeCollaboratorForOwner(
          req.dbUser!.id,
          problemId,
          collaboratorUserId
        );
        res.json(result);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/problems/:problemId/share-links',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      const body = req.body as {
        role?: unknown;
        expiresInDays?: unknown;
        password?: unknown;
      };
      if (!problemId) {
        res.status(400).json({ error: 'Identifiant de problème invalide.' });
        return;
      }
      const role = body.role === 'editor' ? 'editor' : 'reader';
      const expiresInDays =
        typeof body.expiresInDays === 'number' ? body.expiresInDays : 30;
      const password =
        typeof body.password === 'string' ? body.password : undefined;

      try {
        const shareLink = await createShareLinkForOwner(
          req.dbUser!.id,
          problemId,
          { role, expiresInDays, password }
        );
        res.status(201).json({ shareLink });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.delete(
    '/problems/:problemId/share-links/:linkId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const problemId = parsePositiveId(req.params.problemId);
      const linkId = parsePositiveId(req.params.linkId);
      if (!problemId || !linkId) {
        res.status(400).json({ error: 'Identifiants invalides.' });
        return;
      }
      try {
        const result = await revokeShareLinkForOwner(
          req.dbUser!.id,
          problemId,
          linkId
        );
        res.json(result);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    '/share-links/:token/join',
    strictActionLimiter,
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const token =
        typeof req.params.token === 'string' ? req.params.token.trim() : '';
      const body = (req.body ?? {}) as { password?: unknown };
      if (!token) {
        res.status(400).json({ error: 'Jeton de partage invalide.' });
        return;
      }
      try {
        const result = await redeemShareLinkForUser(
          req.dbUser!.id,
          token,
          typeof body.password === 'string' ? body.password : undefined
        );
        res.json(result);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  return router;
}
