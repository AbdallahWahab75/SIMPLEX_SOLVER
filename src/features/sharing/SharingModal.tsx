import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  Mail,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Locale } from '../../i18n/translations.ts';
import { TRANSLATIONS } from '../../i18n/translations.ts';
import {
  createShareLinkApi,
  getProblemSharingApi,
  inviteCollaboratorApi,
  revokeCollaboratorApi,
  revokeInvitationApi,
  revokeShareLinkApi,
  updateCollaboratorRoleApi,
} from '../../services/api.ts';
import type {
  CollaboratorRole,
  ProblemSharingState,
} from '../../types/solver.ts';

interface SharingModalProps {
  locale: Locale;
  problemId: number | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
}

export function SharingModal({
  locale,
  problemId,
  getToken,
  onClose,
}: SharingModalProps) {
  const t = TRANSLATIONS[locale];
  const [state, setState] = useState<ProblemSharingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>('reader');

  const [linkRole, setLinkRole] = useState<'reader' | 'editor'>('reader');
  const [linkDays, setLinkDays] = useState<number>(30);
  const [linkPassword, setLinkPassword] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const loadSharing = useCallback(async () => {
    if (!problemId) return;
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getProblemSharingApi(token, problemId);
      setState(res);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erreur chargement partage'
      );
    } finally {
      setLoading(false);
    }
  }, [problemId, getToken]);

  useEffect(() => {
    void loadSharing();
  }, [loadSharing]);

  if (!problemId) return null;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const token = await getToken();
    if (!token) return;
    setErrorMsg(null);
    try {
      await inviteCollaboratorApi(token, problemId, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      await loadSharing();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur invitation');
    }
  };

  const handleRoleChange = async (
    userId: number,
    nextRole: CollaboratorRole
  ) => {
    const token = await getToken();
    if (!token) return;
    setErrorMsg(null);
    try {
      await updateCollaboratorRoleApi(token, problemId, userId, nextRole);
      await loadSharing();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur modification rôle');
    }
  };

  const handleRevokeCollaborator = async (userId: number) => {
    const token = await getToken();
    if (!token) return;
    setErrorMsg(null);
    try {
      await revokeCollaboratorApi(token, problemId, userId);
      await loadSharing();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur révocation');
    }
  };

  const handleRevokeInvitation = async (invitationId: number) => {
    const token = await getToken();
    if (!token) return;
    setErrorMsg(null);
    try {
      await revokeInvitationApi(token, problemId, invitationId);
      await loadSharing();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur révocation');
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    setErrorMsg(null);
    try {
      await createShareLinkApi(token, problemId, {
        role: linkRole,
        expiresInDays: linkDays,
        password: linkPassword.trim() || undefined,
      });
      setLinkPassword('');
      await loadSharing();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erreur création lien de partage'
      );
    }
  };

  const handleRevokeLink = async (linkId: number) => {
    const token = await getToken();
    if (!token) return;
    setErrorMsg(null);
    try {
      await revokeShareLinkApi(token, problemId, linkId);
      await loadSharing();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur révocation lien');
    }
  };

  const copyShareUrl = async (linkId: number, shareToken: string) => {
    const url = `${window.location.origin}/?share=${encodeURIComponent(shareToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(linkId);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard fallback not needed
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="w-5 h-5 text-[var(--petrol-700)] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-[var(--ink-primary)] truncate">
                {t.sharingTitle}
              </h2>
              {state && (
                <p className="text-xs text-[var(--ink-secondary)] truncate">
                  {state.problemName} · {t.sharingOwnerLabel}:{' '}
                  {state.owner?.email ?? '—'}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)] cursor-pointer"
            aria-label={t.cancel}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200">
              {errorMsg}
            </div>
          )}

          {loading && !state ? (
            <p className="text-xs text-[var(--ink-secondary)]">Chargement…</p>
          ) : (
            state && (
              <>
                {/* Active Collaborators */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--ink-primary)] flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[var(--petrol-700)]" />
                      {t.sharingCollaboratorsTitle} (
                      {state.collaborators.length} / {state.maxCollaborators})
                    </h3>
                    <span className="text-xs font-mono text-[var(--ink-secondary)]">
                      {t.sharingRoles[state.accessRole]}
                    </span>
                  </div>

                  {state.collaborators.length === 0 ? (
                    <p className="text-xs text-[var(--ink-secondary)]">—</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-lg">
                      {state.collaborators.map((c) => (
                        <li
                          key={c.id}
                          className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs bg-[var(--surface-canvas)]"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--ink-primary)] truncate">
                              {c.email}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {state.isOwner ? (
                              <>
                                <select
                                  value={c.role}
                                  onChange={(e) =>
                                    void handleRoleChange(
                                      c.userId,
                                      e.target.value as CollaboratorRole
                                    )
                                  }
                                  className="px-2 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                                >
                                  <option value="reader">
                                    {t.sharingRoles.reader}
                                  </option>
                                  <option value="editor">
                                    {t.sharingRoles.editor}
                                  </option>
                                  <option value="admin">
                                    {t.sharingRoles.admin}
                                  </option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRevokeCollaborator(c.userId)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/60 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  {t.sharingRevokeBtn}
                                </button>
                              </>
                            ) : (
                              <span className="font-mono text-[var(--ink-secondary)]">
                                {t.sharingRoles[c.role]}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Owner-only: Email Invitations & Share Links */}
                {state.isOwner && (
                  <>
                    <section className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] space-y-3">
                      <h3 className="text-sm font-semibold text-[var(--ink-primary)] flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[var(--petrol-700)]" />
                        {t.sharingInviteTitle}
                      </h3>
                      <form
                        onSubmit={(e) => void handleInvite(e)}
                        className="flex flex-wrap gap-2 text-xs"
                      >
                        <input
                          type="email"
                          required
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder={t.sharingInvitePlaceholder}
                          className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                        />
                        <select
                          value={inviteRole}
                          onChange={(e) =>
                            setInviteRole(e.target.value as CollaboratorRole)
                          }
                          className="px-2.5 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                        >
                          <option value="reader">{t.sharingRoles.reader}</option>
                          <option value="editor">{t.sharingRoles.editor}</option>
                          <option value="admin">{t.sharingRoles.admin}</option>
                        </select>
                        <button
                          type="submit"
                          disabled={
                            state.collaborators.length >= state.maxCollaborators
                          }
                          className="px-3.5 py-2 font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] disabled:opacity-40 cursor-pointer"
                        >
                          {t.sharingSendInviteBtn}
                        </button>
                      </form>

                      {state.invitations.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <p className="text-xs font-medium text-[var(--ink-secondary)]">
                            {t.sharingPendingInvites}
                          </p>
                          <ul className="space-y-1.5">
                            {state.invitations.map((inv) => (
                              <li
                                key={inv.id}
                                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
                              >
                                <span>
                                  {inv.email} ·{' '}
                                  <strong>{t.sharingRoles[inv.role]}</strong> ·{' '}
                                  <span className="font-mono text-[var(--ink-secondary)]">
                                    exp.{' '}
                                    {new Date(inv.expiresAt).toLocaleDateString(
                                      locale === 'fr' ? 'fr-FR' : 'en-US'
                                    )}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRevokeInvitation(inv.id)
                                  }
                                  className="text-red-700 dark:text-red-300 hover:underline cursor-pointer"
                                >
                                  {t.sharingRevokeBtn}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>

                    <section className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] space-y-3">
                      <h3 className="text-sm font-semibold text-[var(--ink-primary)] flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-[var(--petrol-700)]" />
                        {t.sharingShareLinksTitle}
                      </h3>
                      <form
                        onSubmit={(e) => void handleCreateLink(e)}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs items-end"
                      >
                        <div className="sm:col-span-3">
                          <select
                            value={linkRole}
                            onChange={(e) =>
                              setLinkRole(
                                e.target.value as 'reader' | 'editor'
                              )
                            }
                            className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                          >
                            <option value="reader">
                              {t.sharingRoles.reader}
                            </option>
                            <option value="editor">
                              {t.sharingRoles.editor}
                            </option>
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-[var(--ink-secondary)] mb-0.5">
                            {t.sharingLinkExpiresDays}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={linkDays}
                            onChange={(e) =>
                              setLinkDays(
                                Number.parseInt(e.target.value, 10) || 30
                              )
                            }
                            className="w-full px-2.5 py-2 font-mono rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <input
                            type="password"
                            value={linkPassword}
                            onChange={(e) => setLinkPassword(e.target.value)}
                            placeholder={t.sharingLinkPasswordOpt}
                            className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            className="w-full px-3 py-2 font-semibold rounded-lg bg-[var(--petrol-700)] text-white hover:bg-[var(--petrol-800)] cursor-pointer"
                          >
                            {t.sharingCreateLinkBtn}
                          </button>
                        </div>
                      </form>

                      {state.shareLinks.length > 0 && (
                        <ul className="space-y-2 pt-1">
                          {state.shareLinks.map((l) => (
                            <li
                              key={l.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
                            >
                              <div className="space-y-0.5">
                                <p className="font-semibold">
                                  {t.sharingRoles[l.role]}
                                  {l.hasPassword ? ' · 🔒' : ''}
                                </p>
                                <p className="font-mono text-[11px] text-[var(--ink-secondary)]">
                                  exp.{' '}
                                  {new Date(l.expiresAt).toLocaleDateString(
                                    locale === 'fr' ? 'fr-FR' : 'en-US'
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void copyShareUrl(l.id, l.token)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--border-hairline)] hover:bg-[var(--surface-muted)] cursor-pointer"
                                >
                                  {copiedId === l.id ? (
                                    <Check className="w-3 h-3 text-[var(--petrol-700)]" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  {copiedId === l.id
                                    ? t.sharingCopied
                                    : t.sharingCopyLinkBtn}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleRevokeLink(l.id)}
                                  className="px-2.5 py-1 rounded border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/60 cursor-pointer"
                                >
                                  {t.sharingRevokeBtn}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                )}

                {/* Problem Activity Feed */}
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                    {t.sharingActivityTitle}
                  </h3>
                  {state.activity.length === 0 ? (
                    <p className="text-xs text-[var(--ink-secondary)]">—</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-lg text-xs">
                      {state.activity.map((act) => {
                        const label =
                          (t.activityLabels as Record<string, string>)[
                            act.action
                          ] ?? act.action;
                        return (
                          <li
                            key={act.id}
                            className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-panel)]"
                          >
                            <span>
                              <strong>{label}</strong> ·{' '}
                              <span className="text-[var(--ink-secondary)]">
                                {act.actorEmail}
                              </span>
                            </span>
                            <span className="font-mono text-[var(--ink-secondary)]">
                              {new Date(act.createdAt).toLocaleString(
                                locale === 'fr' ? 'fr-FR' : 'en-US'
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
