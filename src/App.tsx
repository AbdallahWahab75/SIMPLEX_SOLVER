import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, LogIn, RefreshCw } from 'lucide-react';
import { useAuth } from './contexts/AuthContext.tsx';
import { TRANSLATIONS, type Locale } from './i18n/translations.ts';
import {
  acceptInvitationApi,
  ApiError,
  assignProblemLocationApi,
  cancelResolutionApi,
  createFolderApi,
  createProblemApi,
  createProjectApi,
  createVersionApi,
  deleteFolderApi,
  deleteProblemApi,
  deleteProjectApi,
  downloadExportApi,
  duplicateProblemApi,
  getDashboardApi,
  getIterationsApi,
  getMeApi,
  getProblemDetailApi,
  getResolutionApi,
  joinShareLinkApi,
  listMyInvitationsApi,
  listProblemResolutionsApi,
  listProblemsApi,
  restoreVersionApi,
  startResolutionApi,
  updatePreferencesApi,
  validateModelApi,
} from './services/api.ts';
import type {
  DashboardSummary,
  IterationSnapshot,
  ModelVersionRecord,
  NumberDisplayMode,
  PendingUserInvitation,
  ProblemAccessRole,
  ProblemListItem,
  ProblemModel,
  ResolutionRecord,
  ThemeMode,
  ValidationIssue,
} from './types/solver.ts';
import { ProblemEditor } from './features/problems/ProblemEditor.tsx';
import { ResultsPanel } from './features/results/ResultsPanel.tsx';
import { TableauViewer } from './features/results/TableauViewer.tsx';
import { ProblemsView } from './features/dashboard/ProblemsView.tsx';
import { DashboardView } from './features/dashboard/DashboardView.tsx';
import { ImportModal } from './features/import-export/ImportModal.tsx';
import { SharingModal } from './features/sharing/SharingModal.tsx';

type AppView = 'dashboard' | 'editor' | 'results' | 'tableaux' | 'problems';

const DRAFT_STORAGE_KEY = 'simplex_solver_draft_v1';

function createEmptyModel(): ProblemModel {
  return {
    name: '',
    sense: 'maximize',
    objective: { x1: 0, x2: 0 },
    variables: {
      x1: { type: 'non_negative' },
      x2: { type: 'non_negative' },
    },
    constraints: [
      {
        name: 'C1',
        coefficients: { x1: 0, x2: 0 },
        operator: '<=',
        rhs: 0,
      },
    ],
    objectiveUnit: '',
  };
}

function createProductionExample(): ProblemModel {
  return {
    name: 'Production',
    sense: 'maximize',
    objective: { x1: 40, x2: 30 },
    variables: {
      x1: { type: 'lower_bounded', lower: 0, unit: 'unités' },
      x2: { type: 'lower_bounded', lower: 0, unit: 'unités' },
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
    objectiveUnit: 'FCFA',
  };
}

function loadSavedDraft(): ProblemModel | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProblemModel>;
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed.sense === 'maximize' || parsed.sense === 'minimize') &&
      parsed.variables &&
      typeof parsed.variables === 'object' &&
      parsed.objective &&
      typeof parsed.objective === 'object' &&
      Array.isArray(parsed.constraints)
    ) {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : '',
        sense: parsed.sense,
        objective: parsed.objective,
        variables: parsed.variables,
        constraints: parsed.constraints,
        objectiveUnit:
          typeof parsed.objectiveUnit === 'string' ? parsed.objectiveUnit : '',
      };
    }
  } catch {
    // Ignore corrupted local draft
  }
  return null;
}

