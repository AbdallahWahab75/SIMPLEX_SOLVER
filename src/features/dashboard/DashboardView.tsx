import { useState } from 'react';
import {
  FolderPlus,
  Plus,
  Trash2,
  FolderOpen,
  Sun,
  Moon,
  Copy,
} from 'lucide-react';
import type { Locale } from '../../i18n/translations.ts';
import { TRANSLATIONS } from '../../i18n/translations.ts';
import type {
  DashboardSummary,
  NumberDisplayMode,
  PendingUserInvitation,
  ProblemListItem,
  ThemeMode,
} from '../../types/solver.ts';

interface DashboardViewProps {
  locale: Locale;
  isAuthenticated: boolean;
  dashboard: DashboardSummary | null;
  problems: ProblemListItem[];
  theme: ThemeMode;
  numberFormat: NumberDisplayMode;
  decimalPrecision: number;
  onSignIn: () => void;
  onNewProblem: () => void;
  onOpenProblem: (problemId: number) => void;
  onDuplicateProblem: (problemId: number) => void;
  onCreateProject: (name: string) => Promise<void>;
  onDeleteProject: (projectId: number) => Promise<void>;
  onCreateFolder: (projectId: number, name: string) => Promise<void>;
  onDeleteFolder: (folderId: number) => Promise<void>;
  onChangeLocale: (loc: Locale) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeNumberFormat: (fmt: NumberDisplayMode) => void;
  onChangePrecision: (precision: number) => void;
  pendingInvitations: PendingUserInvitation[];
  onAcceptInvitation: (token: string) => Promise<void>;
}

