# Documentation de l’API — `/api/v1`

Version : **1.0.0**  
Format : JSON (`application/json`), authentification par jeton Bearer Firebase (`Authorization: Bearer <idToken>`).

---

## 1. Sécurité, en-têtes et limitation de débit

- **Authentification :** Toutes les routes hormis `GET /api/v1/health` et `POST /api/v1/models/validate` exigent un jeton ID Firebase valide vérifié côté serveur via `firebase-admin`.
- **Limitation de débit (HTTP `429`) :**
  - Limite générale `/api/v1/*` : **180 requêtes / minute** par adresse IP.
  - Limite stricte sur calcul, import, export et liens partagés : **30 requêtes / minute** par IP (`Retry-After` renvoyé).
- **Taille maximale de requête JSON :** `4 Mo` (`2 Mo` max pour le contenu binaire décodé à l’import).
- **Codes d’erreur normalisés :**
  - `400` : erreur de validation métier ou corps JSON invalide (`errors[]`).
  - `401` : jeton absent, invalide ou expiré.
  - `403` : rôle insuffisant (`reader` tentant d’écrire, non-propriétaire gérant un partage, mot de passe de partage incorrect).
  - `404` : ressource introuvable ou inaccessible à l’utilisateur.
  - `409` : conflit d’édition optimiste (`code: "EDIT_CONFLICT"`, `currentVersionId`, `latestVersionNumber`).
  - `429` : limite de débit dépassée.
  - `500` : erreur interne générique (aucune trace technique exposée au client).

---

## 2. Endpoints publics

### `GET /api/v1/health`
Retourne l’état du service, la version SemVer (`1.0.0`), la version du moteur (`1.0.0-mvp`) et les limites serveur (`maxVariables`, `maxConstraints`, `timeoutMs`, `tolerance`).

### `POST /api/v1/models/validate`
Valide côté serveur un modèle `ProblemModel` selon les bornes configurées (`<= 100` variables, `<= 200` contraintes, cohérence des bornes, nombres exacts). Retourne `{ valid: true, summary }` ou `400 { valid: false, errors }`.

---

## 3. Compte, préférences et tableau de bord

- `GET /api/v1/me` — Profil utilisateur synchronisé en base et préférences (`locale`, `theme`, `numberFormat`, `decimalPrecision`).
- `PATCH /api/v1/me/preferences` — Met à jour `locale` (`fr`|`en`), `theme` (`light`|`dark`), `numberFormat` (`fraction`|`decimal`|`both`), `decimalPrecision` (`0..12`).
- `GET /api/v1/dashboard` — Statistiques personnelles (total problèmes, résolutions réussies/échouées), projets, dossiers, problèmes récents et journal d’activité récent.
- `POST /api/v1/projects`, `DELETE /api/v1/projects/:projectId` — Gestion des espaces de travail.
- `POST /api/v1/projects/:projectId/folders`, `DELETE /api/v1/folders/:folderId` — Gestion des dossiers.

---

## 4. Problèmes et versions immuables

- `GET /api/v1/problems` — Liste des problèmes possédés et partagés avec rôle d’accès (`owner`, `admin`, `editor`, `reader`).
- `POST /api/v1/problems` — Crée un problème et sa version `v1`.
- `GET /api/v1/problems/:problemId` — Détail complet, version courante, historique des versions, résolutions et rôle d’accès.
- `PATCH /api/v1/problems/:problemId` — Met à jour métadonnées (`name`, `description`, `projectId`, `folderId`) ou restaure une ancienne version (`restoreVersionId`). Supporte `expectedVersionId` (`409 EDIT_CONFLICT` si obsolète).
- `POST /api/v1/problems/:problemId/duplicate` — Duplique la formulation sans copier l’historique de résolutions.
- `DELETE /api/v1/problems/:problemId` — Suppression définitive (propriétaire uniquement, exige `confirmDelete: true`).
- `POST /api/v1/problems/:problemId/versions` — Crée une nouvelle version immuable (`expectedVersionId` vérifié contre les écrasements silencieux).
- `GET /api/v1/problems/:problemId/versions` / `GET /api/v1/versions/:versionId` — Consultation des versions.

---

## 5. Résolutions asynchrones et tableaux du simplexe

- `POST /api/v1/versions/:versionId/resolutions` — Planifie une résolution asynchrone (`202 Accepted`, statut initial `queued`).
- `GET /api/v1/resolutions/:resolutionId` — État (`queued`, `running`, `completed`, `failed`, `cancelled`, `timed_out`, `numerical_instability`) et résultats complets (`outcomeStatus`, `objectiveValue`, `variables`, `constraints`, `verification`). Les diagnostics internes bruts ne sont pas exposés comme vérité mathématique.
- `GET /api/v1/problems/:problemId/resolutions` — Historique des tentatives.
- `GET /api/v1/resolutions/:resolutionId/iterations` — Liste des tableaux et pivots stockés pour la résolution.
- `GET /api/v1/resolutions/:resolutionId/iterations/:iterationNumber` — Détail d’une itération.
- `POST /api/v1/resolutions/:resolutionId/cancel` — Annule une résolution `queued` ou `running` (rôles `owner`, `admin`, `editor`).

---

## 6. Import / Export

- `POST /api/v1/import/preview` — Analyse un fichier `.csv` ou `.xlsx` encodé en Base64 (`<= 2 Mo`), avec sélection optionnelle de `sheetName`, `range` (ex. `A4:E7`) et `mapping`. Signale toute valeur manquante, doublon ou opérateur invalide sans correction silencieuse.
- `POST /api/v1/export/pdf` — Génère un rapport PDF téléchargeable (formulation, résultats, vérifications, et tableaux du simplexe uniquement si `includeTableaux: true`).
- `POST /api/v1/export/xlsx` — Génère un classeur Excel (`Modèle`, `Résultats`) sans tableaux du simplexe.
- `POST /api/v1/export/csv` — Génère un export CSV UTF-8 BOM sans tableaux du simplexe.

---

## 7. Partage, invitations et liens protégés

- `GET /api/v1/invitations` — Invitations en attente destinées à l’e-mail de l’utilisateur connecté.
- `POST /api/v1/invitations/:token/accept` — Accepte une invitation valide (< 7 jours, respecte la limite de 5 collaborateurs actifs).
- `GET /api/v1/problems/:problemId/sharing` — État du partage (collaborateurs, invitations, liens, journal d’activité du problème).
- `POST /api/v1/problems/:problemId/invitations` — Invite par e-mail (propriétaire uniquement, max 5 collaborateurs actifs, expiration 7 jours).
- `DELETE /api/v1/problems/:problemId/invitations/:invitationId` — Révoque une invitation (propriétaire uniquement).
- `PATCH /api/v1/problems/:problemId/collaborators/:collaboratorUserId` — Modifie le rôle (propriétaire uniquement).
- `DELETE /api/v1/problems/:problemId/collaborators/:collaboratorUserId` — Révoque immédiatement un collaborateur (propriétaire uniquement).
- `POST /api/v1/problems/:problemId/share-links` — Crée un lien de partage authentifié (expiration par défaut 30 jours, mot de passe facultatif).
- `DELETE /api/v1/problems/:problemId/share-links/:linkId` — Révoque un lien (propriétaire uniquement).
- `POST /api/v1/share-links/:token/join` — Rejoint un problème via lien de partage (authentification requise, mot de passe vérifié via `scrypt` + `timingSafeEqual`).