function clearSavedDraft() {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

export default function App() {
  const { user, authError, signInWithGoogle, signOutUser, getIdToken } =
    useAuth();

  const initialDraftRef = useRef<ProblemModel | null>(loadSavedDraft());

  const [locale, setLocale] = useState<Locale>('fr');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [numberFormat, setNumberFormat] = useState<NumberDisplayMode>('both');
  const [decimalPrecision, setDecimalPrecision] = useState<number>(4);
  const [view, setView] = useState<AppView>('editor');

  const [model, setModel] = useState<ProblemModel>(
    () => initialDraftRef.current ?? createProductionExample()
  );
  const [draftRestored, setDraftRestored] = useState<boolean>(
    () => initialDraftRef.current !== null
  );
  const [activeProblemId, setActiveProblemId] = useState<number | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<number | null>(null);
  const [activeAccessRole, setActiveAccessRole] =
    useState<ProblemAccessRole>('owner');
  const [modelDirty, setModelDirty] = useState<boolean>(
    () => initialDraftRef.current !== null
  );

  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>(
    []
  );
  const [validationOk, setValidationOk] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [solveTaskStatus, setSolveTaskStatus] = useState<string | null>(null);
  const [activeResolutionId, setActiveResolutionId] = useState<number | null>(
    null
  );
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [conflictProblemId, setConflictProblemId] = useState<number | null>(
    null
  );

  const [currentResolution, setCurrentResolution] =
    useState<ResolutionRecord | null>(null);
  const [currentIterations, setCurrentIterations] = useState<
    IterationSnapshot[]
  >([]);

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingUserInvitation[]
  >([]);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [problemVersions, setProblemVersions] = useState<ModelVersionRecord[]>(
    []
  );
  const [problemResolutions, setProblemResolutions] = useState<
    ResolutionRecord[]
  >([]);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [sharingProblemId, setSharingProblemId] = useState<number | null>(null);

  // Share link token from URL query (?share=...)
  const [pendingShareToken, setPendingShareToken] = useState<string | null>(
    () => {
      try {
        const params = new URLSearchParams(window.location.search);
        return params.get('share');
      } catch {
        return null;
      }
    }
  );
  const [shareNeedsPassword, setShareNeedsPassword] = useState(false);
  const [sharePasswordInput, setSharePasswordInput] = useState('');
  const [shareJoinError, setShareJoinError] = useState<string | null>(null);

  const pollTimerRef = useRef<number | null>(null);

  const t = TRANSLATIONS[locale];

  const clearPoll = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => () => clearPoll(), []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (activeProblemId === null && modelDirty) {
      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(model));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [activeProblemId, model, modelDirty]);

  const refreshWorkspace = useCallback(async () => {
    const token = await getIdToken();
    if (!token) {
      setProblems([]);
      setDashboard(null);
      setPendingInvitations([]);
      return;
    }
    setLoadingProblems(true);
    try {
      const [problemsData, dashData, invitesData] = await Promise.all([
        listProblemsApi(token),
        getDashboardApi(token),
        listMyInvitationsApi(token),
      ]);
      setProblems(problemsData.problems);
      setDashboard(dashData);
      setPendingInvitations(invitesData.invitations);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setLoadingProblems(false);
    }
  }, [getIdToken]);

  const handleOpenProblem = useCallback(
    async (problemId: number) => {
      const token = await getIdToken();
      if (!token) return;
      setBannerError(null);
      setConflictProblemId(null);
      try {
        const [detail, hist] = await Promise.all([
          getProblemDetailApi(token, problemId),
          listProblemResolutionsApi(token, problemId),
        ]);
        setActiveProblemId(problemId);
        setActiveAccessRole(
          (detail.accessRole as ProblemAccessRole) ?? 'owner'
        );
        setProblemVersions(detail.versions);
        setProblemResolutions(hist.resolutions);
        setDraftRestored(false);
        if (detail.currentVersion) {
          setModel(detail.currentVersion.modelJson);
          setActiveVersionId(detail.currentVersion.id);
          setModelDirty(false);
        }
        setValidationIssues([]);
        setValidationOk(false);
        setView('editor');
      } catch (err) {
        setBannerError(
          err instanceof Error ? err.message : 'Erreur chargement'
        );
      }
    },
    [getIdToken]
  );

  const attemptJoinShareLink = useCallback(
    async (shareToken: string, password?: string) => {
      const token = await getIdToken();
      if (!token) return;
      setShareJoinError(null);
      try {
        const res = await joinShareLinkApi(token, shareToken, password);
        setPendingShareToken(null);
        setShareNeedsPassword(false);
        setSharePasswordInput('');
        window.history.replaceState({}, '', window.location.pathname);
        await refreshWorkspace();
        await handleOpenProblem(res.problemId);
      } catch (err) {
        if (err instanceof ApiError && err.passwordRequired) {
          setShareNeedsPassword(true);
          if (password) {
            setShareJoinError(err.message);
          }
        } else {
          setShareJoinError(
            err instanceof Error
              ? err.message
              : 'Impossible de rejoindre ce lien de partage.'
          );
        }
      }
    },
    [getIdToken, handleOpenProblem, refreshWorkspace]
  );

  useEffect(() => {
    if (!user) {
      setProblems([]);
      setDashboard(null);
      setPendingInvitations([]);
      setProblemVersions([]);
      setProblemResolutions([]);
      return;
    }
    void (async () => {
      const token = await getIdToken();
      if (!token) return;
      try {
        const me = await getMeApi(token);
        if (me.preferences.locale === 'fr' || me.preferences.locale === 'en') {
          setLocale(me.preferences.locale);
        }
        if (
          me.preferences.theme === 'light' ||
          me.preferences.theme === 'dark'
        ) {
          setTheme(me.preferences.theme);
        }
        if (
          me.preferences.numberFormat === 'fraction' ||
          me.preferences.numberFormat === 'decimal' ||
          me.preferences.numberFormat === 'both'
        ) {
          setNumberFormat(me.preferences.numberFormat);
        }
        if (
          typeof me.preferences.decimalPrecision === 'number' &&
          me.preferences.decimalPrecision >= 1 &&
          me.preferences.decimalPrecision <= 12
        ) {
          setDecimalPrecision(me.preferences.decimalPrecision);
        }
      } catch {
        // Keep current defaults if preferences fail to load
      }
      await refreshWorkspace();
      if (pendingShareToken && !shareNeedsPassword) {
        await attemptJoinShareLink(pendingShareToken);
      }
    })();
  }, [
    user,
    getIdToken,
    refreshWorkspace,
    pendingShareToken,
    shareNeedsPassword,
    attemptJoinShareLink,
  ]);

  const handleLocaleChange = async (nextLocale: Locale) => {
    setLocale(nextLocale);
    const token = await getIdToken();
    if (token) {
      void updatePreferencesApi(token, { locale: nextLocale }).catch(() => {});
    }
  };

  const handleThemeChange = async (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    const token = await getIdToken();
    if (token) {
      void updatePreferencesApi(token, { theme: nextTheme }).catch(() => {});
    }
  };

  const handleNumberFormatChange = async (mode: NumberDisplayMode) => {
    setNumberFormat(mode);
    const token = await getIdToken();
    if (token) {
      void updatePreferencesApi(token, { numberFormat: mode }).catch(() => {});
    }
  };

  const handlePrecisionChange = async (precision: number) => {
    setDecimalPrecision(precision);
    const token = await getIdToken();
    if (token) {
      void updatePreferencesApi(token, { decimalPrecision: precision }).catch(
        () => {}
      );
    }
  };

  const handleModelChange = (next: ProblemModel) => {
    setModel(next);
    setModelDirty(true);
    setValidationOk(false);
    setValidationIssues([]);
    setBannerError(null);
    setConflictProblemId(null);
  };

  const handleDiscardDraft = () => {
    clearSavedDraft();
    setDraftRestored(false);
    setModel(createProductionExample());
    setActiveProblemId(null);
    setActiveVersionId(null);
    setActiveAccessRole('owner');
    setModelDirty(false);
    setValidationIssues([]);
    setValidationOk(false);
    setBannerError(null);
    setConflictProblemId(null);
  };

  const handleValidate = async (): Promise<boolean> => {
    setIsValidating(true);
    setBannerError(null);
    setValidationIssues([]);
    setValidationOk(false);
    try {
      await validateModelApi(model);
      setValidationOk(true);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.validationErrors.length > 0) {
        setValidationIssues(err.validationErrors);
      } else {
        setBannerError(err instanceof Error ? err.message : 'Erreur validation');
      }
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const saveModelOrVersion = async (token: string): Promise<number> => {
    if (activeProblemId === null) {
      const created = await createProblemApi(token, model);
      setActiveProblemId(created.problem.id);
      setActiveVersionId(created.version.id);
      setActiveAccessRole('owner');
      setModelDirty(false);
      setDraftRestored(false);
      clearSavedDraft();
      await refreshWorkspace();
      return created.version.id;
    }
    if (modelDirty || activeVersionId === null) {
      const created = await createVersionApi(
        token,
        activeProblemId,
        model,
        undefined,
        activeVersionId
      );
      setActiveVersionId(created.version.id);
      setModelDirty(false);
      await refreshWorkspace();
      return created.version.id;
    }
    return activeVersionId;
  };

  const handleSave = async () => {
    const token = await getIdToken();
    if (!token) return;
    setIsSaving(true);
    setBannerError(null);
    setConflictProblemId(null);
    setValidationIssues([]);
    try {
      await saveModelOrVersion(token);
      setValidationOk(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EDIT_CONFLICT') {
        setBannerError(err.message);
        setConflictProblemId(activeProblemId);
      } else if (err instanceof ApiError && err.validationErrors.length > 0) {
        setValidationIssues(err.validationErrors);
      } else {
        setBannerError(
          err instanceof Error ? err.message : 'Erreur sauvegarde'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const loadResolutionDetails = useCallback(
    async (token: string, resolutionId: number) => {
      const { resolution } = await getResolutionApi(token, resolutionId);
      setCurrentResolution(resolution);
      if (resolution.iterationCount > 0) {
        const { iterations } = await getIterationsApi(token, resolutionId);
        setCurrentIterations(iterations);
      } else {
        setCurrentIterations([]);
      }
      return resolution;
    },
    []
  );

  const pollResolution = useCallback(
    async (token: string, resolutionId: number) => {
      try {
        const { resolution } = await getResolutionApi(token, resolutionId);
        setSolveTaskStatus(resolution.status);

        if (resolution.status === 'queued' || resolution.status === 'running') {
          pollTimerRef.current = window.setTimeout(() => {
            void pollResolution(token, resolutionId);
          }, 300);
          return;
        }

        setIsSolving(false);
        setActiveResolutionId(null);
        await loadResolutionDetails(token, resolutionId);
        await refreshWorkspace();
        if (activeProblemId) {
          const hist = await listProblemResolutionsApi(token, activeProblemId);
          setProblemResolutions(hist.resolutions);
        }
        setView('results');
      } catch (err) {
        setIsSolving(false);
        setActiveResolutionId(null);
        setBannerError(
          err instanceof Error ? err.message : 'Erreur suivi résolution'
        );
      }
    },
    [activeProblemId, loadResolutionDetails, refreshWorkspace]
  );

  const handleSolve = async () => {
    const token = await getIdToken();
    if (!token) return;
    clearPoll();
    setBannerError(null);
    setConflictProblemId(null);
    setValidationIssues([]);

    const valid = await handleValidate();
    if (!valid) return;

    setIsSolving(true);
    setSolveTaskStatus('queued');
    try {
      const versionId = await saveModelOrVersion(token);
      const queued = await startResolutionApi(token, versionId);
      setActiveResolutionId(queued.resolutionId);
      setSolveTaskStatus(queued.status);
      void pollResolution(token, queued.resolutionId);
    } catch (err) {
      setIsSolving(false);
      setSolveTaskStatus(null);
      if (err instanceof ApiError && err.code === 'EDIT_CONFLICT') {
        setBannerError(err.message);
        setConflictProblemId(activeProblemId);
      } else if (err instanceof ApiError && err.validationErrors.length > 0) {
        setValidationIssues(err.validationErrors);
      } else {
        setBannerError(
          err instanceof Error ? err.message : 'Erreur lancement résolution'
        );
      }
    }
  };

  const handleCancelSolve = async () => {
    if (!activeResolutionId) return;
    const token = await getIdToken();
    if (!token) return;
    clearPoll();
    try {
      await cancelResolutionApi(token, activeResolutionId);
    } finally {
      setIsSolving(false);
      setSolveTaskStatus(null);
      setActiveResolutionId(null);
    }
  };

  const handleDuplicateProblem = async (problemId: number) => {
    const token = await getIdToken();
    if (!token) return;
    setBannerError(null);
    try {
      const duplicated = await duplicateProblemApi(token, problemId);
      await refreshWorkspace();
      await handleOpenProblem(duplicated.problem.id);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Erreur duplication');
    }
  };

  const handleCreateProject = async (name: string) => {
    const token = await getIdToken();
    if (!token) return;
    setBannerError(null);
    try {
      await createProjectApi(token, name);
      await refreshWorkspace();
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Erreur création projet'
      );
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    const token = await getIdToken();
    if (!token) return;
    setBannerError(null);
    try {
      await deleteProjectApi(token, projectId);
      await refreshWorkspace();
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Erreur suppression projet'
      );
    }
  };

  const handleCreateFolder = async (projectId: number, name: string) => {
    const token = await getIdToken();
    if (!token) return;
    setBannerError(null);
    try {
      await createFolderApi(token, projectId, name);
      await refreshWorkspace();
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Erreur création dossier'
      );
    }
  };

  const handleDeleteFolder = async (folderId: number) => {
    const token = await getIdToken();
    if (!token) return;
    setBannerError(null);
    try {
      await deleteFolderApi(token, folderId);
      await refreshWorkspace();
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Erreur suppression dossier'
      );
    }
  };

  const handleAssignLocation = async (
    problemId: number,
    projectId: number | null,
    folderId: number | null
  ) => {
    const token = await getIdToken();
    if (!token) return;
    setBannerError(null);
    try {
      await assignProblemLocationApi(token, problemId, projectId, folderId);
      await refreshWorkspace();
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Erreur affectation projet'
      );
    }
  };

  const handleRestoreVersion = async (problemId: number, versionId: number) => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await restoreVersionApi(
        token,
        problemId,
        versionId,
        activeProblemId === problemId ? activeVersionId : null
      );
      if (res.restoredVersion) {
        setModel(res.restoredVersion.modelJson);
        setActiveVersionId(res.restoredVersion.id);
        setModelDirty(false);
      }
      await handleOpenProblem(problemId);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Erreur restauration'
      );
    }
  };

  const handleViewResolution = async (resolutionId: number) => {
    const token = await getIdToken();
    if (!token) return;
    try {
      await loadResolutionDetails(token, resolutionId);
      setView('results');
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Erreur chargement résultat'
      );
    }
  };

  const handleDeleteProblem = async (problemId: number) => {
    const token = await getIdToken();
    if (!token) return;
    await deleteProblemApi(token, problemId);
    if (activeProblemId === problemId) {
      setActiveProblemId(null);
      setActiveVersionId(null);
      setActiveAccessRole('owner');
      setProblemVersions([]);
      setProblemResolutions([]);
      setCurrentResolution(null);
      setCurrentIterations([]);
    }
    await refreshWorkspace();
  };

  const handleAcceptInvitation = async (inviteToken: string) => {
    const token = await getIdToken();
    if (!token) return;
    setBannerError(null);
    try {
      const res = await acceptInvitationApi(token, inviteToken);
      await refreshWorkspace();
      await handleOpenProblem(res.problemId);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Erreur acceptation invitation'
      );
    }
  };

  const handleExport = async (
    format: 'pdf' | 'xlsx' | 'csv',
    options: { resolutionId?: number | null; includeTableaux?: boolean } = {}
  ) => {
    const token = await getIdToken();
    if (!token) return;
    setBannerError(null);
    try {
      await downloadExportApi(
        token,
        format,
        {
          problemId: activeProblemId,
          resolutionId: options.resolutionId ?? null,
          model: options.resolutionId ? undefined : model,
          includeTableaux: options.includeTableaux ?? false,
          locale,
        },
        model.name || 'simplex-model'
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Erreur export');
    }
  };

  const handleResetNewProblem = () => {
    clearSavedDraft();
    setDraftRestored(false);
    setModel(createEmptyModel());
    setActiveProblemId(null);
    setActiveVersionId(null);
    setActiveAccessRole('owner');
    setModelDirty(false);
    setValidationOk(false);
    setValidationIssues([]);
    setBannerError(null);
    setConflictProblemId(null);
    setView('editor');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-canvas)] text-[var(--ink-primary)]">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setView('editor');
            }}
            className="text-lg font-bold tracking-tight text-[var(--petrol-800)] whitespace-nowrap shrink-0"
          >
            {t.brand}
          </a>

          <nav className="flex items-center gap-5 text-sm font-medium overflow-x-auto">
            {(
              [
                ['dashboard', t.navDashboard],
                ['editor', t.navEditor],
                ['results', t.navResults],
                ['tableaux', t.navTableaux],
                ['problems', t.navProblems],
              ] as [AppView, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                  view === key
                    ? 'text-[var(--petrol-800)] font-semibold border-b-2 border-[var(--petrol-700)]'
                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() =>
                void handleLocaleChange(locale === 'fr' ? 'en' : 'fr')
              }
              className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-hairline)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {locale === 'fr' ? 'EN' : 'FR'}
            </button>

            {user ? (
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-hairline)] text-[var(--petrol-800)] hover:bg-[var(--surface-muted)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {t.signOut}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t.signInGoogle}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Share link banner/password prompt if opened via ?share= */}
        {pendingShareToken && (
          <div className="p-4 rounded-xl bg-[var(--surface-panel)] border border-[var(--border-hairline)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--ink-primary)]">
                {t.shareJoinTitle}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPendingShareToken(null);
                  setShareNeedsPassword(false);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="text-xs text-[var(--ink-secondary)] hover:underline cursor-pointer"
              >
                {t.cancel}
              </button>
            </div>
            {!user ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-[var(--ink-secondary)]">
                  {t.authBannerBody}
                </span>
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="px-3.5 py-1.5 font-semibold rounded-lg bg-[var(--petrol-700)] text-white cursor-pointer"
                >
                  {t.signInGoogle}
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pendingShareToken) {
                    void attemptJoinShareLink(
                      pendingShareToken,
                      sharePasswordInput
                    );
                  }
                }}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                {shareNeedsPassword && (
                  <input
                    type="password"
                    required
                    value={sharePasswordInput}
                    onChange={(e) => setSharePasswordInput(e.target.value)}
                    placeholder={t.shareJoinPasswordLabel}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
                  />
                )}
                <button
                  type="submit"
                  className="px-3.5 py-1.5 font-semibold rounded-lg bg-[var(--petrol-700)] text-white cursor-pointer"
                >
                  {t.shareJoinBtn}
                </button>
                {shareJoinError && (
                  <span className="text-red-700 dark:text-red-400">
                    {shareJoinError}
                  </span>
                )}
              </form>
            )}
          </div>
        )}

        {(bannerError || authError) && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-sm text-red-900 dark:text-red-200 flex flex-wrap items-center justify-between gap-3">
            <span>{bannerError ?? authError}</span>
            {conflictProblemId !== null && (
              <button
                type="button"
                onClick={() => void handleOpenProblem(conflictProblemId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t.conflictReloadBtn}
              </button>
            )}
          </div>
        )}

        {view === 'dashboard' && (
          <DashboardView
            locale={locale}
            isAuthenticated={Boolean(user)}
            dashboard={dashboard}
            problems={problems}
            theme={theme}
            numberFormat={numberFormat}
            decimalPrecision={decimalPrecision}
            onSignIn={() => void signInWithGoogle()}
            onNewProblem={handleResetNewProblem}
            onOpenProblem={(id) => void handleOpenProblem(id)}
            onDuplicateProblem={(id) => void handleDuplicateProblem(id)}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onChangeLocale={(loc) => void handleLocaleChange(loc)}
            onChangeTheme={(th) => void handleThemeChange(th)}
            onChangeNumberFormat={(fmt) => void handleNumberFormatChange(fmt)}
            onChangePrecision={(prec) => void handlePrecisionChange(prec)}
            pendingInvitations={pendingInvitations}
            onAcceptInvitation={handleAcceptInvitation}
          />
        )}

        {view === 'editor' && (
          <ProblemEditor
            locale={locale}
            model={model}
            onChangeModel={handleModelChange}
            activeProblemId={activeProblemId}
            accessRole={activeAccessRole}
            validationIssues={validationIssues}
            validationOk={validationOk}
            isValidating={isValidating}
            isSaving={isSaving}
            isSolving={isSolving}
            solveTaskStatus={solveTaskStatus}
            isAuthenticated={Boolean(user)}
            draftRestored={draftRestored}
            onDiscardDraft={handleDiscardDraft}
            onOpenImport={() => setImportModalOpen(true)}
            onOpenShare={() => {
              if (activeProblemId) setSharingProblemId(activeProblemId);
            }}
            onExport={(fmt) => void handleExport(fmt)}
            onValidate={() => void handleValidate()}
            onSave={() => void handleSave()}
            onSolve={() => void handleSolve()}
            onCancelSolve={() => void handleCancelSolve()}
            onLoadExample={() => {
              clearSavedDraft();
              setDraftRestored(false);
              setModel(createProductionExample());
              setActiveProblemId(null);
              setActiveVersionId(null);
              setActiveAccessRole('owner');
              setModelDirty(false);
              setValidationIssues([]);
              setValidationOk(false);
              setBannerError(null);
            }}
            onResetNew={handleResetNewProblem}
            onSignIn={() => void signInWithGoogle()}
          />
        )}

        {view === 'results' && (
          <ResultsPanel
            locale={locale}
            resolution={currentResolution}
            numberFormat={numberFormat}
            decimalPrecision={decimalPrecision}
            onChangeNumberFormat={(m) => void handleNumberFormatChange(m)}
            onOpenTableaux={() => setView('tableaux')}
            onExport={(fmt, includeTableaux) =>
              void handleExport(fmt, {
                resolutionId: currentResolution?.id ?? null,
                includeTableaux,
              })
            }
          />
        )}

        {view === 'tableaux' && (
          <TableauViewer
            locale={locale}
            iterations={currentIterations}
            numberFormat={numberFormat}
            decimalPrecision={decimalPrecision}
            onChangeNumberFormat={(m) => void handleNumberFormatChange(m)}
            onExportPdfWithTableaux={
              currentResolution
                ? () =>
                    void handleExport('pdf', {
                      resolutionId: currentResolution.id,
                      includeTableaux: true,
                    })
                : undefined
            }
          />
        )}

        {view === 'problems' && (
          <ProblemsView
            locale={locale}
            isAuthenticated={Boolean(user)}
            problems={problems}
            projects={dashboard?.projects ?? []}
            folders={dashboard?.folders ?? []}
            loadingProblems={loadingProblems}
            selectedProblemId={activeProblemId}
            versions={problemVersions}
            resolutions={problemResolutions}
            onSignIn={() => void signInWithGoogle()}
            onOpenProblem={(id) => void handleOpenProblem(id)}
            onDuplicateProblem={(id) => handleDuplicateProblem(id)}
            onShareProblem={(id) => setSharingProblemId(id)}
            onAssignLocation={(pid, projId, folderId) =>
              handleAssignLocation(pid, projId, folderId)
            }
            onRestoreVersion={(pid, vid) => void handleRestoreVersion(pid, vid)}
            onViewResolution={(rid) => void handleViewResolution(rid)}
            onDeleteProblem={(pid) => handleDeleteProblem(pid)}
          />
        )}
      </main>

      <ImportModal
        locale={locale}
        isOpen={importModalOpen}
        getToken={getIdToken}
        onClose={() => setImportModalOpen(false)}
        onImportModel={(imported) => {
          setModel(imported);
          setActiveProblemId(null);
          setActiveVersionId(null);
          setActiveAccessRole('owner');
          setModelDirty(true);
          setDraftRestored(false);
          setValidationIssues([]);
          setValidationOk(true);
          setView('editor');
        }}
      />

      <SharingModal
        locale={locale}
        problemId={sharingProblemId}
        getToken={getIdToken}
        onClose={() => setSharingProblemId(null)}
      />

      <footer className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="max-w-7xl mx-auto px-6 py-4 text-xs text-[var(--ink-secondary)] flex flex-wrap items-center justify-between gap-4">
          <span>
            Simplex Solver{user?.email ? ` · ${t.signedInAs} ${user.email}` : ''}
          </span>
          <span className="font-mono">v0.5.0-mvp</span>
        </div>
      </footer>
    </div>
  );
}
