import { useState } from 'react';
import {
  FolderOpen,
  History,
  RotateCcw,
  Trash2,
  Eye,
  AlertTriangle,
  Copy,
  Share2,
} from 'lucide-react';
import type { Locale } from '../../i18n/translations.ts';
import { TRANSLATIONS } from '../../i18n/translations.ts';
import type {
  FolderRecord,
  ModelVersionRecord,
  ProblemListItem,
  ProjectRecord,
  ResolutionRecord,
} from '../../types/solver.ts';

interface ProblemsViewProps {
  locale: Locale;
  isAuthenticated: boolean;
  problems: ProblemListItem[];
  projects: ProjectRecord[];
  folders: FolderRecord[];
  loadingProblems: boolean;
  selectedProblemId: number | null;
  versions: ModelVersionRecord[];
  resolutions: ResolutionRecord[];
  onSignIn: () => void;
  onOpenProblem: (problemId: number) => void;
  onDuplicateProblem: (problemId: number) => Promise<void>;
  onAssignLocation: (
    problemId: number,
    projectId: number | null,
    folderId: number | null
  ) => Promise<void>;
  onRestoreVersion: (problemId: number, versionId: number) => void;
  onViewResolution: (resolutionId: number) => void;
  onDeleteProblem: (problemId: number) => Promise<void>;
  onShareProblem: (problemId: number) => void;
}

