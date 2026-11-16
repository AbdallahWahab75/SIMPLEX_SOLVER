import type {
  CollaboratorRole,
  DashboardSummary,
  FolderRecord,
  ImportMapping,
  ImportPreviewResult,
  IterationSnapshot,
  ModelVersionRecord,
  PendingUserInvitation,
  ProblemListItem,
  ProblemModel,
  ProblemSharingState,
  ProjectRecord,
  ResolutionRecord,
  ShareLinkRecord,
  ThemeMode,
  ValidationIssue,
} from '../types/solver.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly validationErrors: ValidationIssue[];
  readonly code?: string;
  readonly passwordRequired?: boolean;

  constructor(
    message: string,
    status: number,
    validationErrors: ValidationIssue[] = [],
    code?: string,
    passwordRequired?: boolean
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.validationErrors = validationErrors;
    this.code = code;
    this.passwordRequired = passwordRequired;
  }
}

async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ApiError(`HTTP ${response.status}`, response.status);
    }
  }

  if (!response.ok) {
    const errors = Array.isArray(data.errors)
      ? (data.errors as ValidationIssue[])
      : [];
    const message =
      typeof data.error === 'string'
        ? data.error
        : `Erreur HTTP ${response.status}`;
    const code = typeof data.code === 'string' ? data.code : undefined;
    const passwordRequired = data.passwordRequired === true;
    throw new ApiError(message, response.status, errors, code, passwordRequired);
  }

  return data as T;
}

export function validateModelApi(model: ProblemModel) {
  return apiFetch<{
    valid: boolean;
    errors: ValidationIssue[];
    summary?: {
      name: string;
      sense: string;
      variableCount: number;
      constraintCount: number;
    };
  }>('/api/v1/models/validate', {
    method: 'POST',
    body: JSON.stringify(model),
  });
}

export function listProblemsApi(token: string) {
  return apiFetch<{ problems: ProblemListItem[] }>(
    '/api/v1/problems',
    { method: 'GET' },
    token
  );
}

export function getProblemDetailApi(token: string, problemId: number) {
  return apiFetch<{
    problem: ProblemListItem;
    accessRole: string;
    currentVersion: ModelVersionRecord | null;
    versions: ModelVersionRecord[];
  }>(`/api/v1/problems/${problemId}`, { method: 'GET' }, token);
}

export function createProblemApi(
  token: string,
  model: ProblemModel,
  description?: string,
  note?: string
) {
  return apiFetch<{
    problem: ProblemListItem;
    version: ModelVersionRecord;
  }>(
    '/api/v1/problems',
    {
      method: 'POST',
      body: JSON.stringify({ model, description, note }),
    },
    token
  );
}

export function createVersionApi(
  token: string,
  problemId: number,
  model: ProblemModel,
  note?: string,
  expectedVersionId?: number | null
) {
  return apiFetch<{ version: ModelVersionRecord }>(
    `/api/v1/problems/${problemId}/versions`,
    {
      method: 'POST',
      body: JSON.stringify({
        model,
        note,
        ...(expectedVersionId ? { expectedVersionId } : {}),
      }),
    },
    token
  );
}

export function restoreVersionApi(
  token: string,
  problemId: number,
  restoreVersionId: number,
  expectedVersionId?: number | null
) {
  return apiFetch<{
    problem: ProblemListItem;
    restoredVersion: ModelVersionRecord | null;
  }>(
    `/api/v1/problems/${problemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        restoreVersionId,
        ...(expectedVersionId ? { expectedVersionId } : {}),
      }),
    },
    token
  );
}

export function deleteProblemApi(token: string, problemId: number) {
  return apiFetch<{ deletedId: number }>(
    `/api/v1/problems/${problemId}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ confirmDelete: true }),
    },
    token
  );
}

export function listProblemResolutionsApi(token: string, problemId: number) {
  return apiFetch<{ resolutions: ResolutionRecord[] }>(
    `/api/v1/problems/${problemId}/resolutions`,
    { method: 'GET' },
    token
  );
}

export function startResolutionApi(token: string, versionId: number) {
  return apiFetch<{
    resolutionId: number;
    problemId: number;
    modelVersionId: number;
    status: string;
    engineVersion: string;
  }>(
    `/api/v1/versions/${versionId}/resolutions`,
    { method: 'POST' },
    token
  );
}

export function getResolutionApi(token: string, resolutionId: number) {
  return apiFetch<{ resolution: ResolutionRecord }>(
    `/api/v1/resolutions/${resolutionId}`,
    { method: 'GET' },
    token
  );
}

export function getIterationsApi(token: string, resolutionId: number) {
  return apiFetch<{ iterations: IterationSnapshot[] }>(
    `/api/v1/resolutions/${resolutionId}/iterations`,
    { method: 'GET' },
    token
  );
}

export function cancelResolutionApi(token: string, resolutionId: number) {
  return apiFetch<{ resolutionId: number; status: string; cancelled: boolean }>(
    `/api/v1/resolutions/${resolutionId}/cancel`,
    { method: 'POST' },
    token
  );
}

export function getMeApi(token: string) {
  return apiFetch<{
    user: { id: number; email: string; displayName: string | null };
    preferences: {
      locale: 'fr' | 'en';
      theme: 'light' | 'dark';
      numberFormat: 'fraction' | 'decimal' | 'both';
      decimalPrecision: number;
    };
  }>('/api/v1/me', { method: 'GET' }, token);
}

export function updatePreferencesApi(
  token: string,
  updates: {
    locale?: 'fr' | 'en';
    theme?: ThemeMode;
    numberFormat?: 'fraction' | 'decimal' | 'both';
    decimalPrecision?: number;
  }
) {
  return apiFetch<{
    preferences: {
      locale: 'fr' | 'en';
      theme: ThemeMode;
      numberFormat: 'fraction' | 'decimal' | 'both';
      decimalPrecision: number;
    };
  }>(
    '/api/v1/me/preferences',
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
    token
  );
}