export function DashboardView({
  locale,
  isAuthenticated,
  dashboard,
  problems,
  theme,
  numberFormat,
  decimalPrecision,
  onSignIn,
  onNewProblem,
  onOpenProblem,
  onDuplicateProblem,
  onCreateProject,
  onDeleteProject,
  onCreateFolder,
  onDeleteFolder,
  onChangeLocale,
  onChangeTheme,
  onChangeNumberFormat,
  onChangePrecision,
  pendingInvitations,
  onAcceptInvitation,
}: DashboardViewProps) {
  const t = TRANSLATIONS[locale];
  const [newProjectName, setNewProjectName] = useState('');
  const [folderInputs, setFolderInputs] = useState<Record<number, string>>({});

  if (!isAuthenticated) {
    return (
      <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-8 text-center space-y-4">
        <h1 className="text-lg font-semibold text-[var(--ink-primary)]">
          {t.dashboardTitle}
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

  const stats = dashboard?.stats ?? {
    totalProblems: problems.length,
    totalResolutions: 0,
    successfulResolutions: 0,
    failedResolutions: 0,
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await onCreateProject(newProjectName.trim());
    setNewProjectName('');
  };

  const handleFolderSubmit = async (projectId: number) => {
    const name = folderInputs[projectId]?.trim();
    if (!name) return;
    await onCreateFolder(projectId, name);
    setFolderInputs((prev) => ({ ...prev, [projectId]: '' }));
  };

  return (
    <div className="space-y-6">
      {/* Header + New Problem CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--ink-primary)]">
          {t.dashboardTitle}
        </h1>
        <button
          type="button"
          onClick={onNewProblem}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t.newProblem}
        </button>
      </div>

      {/* 4 KPI Summary Cards */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-5">
          <dt className="text-xs text-[var(--ink-secondary)]">
            {t.statTotalProblems}
          </dt>
          <dd className="mt-1 text-2xl font-bold font-mono tabular-nums text-[var(--petrol-800)]">
            {stats.totalProblems}
          </dd>
        </div>
        <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-5">
          <dt className="text-xs text-[var(--ink-secondary)]">
            {t.statTotalResolutions}
          </dt>
          <dd className="mt-1 text-2xl font-bold font-mono tabular-nums">
            {stats.totalResolutions}
          </dd>
        </div>
        <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-5">
          <dt className="text-xs text-[var(--ink-secondary)]">
            {t.statSuccessful}
          </dt>
          <dd className="mt-1 text-2xl font-bold font-mono tabular-nums text-[var(--petrol-700)]">
            {stats.successfulResolutions}
          </dd>
        </div>
        <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-5">
          <dt className="text-xs text-[var(--ink-secondary)]">
            {t.statFailed}
          </dt>
          <dd className="mt-1 text-2xl font-bold font-mono tabular-nums text-[var(--sand-accent)]">
            {stats.failedResolutions}
          </dd>
        </div>
      </dl>

      {pendingInvitations.length > 0 && (
        <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--ink-primary)]">
            {t.sharingMyInvitesTitle} ({pendingInvitations.length})
          </h2>
          <ul className="divide-y divide-[var(--border-hairline)]">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-[var(--ink-primary)]">
                    {inv.problemName}
                  </p>
                  <p className="text-[var(--ink-secondary)]">
                    {inv.inviterEmail} · {t.sharingRoles[inv.role]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onAcceptInvitation(inv.token)}
                  className="px-3 py-1.5 font-semibold rounded-md bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] cursor-pointer"
                >
                  {t.sharingAcceptInviteBtn}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Recent Problems & Projects/Folders */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[var(--ink-primary)]">
              {t.recentProblemsTitle}
            </h2>
            {problems.length === 0 ? (
              <p className="text-sm text-[var(--ink-secondary)]">
                {t.noProblems}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border-hairline)]">
                {problems.slice(0, 6).map((p) => (
                  <li
                    key={p.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--ink-primary)] truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-[var(--ink-secondary)] font-mono">
                        v{p.currentVersion?.versionNumber ?? 1} ·{' '}
                        {p.latestResolution?.outcomeStatus ?? '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenProblem(p.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-[var(--petrol-50)] text-[var(--petrol-800)] hover:bg-[var(--surface-muted)] cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        {t.openProblem}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateProblem(p.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {t.duplicateBtn}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Projects and Folders */}
          <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[var(--ink-primary)]">
              {t.projectsTitle}
            </h2>

            <form
              onSubmit={(e) => void handleProjectSubmit(e)}
              className="flex flex-wrap gap-2"
            >
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder={t.newProjectPlaceholder}
                className="flex-1 min-w-48 px-3 py-2 text-xs rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.createProjectBtn}
              </button>
            </form>

            {dashboard && dashboard.projects.length > 0 && (
              <ul className="space-y-3 pt-2">
                {dashboard.projects.map((proj) => {
                  const projFolders = dashboard.folders.filter(
                    (f) => f.projectId === proj.id
                  );
                  return (
                    <li
                      key={proj.id}
                      className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-[var(--ink-primary)]">
                          {proj.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => void onDeleteProject(proj.id)}
                          className="p-1 text-[var(--ink-secondary)] hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                          aria-label={`Delete project ${proj.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {projFolders.length > 0 && (
                        <ul className="pl-3 space-y-1.5 border-t border-[var(--border-hairline)] pt-2">
                          {projFolders.map((f) => (
                            <li
                              key={f.id}
                              className="flex items-center justify-between text-xs text-[var(--ink-secondary)]"
                            >
                              <span>{f.name}</span>
                              <button
                                type="button"
                                onClick={() => void onDeleteFolder(f.id)}
                                className="p-0.5 hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                                aria-label={`Delete folder ${f.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={folderInputs[proj.id] ?? ''}
                          onChange={(e) =>
                            setFolderInputs((prev) => ({
                              ...prev,
                              [proj.id]: e.target.value,
                            }))
                          }
                          placeholder={t.newFolderPlaceholder}
                          className="flex-1 px-2.5 py-1.5 text-xs rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleFolderSubmit(proj.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] hover:bg-[var(--surface-muted)] cursor-pointer"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          {t.createFolderBtn}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right: User Preferences & Activity Feed */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[var(--ink-primary)]">
              {t.preferencesTitle}
            </h2>

            <div className="space-y-4 text-sm">
              {/* Language */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-[var(--ink-secondary)]">
                  {t.languageLabel}
                </span>
                <div className="flex items-center gap-1 p-1 bg-[var(--surface-muted)] rounded-lg">
                  {(['fr', 'en'] as Locale[]).map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => onChangeLocale(loc)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                        locale === loc
                          ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                          : 'text-[var(--ink-secondary)]'
                      }`}
                    >
                      {loc.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-[var(--ink-secondary)]">
                  {t.themeLabel}
                </span>
                <div className="flex items-center gap-1 p-1 bg-[var(--surface-muted)] rounded-lg">
                  <button
                    type="button"
                    onClick={() => onChangeTheme('light')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                      theme === 'light'
                        ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    {t.themeLight}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeTheme('dark')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    {t.themeDark}
                  </button>
                </div>
              </div>

              {/* Number Format */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-[var(--ink-secondary)]">
                  {t.displayFormatLabel}
                </span>
                <div className="flex items-center gap-1 p-1 bg-[var(--surface-muted)] rounded-lg">
                  {(['fraction', 'decimal', 'both'] as NumberDisplayMode[]).map(
                    (mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onChangeNumberFormat(mode)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                          numberFormat === mode
                            ? 'bg-[var(--surface-panel)] text-[var(--petrol-800)] shadow-xs'
                            : 'text-[var(--ink-secondary)]'
                        }`}
                      >
                        {mode === 'fraction'
                          ? t.formatFraction
                          : mode === 'decimal'
                            ? t.formatDecimal
                            : t.formatBoth}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Decimal Precision */}
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="decimal-precision"
                  className="text-xs font-medium text-[var(--ink-secondary)]"
                >
                  {t.precisionLabel}
                </label>
                <select
                  id="decimal-precision"
                  value={decimalPrecision}
                  onChange={(e) =>
                    onChangePrecision(Number.parseInt(e.target.value, 10))
                  }
                  className="px-2.5 py-1.5 text-xs font-mono rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
                >
                  {[2, 4, 6, 8, 10].map((p) => (
                    <option key={p} value={p}>
                      {p} déc.
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Recent Activity */}
          <section className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[var(--ink-primary)]">
              {t.recentActivityTitle}
            </h2>
            {!dashboard || dashboard.recentActivity.length === 0 ? (
              <p className="text-xs text-[var(--ink-secondary)]">—</p>
            ) : (
              <ul className="divide-y divide-[var(--border-hairline)] text-xs">
                {dashboard.recentActivity.map((act) => {
                  const label =
                    (t.activityLabels as Record<string, string>)[act.action] ??
                    act.action;
                  return (
                    <li
                      key={act.id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <span className="font-medium text-[var(--ink-primary)]">
                        {label}
                      </span>
                      <span className="font-mono text-[var(--ink-secondary)]">
                        {new Date(act.createdAt).toLocaleDateString(
                          locale === 'fr' ? 'fr-FR' : 'en-US'
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
