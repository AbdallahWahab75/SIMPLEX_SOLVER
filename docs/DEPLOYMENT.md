# Guide de déploiement, migrations et rollback — Simplex Solver MVP

---

## 1. Environnements recommandés

1. **Développement (`NODE_ENV=development`) :** serveur Express + middleware Vite sur le port `3000`, connecté à l’instance PostgreSQL de développement.
2. **Staging / Pré-production :** build Vite compilé (`npm run build`), serveur Node (`npm start`), base PostgreSQL isolée et jeu de données de recette.
3. **Production :** Cloud Run (HTTPS/TLS forcé par Google Cloud), instance Cloud SQL PostgreSQL régionale avec sauvegardes automatiques quotidiennes et restauration point-in-time (PITR) activée.

---

## 2. Base de données et migrations (`src/db/schema.ts`)

Le schéma PostgreSQL géré par Drizzle ORM comprend les 12 tables :
- `users`, `user_preferences`
- `projects`, `folders`
- `problems`, `model_versions`
- `resolutions`, `iterations`
- `collaborations`, `invitations`, `share_links`
- `activity_logs`

### Appliquer le schéma
En environnement managé Cloud SQL / Drizzle :
```bash
npx drizzle-kit push --config=src/db/drizzle.config.ts
```
*(Dans AI Studio, le provisioning et la mise à jour du schéma sont orchestrés via `cloudsql-update-schema`.)*

### Vérification des sauvegardes
- Vérifier que les backups automatiques Cloud SQL sont actifs (rétention >= 7 jours, journaux techniques conservés 90 jours, traces minimales de suppression 1 an).
- Tester périodiquement la restauration d’un snapshot vers une instance temporaire de staging avant toute migration destructrice.

---

## 3. Pipeline de livraison et vérifications pré-déploiement

1. **Contrôle des dépendances et licences :**
   ```bash
   npm ci --ignore-scripts
   npm audit --omit=dev --audit-level=high
   ```
2. **Typage, build et tests automatisés :**
   ```bash
   npm run lint
   npm test
   npm run build
   ```
3. **Déploiement Staging & Smoke Tests :**
   - Vérifier `GET /api/v1/health` → `200 OK` (`appVersion: "1.0.0"`).
   - Vérifier les en-têtes de sécurité (`x-content-type-options: nosniff`, `cache-control: no-store`).
   - Vérifier une résolution complète, un export PDF/XLSX/CSV et un partage authentifié.
4. **Validation humaine & bascule Production.**

---

## 4. Monitoring et exploitation

- **Santé applicative :** surveiller `GET /api/v1/health` toutes les 30s.
- **Journaux structurés :** chaque requête `/api/*` émet une entrée JSON `{ type: "http_access", method, path, status, durationMs }` sans jeton ni mot de passe.
- **Alertes recommandées :** taux de `5xx > 1 %`, pic de `429`, échecs répétés `numerical_instability` ou `timed_out` dans la table `resolutions`.

---

## 5. Procédure de rollback

### Rollback applicatif (Cloud Run)
En cas de régression après déploiement :
1. Identifier la révision saine précédente sur Cloud Run.
2. Basculer 100 % du trafic vers la révision précédente :
   ```bash
   gcloud run services update-traffic simplex-solver \
     --region=europe-west2 \
     --to-revisions=<REVISION_SAINE>=100
   ```
3. Vérifier `GET /api/v1/health` et les journaux `http_access`.

### Rollback base de données
Les tables MVP privilégient des ajouts additifs (versions immuables `model_versions`). Si une migration devait être annulée :
1. Mettre le service en lecture seule ou suspendre l’écriture de nouvelles versions.
2. Restaurer le snapshot Cloud SQL pré-déploiement vers une instance de secours ou effectuer un Point-In-Time Recovery (PITR) avant bascule.