export function getDashboardApi(token: string) {
  return apiFetch<DashboardSummary>(
    '/api/v1/dashboard',
    { method: 'GET' },
    token
  );
}

export function createProjectApi(token: string, name: string) {
  return apiFetch<{ project: ProjectRecord }>(
    '/api/v1/projects',
    { method: 'POST', body: JSON.stringify({ name }) },
    token
  );
}

export function deleteProjectApi(token: string, projectId: number) {
  return apiFetch<{ deletedId: number }>(
    `/api/v1/projects/${projectId}`,
    { method: 'DELETE' },
    token
  );
}

export function createFolderApi(token: string, projectId: number, name: string) {
  return apiFetch<{ folder: FolderRecord }>(
    `/api/v1/projects/${projectId}/folders`,
    { method: 'POST', body: JSON.stringify({ name }) },
    token
  );
}

export function deleteFolderApi(token: string, folderId: number) {
  return apiFetch<{ deletedId: number }>(
    `/api/v1/folders/${folderId}`,
    { method: 'DELETE' },
    token
  );
}

export function assignProblemLocationApi(
  token: string,
  problemId: number,
  projectId: number | null,
  folderId: number | null
) {
  return apiFetch<{ problem: ProblemListItem }>(
    `/api/v1/problems/${problemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ projectId, folderId }),
    },
    token
  );
}

export function duplicateProblemApi(token: string, problemId: number) {
  return apiFetch<{
    problem: ProblemListItem;
    version: ModelVersionRecord;
  }>(
    `/api/v1/problems/${problemId}/duplicate`,
    { method: 'POST' },
    token
  );
}

// Step 5: Import / Export & Collaboration APIs
export function previewImportApi(
  token: string,
  payload: {
    fileName: string;
    contentBase64: string;
    sheetName?: string;
    range?: string;
    mapping?: ImportMapping;
  }
) {
  return apiFetch<ImportPreviewResult>(
    '/api/v1/import/preview',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
}

export async function downloadExportApi(
  token: string,
  format: 'pdf' | 'xlsx' | 'csv',
  payload: {
    problemId?: number | null;
    resolutionId?: number | null;
    model?: ProblemModel;
    includeTableaux?: boolean;
    locale?: 'fr' | 'en';
  },
  fallbackName = 'simplex-model'
) {
  const response = await fetch(`/api/v1/export/${format}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errMsg = `Erreur HTTP ${response.status}`;
    try {
      const json = (await response.json()) as { error?: string };
      if (typeof json.error === 'string') errMsg = json.error;
    } catch {
      // ignore non-json error
    }
    throw new ApiError(errMsg, response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `${fallbackName}.${format}`;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function listMyInvitationsApi(token: string) {
  return apiFetch<{ invitations: PendingUserInvitation[] }>(
    '/api/v1/invitations',
    { method: 'GET' },
    token
  );
}

export function acceptInvitationApi(token: string, inviteToken: string) {
  return apiFetch<{ problemId: number; role: string }>(
    `/api/v1/invitations/${encodeURIComponent(inviteToken)}/accept`,
    { method: 'POST' },
    token
  );
}

export function getProblemSharingApi(token: string, problemId: number) {
  return apiFetch<ProblemSharingState>(
    `/api/v1/problems/${problemId}/sharing`,
    { method: 'GET' },
    token
  );
}

export function inviteCollaboratorApi(
  token: string,
  problemId: number,
  email: string,
  role: CollaboratorRole
) {
  return apiFetch<{ invitation: unknown }>(
    `/api/v1/problems/${problemId}/invitations`,
    { method: 'POST', body: JSON.stringify({ email, role }) },
    token
  );
}

export function revokeInvitationApi(
  token: string,
  problemId: number,
  invitationId: number
) {
  return apiFetch<{ revokedId: number }>(
    `/api/v1/problems/${problemId}/invitations/${invitationId}`,
    { method: 'DELETE' },
    token
  );
}

export function updateCollaboratorRoleApi(
  token: string,
  problemId: number,
  collaboratorUserId: number,
  role: CollaboratorRole
) {
  return apiFetch<{ collaborator: unknown }>(
    `/api/v1/problems/${problemId}/collaborators/${collaboratorUserId}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
    token
  );
}

export function revokeCollaboratorApi(
  token: string,
  problemId: number,
  collaboratorUserId: number
) {
  return apiFetch<{ revokedUserId: number }>(
    `/api/v1/problems/${problemId}/collaborators/${collaboratorUserId}`,
    { method: 'DELETE' },
    token
  );
}

export function createShareLinkApi(
  token: string,
  problemId: number,
  options: {
    role: 'reader' | 'editor';
    expiresInDays?: number;
    password?: string;
  }
) {
  return apiFetch<{ shareLink: ShareLinkRecord }>(
    `/api/v1/problems/${problemId}/share-links`,
    { method: 'POST', body: JSON.stringify(options) },
    token
  );
}

export function revokeShareLinkApi(
  token: string,
  problemId: number,
  linkId: number
) {
  return apiFetch<{ revokedId: number }>(
    `/api/v1/problems/${problemId}/share-links/${linkId}`,
    { method: 'DELETE' },
    token
  );
}

export function joinShareLinkApi(
  token: string,
  shareToken: string,
  password?: string
) {
  return apiFetch<{ problemId: number; role: string }>(
    `/api/v1/share-links/${encodeURIComponent(shareToken)}/join`,
    {
      method: 'POST',
      body: JSON.stringify(password ? { password } : {}),
    },
    token
  );
}