export function ProblemsView({
  locale,
  isAuthenticated,
  problems,
  projects,
  folders,
  loadingProblems,
  selectedProblemId,
  versions,
  resolutions,
  onSignIn,
  onOpenProblem,
  onDuplicateProblem,
  onAssignLocation,
  onRestoreVersion,
  onViewResolution,
  onDeleteProblem,
  onShareProblem,
}: ProblemsViewProps) {
  const t = TRANSLATIONS[locale];
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<ProblemListItem | null>(
    null
  );
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!isAuthenticated) {
    return (
      <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-8 text-center space-y-4">
        <h1 className="text-lg font-semibold text-[var(--ink-primary)]">
          {t.problemsTitle}
        </h1>
        <p className="text-sm text-[var(--ink-secondary)] max-w-lg mx-auto">
          {t.authBannerBody}
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] transition-colors cursor-pointer"
        >
          {t.signInGoogle}
        </button>
      </section>
    );
  }

  const filteredProblems = problems.filter((p) => {
    if (projectFilter === 'all') return true;
    if (projectFilter === 'none') return p.projectId === null;
    return String(p.projectId) === projectFilter;
  });

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !confirmChecked) return;
    setDeleting(true);
    try {
      await onDeleteProblem(deleteTarget.id);
      setDeleteTarget(null);
      setConfirmChecked(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Saved problems list */}
      <section className="lg:col-span-7 bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-[var(--ink-primary)]">
            {t.problemsTitle}
          </h1>

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label={t.assignProjectLabel}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
          >
            <option value="all">{t.allProjects}</option>
            <option value="none">{t.unassignedProject}</option>
            {projects.map((proj) => (
              <option key={proj.id} value={String(proj.id)}>
                {proj.name}
              </option>
            ))}
          </select>
        </div>

        {loadingProblems ? (
          <p className="text-sm text-[var(--ink-secondary)]">Chargement…</p>
        ) : filteredProblems.length === 0 ? (
          <p className="text-sm text-[var(--ink-secondary)]">{t.noProblems}</p>
        ) : (
          <ul className="divide-y divide-[var(--border-hairline)]">
            {filteredProblems.map((p) => {
              const isSelected = p.id === selectedProblemId;
              const projFolders = p.projectId
                ? folders.filter((f) => f.projectId === p.projectId)
                : [];
              return (
                <li
                  key={p.id}
                  className={`py-4 space-y-3 ${
                    isSelected
                      ? 'bg-[var(--petrol-50)] -mx-3 px-3 rounded-lg'
                      : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <p className="font-semibold text-sm text-[var(--ink-primary)] truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-[var(--ink-secondary)]">
                        {p.currentVersion
                          ? `v${p.currentVersion.versionNumber}`
                          : 'v1'}{' '}
                        · {p.resolutionCount}{' '}
                        {t.resolutionsHistoryTitle.toLowerCase()}
                        {p.accessRole && p.accessRole !== 'owner'
                          ? ` · ${t.sharingRoles[p.accessRole]}${p.ownerEmail ? ` (${p.ownerEmail})` : ''}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenProblem(p.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] transition-colors cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        {t.openProblem}
                      </button>
                      <button
                        type="button"
                        onClick={() => onShareProblem(p.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        {t.sharingBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDuplicateProblem(p.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {t.duplicateBtn}
                      </button>
                      {(!p.accessRole || p.accessRole === 'owner') && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(p);
                            setConfirmChecked(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t.deleteProblem}
                        </button>
                      )}
                    </div>
                  </div>

                  {projects.length > 0 && (!p.accessRole || p.accessRole === 'owner') && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[var(--ink-secondary)]">
                        {t.assignProjectLabel}:
                      </span>
                      <select
                        value={p.projectId ? String(p.projectId) : ''}
                        onChange={(e) => {
                          const nextProj = e.target.value
                            ? Number.parseInt(e.target.value, 10)
                            : null;
                          void onAssignLocation(p.id, nextProj, null);
                        }}
                        className="px-2 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                      >
                        <option value="">{t.unassignedProject}</option>
                        {projects.map((proj) => (
                          <option key={proj.id} value={String(proj.id)}>
                            {proj.name}
                          </option>
                        ))}
                      </select>
                      {projFolders.length > 0 && (
                        <select
                          value={p.folderId ? String(p.folderId) : ''}
                          onChange={(e) => {
                            const nextFolder = e.target.value
                              ? Number.parseInt(e.target.value, 10)
                              : null;
                            void onAssignLocation(p.id, p.projectId, nextFolder);
                          }}
                          className="px-2 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                        >
                          <option value="">—</option>
                          {projFolders.map((f) => (
                            <option key={f.id} value={String(f.id)}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Versions & Resolution History for selected problem */}
      <section className="lg:col-span-5 space-y-6">
        <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--petrol-700)]" />
            <h2 className="text-base font-semibold text-[var(--ink-primary)]">
              {t.versionsTitle}
            </h2>
          </div>

          {versions.length === 0 ? (
            <p className="text-xs text-[var(--ink-secondary)]">—</p>
          ) : (
            <ul className="divide-y divide-[var(--border-hairline)] text-sm">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-xs text-[var(--petrol-800)]">
                      v{v.versionNumber}
                    </p>
                    <p className="text-xs text-[var(--ink-secondary)] truncate">
                      {v.note ?? '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestoreVersion(v.problemId, v.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t.restoreVersion}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-[var(--ink-primary)]">
            {t.resolutionsHistoryTitle}
          </h2>

          {resolutions.length === 0 ? (
            <p className="text-xs text-[var(--ink-secondary)]">—</p>
          ) : (
            <ul className="divide-y divide-[var(--border-hairline)] text-sm">
              {resolutions.map((r) => (
                <li
                  key={r.id}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-mono text-xs font-semibold text-[var(--ink-primary)]">
                      #{r.id} · v{r.modelVersionId} ·{' '}
                      {r.outcomeStatus ?? r.status}
                    </p>
                    <p className="text-xs text-[var(--ink-secondary)] font-mono">
                      Z* = {r.objectiveValue ? r.objectiveValue.fraction : '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewResolution(r.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-[var(--petrol-50)] text-[var(--petrol-800)] hover:bg-[var(--surface-muted)] cursor-pointer shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {t.viewResolution}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Reinforced Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[var(--ink-primary)]">
                  {t.confirmDeleteTitle}
                </h3>
                <p className="text-xs text-[var(--ink-secondary)]">
                  {t.confirmDeleteBody}
                </p>
                <p className="text-xs font-semibold text-[var(--ink-primary)] pt-1">
                  {deleteTarget.name}
                </p>
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-[var(--ink-primary)] cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t.confirmDeleteCheck}</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={!confirmChecked || deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-700 text-white hover:bg-red-800 disabled:opacity-40 cursor-pointer"
              >
                {t.confirmDeleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
