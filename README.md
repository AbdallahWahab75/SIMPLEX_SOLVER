# Simplex Solver — MVP v1.0.0

Application web pédagogique et professionnelle dédiée à la formulation, la résolution exacte, la vérification indépendante et l’analyse pas à pas de problèmes de **programmation linéaire continue** par la méthode du simplexe.

---

## Architecture mise en place

- **Frontend (`src/`) :** React 19, TypeScript, Vite 8, Tailwind CSS v4 (mode clair/sombre, palette pétrole & sable, bilingue FR/EN, responsive mobile/desktop).
- **Backend (`server.ts`, `server/`) :** Express 4 + TypeScript servant l’API REST `/api/v1/*`, le durcissement HTTP (en-têtes de sécurité, limitation de débit, sanitisation d’erreurs) et le bundle Vite.
- **Moteur mathématique (`server/solver/`) :** Module TypeScript autonome basé sur une arithmétique rationnelle exacte (`BigInt` `Rational`), indépendant d’Express et de la base de données.
- **File de tâches (`server/workers/solveQueue.ts`) :** Exécution asynchrone annulable (`AbortController`) avec persistance transactionnelle des résultats et tableaux d’itération.
- **Persistance & Auth :** PostgreSQL (Cloud SQL) via Drizzle ORM (`src/db/schema.ts`) + Firebase Authentication (vérification de jeton côté serveur via `firebase-admin`).

---

## Prérequis et variables d’environnement

Consulter `.env.example` (ne jamais commiter de secrets réels) :

- `PORT` : port HTTP d’écoute (défaut `3000`).
- `NODE_ENV` : `development` ou `production`.
- `APP_URL` : URL publique de déploiement.
- `SOLVER_MAX_VARIABLES` : plafond serveur de variables (défaut `100`).
- `SOLVER_MAX_CONSTRAINTS` : plafond serveur de contraintes (défaut `200`).
- `SOLVER_TIMEOUT_MS` : délai maximal de résolution en ms (défaut `120000`).
- `SOLVER_TOLERANCE` : tolérance numérique serveur (défaut `1e-9`).
- `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD` : connexion PostgreSQL / Cloud SQL.

---

## Commandes exactes

```bash
# Installer les dépendances
npm install

# Démarrer le serveur de développement (Express + Vite sur le port 3000)
npm run dev

# Vérifier le typage TypeScript strict
npm run lint

# Exécuter toute la suite de tests automatisés (moteur, API, import/export, durcissement/charge)
npm test

# Construire le bundle frontend de production
npm run build

# Lancer le serveur en mode production
npm start
```

---

## Fonctionnalités disponibles vs reportées

### Disponibles dans le MVP (v1.0.0)
- **Formulation & Validation :** maximisation/minimisation, saisie guidée & matricielle, fractions exactes (`1/2`, `-3/4`), décimaux, domaines de variables (`≥ 0`, `≤ 0`, libre, borne inf., borne sup., intervalle `[l, u]`), contraintes `<=`, `>=`, `=`, validation stricte côté serveur (`<= 100` variables, `<= 200` contraintes).
- **Moteur exact & Vérification :** simplexe primal, méthode en deux phases, règle de Dantzig, détection de dégénérescence et activation de Bland anti-cyclage, distinction `optimal_unique`, `optimal_multiple`, `infeasible`, `unbounded`, et vérification indépendante post-résolution sur le modèle original.
- **Résultats & Tableaux :** synthèse, variables optimales, vérification des contraintes (LHS, RHS, marge, saturation), analyse économique (prix d’ombre / coûts réduits uniquement lorsque mathématiquement valides), navigation itération par itération avec mise en évidence du pivot et affichage fraction/décimale/mixte.
- **Espace utilisateur & Projets :** authentification Firebase, tableau de bord personnel, projets & dossiers, brouillons automatiques, sauvegarde officielle avec versions immuables, restauration, duplication, préférences persistées (FR/EN, clair/sombre, précision décimale).
- **Import / Export & Collaboration :** import `.csv`/`.xlsx` avec feuille, plage, mapping et erreurs explicites sans correction silencieuse ; export PDF (avec tableaux optionnels), XLSX & CSV (sans tableaux) ; partage privé par défaut, rôles `Lecteur`/`Éditeur`/`Administrateur`, plafond à 5 collaborateurs actifs, invitations 7 jours, liens de partage avec mot de passe optionnel et expiration, détection de conflits `409 EDIT_CONFLICT` et journal d’activité.

### Reportées après le MVP (non incluses)
- Programmation linéaire en nombres entiers ou binaires (PLNE/MILP).
- Visualisation graphique 2D/3D du polyèdre.
- Optimisation multi-objectifs, mode hors ligne complet, connecteurs SQL externes, facturation/abonnements, chatbot/IA externe.

---

## Documentation technique associée

- `docs/API.md` — Contrat complet de l’API REST `/api/v1`.
- `docs/SOLVER.md` — Spécification du moteur mathématique exact et vérifications.
- `docs/SECURITY.md` — Rapport de sécurité, contrôle d’accès, limites connues et audit.
- `docs/DEPLOYMENT.md` — Procédure de déploiement, migrations Cloud SQL, monitoring et rollback.
