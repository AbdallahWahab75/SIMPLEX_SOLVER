# Rapport de sécurité initial et limites connues — Simplex Solver MVP

Date : 16 novembre 2026  
Version couverte : `1.0.0`

---

## 1. Contrôles de sécurité implémentés

### Authentification et gestion des sessions
- **Firebase Authentication :** vérification systématique côté serveur des jetons JWT via `firebase-admin` (`requireAuth`) sur toutes les routes protégées. Aucun identifiant utilisateur transmis par le navigateur n’est accepté sans vérification cryptographique du jeton.
- **Absence de stockage sensible côté navigateur :** les jetons d’authentification sont gérés en mémoire par le SDK Firebase et transmis uniquement via l’en-tête `Authorization: Bearer`.

### Autorisation et isolation des données (RBAC)
- Tous les problèmes sont **privés par défaut** (`ownerId` vérifié sur chaque requête via `resolveProblemAccess`).
- Rôles appliqués côté serveur :
  - `owner` : lecture, édition, résolution, annulation, suppression définitive (avec confirmation explicite `confirmDelete: true`), gestion exclusive des invitations, rôles, liens de partage et révocation.
  - `admin` / `editor` : lecture, édition (avec contrôle de conflit optimiste `expectedVersionId` → `409 EDIT_CONFLICT`), résolution et annulation.
  - `reader` : lecture seule ; toute mutation renvoie `403 Forbidden`.
- **Plafond de collaboration :** maximum **5 collaborateurs actifs** par problème (en plus du propriétaire).
- **Liens de partage :** authentification obligatoire, expiration par défaut à 30 jours, révocation immédiate, mot de passe optionnel haché via `crypto.scryptSync` avec sel aléatoire de 16 octets et comparaison en temps constant (`crypto.timingSafeEqual`).

### Validation, injection et durcissement HTTP
- **SQL Injection :** accès aux données exclusivement paramétré via Drizzle ORM (`eq`, `and`, `inArray`) et validation stricte des identifiants entiers positifs (`parsePositiveId`).
- **Limitation de débit :** middleware `createRateLimiter` (180 req/min général, 30 req/min sur calcul, import, export et jointure de lien partagé) avec en-têtes `Retry-After` et HTTP `429`.
- **En-têtes HTTP de sécurité :** `X-Powered-By` désactivé, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `Cache-Control: no-store` sur `/api/*`.
- **Sanitisation des erreurs :** les erreurs JSON malformées (`400`) et erreurs internes (`500`) ne renvoient jamais de trace d’exception, ni de `internalDiagnosticsJson`, ni d’identifiants SQL au client.
- **Validation des imports :** limite stricte de `2 Mo`, rejet sans modification silencieuse des cellules invalides, utilisation d’`exceljs` et `pdfkit` (sans bibliothèque XLSX vulnérable aux pollutions de prototypes).

---

## 2. Audit des dépendances

Dépendances principales de production :
- `express` (4.x), `pg` (8.x), `drizzle-orm` (0.45.x), `firebase` / `firebase-admin`, `exceljs` (4.4.0, MIT), `pdfkit` (0.20.2, MIT), `react` (19.0.1, MIT), `lucide-react` (ISC), `motion` (MIT).
- Note environnement : `npm audit` n’a pas pu être exécuté directement en raison de l’utilisation de `bun.lock` sans `package-lock.json` dans ce conteneur ; en pipeline CI/CD avant mise en production, générer `package-lock.json` et exécuter `npm audit --audit-level=high` (blocant sur vulnérabilités critiques/élevées).

---

## 3. Limites connues du MVP

1. **File de tâches en mémoire (`solveQueue.ts`) :** les tâches actives utilisent des `AbortController` en mémoire du processus Node.js. Un redémarrage serveur en plein calcul laisse les statuts persistés, mais interrompt les jobs `queued`/`running` non encore achevés (une file Redis/BullMQ est recommandée pour un déploiement multi-instances).
2. **Limiteur de débit en mémoire :** efficace sur instance unique Cloud Run ; pour une montée en charge horizontale multi-conteneurs, déporter les compteurs vers Redis ou Cloud Armor.
3. **Temps réel collaboratif :** la détection de conflits repose sur le verrouillage optimiste `expectedVersionId` (`409 EDIT_CONFLICT`) sans curseurs WebSocket temps réel.
4. **Analyse de sensibilité complète :** seuls les prix d’ombre vérifiés et la saturation des contraintes sont exposés ; les intervalles de variation complets ne sont pas inventés lorsque non calculés par le moteur.
