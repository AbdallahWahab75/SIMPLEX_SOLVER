# SIMPLEX SOLVER — Spécification de réalisation du MVP
**Document de référence pour Google AI Studio, Antigravity ou un agent de développement IA**  
**Version : 1.0 — 16 novembre 2026**

---

## 1. Instructions à l'agent IA

Tu es l'ingénieur logiciel principal chargé de construire le MVP de **Simplex Solver**.

Ta mission est de produire une application web fonctionnelle, testable, sécurisée et maintenable, destinée à résoudre des problèmes de **programmation linéaire continue** avec la méthode du simplexe.

### Règles impératives
1. Lis entièrement ce document avant de modifier ou créer le projet.
2. Commence par analyser le dépôt existant. Ne supprime et ne remplace aucun fichier utile sans raison.
3. Ne génère pas uniquement des maquettes : les formulaires, calculs, API, sauvegardes et parcours décrits doivent réellement fonctionner.
4. N'invente pas de fonctionnalités non spécifiées. Si une décision technique indispensable manque, propose une option raisonnable et documente-la avant de l'appliquer.
5. Développe par étapes courtes. À chaque étape : code, tests, vérification, puis résumé des fichiers modifiés.
6. Ne simule jamais un résultat mathématique. Toute solution affichée doit provenir du moteur de résolution et passer les vérifications numériques.
7. Ne mets jamais de secrets, mots de passe ou identifiants de bases de données dans le frontend, le dépôt Git ou les journaux.
8. Ne laisse pas de boutons décoratifs : chaque action affichée doit être fonctionnelle ou clairement indiquée comme « non disponible dans cette version ».
9. N'essaie pas de développer toutes les fonctionnalités avancées en une seule génération. Respecte l'ordre de réalisation ci-dessous.
10. Avant chaque changement important, vérifie qu'il ne détruit pas les fonctions déjà validées.

**Première réponse attendue de l'agent :** audit du dépôt, proposition d'architecture adaptée à son état actuel, liste des étapes de réalisation et risques identifiés. Ne commence pas par réécrire tout le dépôt.

---

## 2. Vision du produit

Simplex Solver est un outil pédagogique et professionnel permettant de formuler, résoudre, comprendre et conserver des problèmes de programmation linéaire continue.

L'application doit :
- permettre de créer un problème de maximisation ou de minimisation ;
- saisir une fonction objectif et des contraintes ;
- prendre en charge les signes et bornes des variables ;
- résoudre avec le simplexe primal et la méthode en deux phases lorsque nécessaire ;
- présenter le résultat et les tableaux du simplexe ;
- vérifier mathématiquement la solution avant de la déclarer optimale ;
- conserver les problèmes et les différentes tentatives de résolution ;
- fonctionner en français et en anglais ;
- être responsive sur ordinateur, tablette et smartphone.

**Public cible :** étudiants, enseignants et professionnels.

**Périmètre géographique :** application web internationale. Les unités et contextes économiques doivent pouvoir être renseignés par l'utilisateur (par exemple FCFA, heures, kilogrammes ou unités).

---

## 3. Périmètre du MVP

### 3.1 Fonctionnalités essentielles — priorité P0

Ces fonctions constituent le noyau indispensable à une première version utilisable.

1. Interface web responsive.
2. Création et modification d'un problème de programmation linéaire.
3. Fonction objectif : maximisation ou minimisation.
4. Variables continues avec domaines :
   - \(x \geq 0\) ;
   - \(x \leq 0\) ;
   - variable libre ;
   - borne inférieure ;
   - borne supérieure ;
   - intervalle de bornes.
5. Contraintes avec relations `≤`, `≥` et `=`.
6. Résolution par simplexe primal ou méthode en deux phases selon la structure du problème.
7. Gestion des cas : optimum unique, optimum multiple, problème infaisable, problème non borné.
8. Détection des erreurs de formulation avant lancement.
9. Vérification indépendante de la solution finale.
10. Affichage du statut, de la valeur optimale, des valeurs des variables et du temps total de résolution.
11. Consultation des tableaux et itérations, avec navigation précédente/suivante et accès direct à une itération.
12. Sauvegarde des problèmes et de l'historique des tentatives.
13. Tests automatisés du moteur mathématique.

### 3.2 Fonctions complémentaires — priorité P1

À réaliser après validation du noyau P0 :
- création de compte et connexion ;
- vérification de l'adresse e-mail et réinitialisation du mot de passe ;
- projets et dossiers ;
- sauvegarde automatique des brouillons et sauvegarde officielle manuelle ;
- versions du modèle ;
- duplication d'un problème ;
- import CSV et Excel avec aperçu et validation ;
- export des données du problème et résultats en CSV/Excel ;
- rapport PDF synthétique ;
- préférences utilisateur : langue, thème, affichage fractions/décimales ;
- tableau de bord personnel ;
- partage de problèmes avec rôles Lecteur, Éditeur et Administrateur ;
- journal d'activité simplifié.

### 3.3 Fonctions avancées à différer

Ne pas développer dans le premier incrément :
- programmation linéaire en nombres entiers ou binaires ;
- application Android native ;
- visualisation graphique ;
- bibliothèque de modèles/exercices ;
- chatbot ou API d'IA externe ;
- paiement ou abonnement ;
- mode hors ligne complet ;
- optimisation multi-objectifs ;
- recherche systématique de toutes les solutions optimales ;
- connecteurs PostgreSQL/MySQL externes et éditeur SQL ;
- analyse de sensibilité avancée si le moteur ne la calcule pas de manière mathématiquement fiable.

Ces éléments pourront être ajoutés après stabilisation du MVP. Ne pas les présenter comme disponibles.

---

## 4. Limites fonctionnelles

Pour le MVP :
- maximum **100 variables de décision** ;
- maximum **200 contraintes** ;
- problèmes continus uniquement ;
- une seule fonction objectif par problème ;
- saisie numérique : entiers, décimaux et fractions simples (`1/2`, `-3/4`) ;
- pas d'évaluation d'expressions symboliques complexes ;
- limites imposées côté serveur, jamais uniquement dans l'interface ;
- durée maximale de résolution configurable côté serveur, valeur initiale recommandée : 120 secondes ;
- tolérance numérique configurable côté serveur ;
- précision d'affichage configurable indépendamment de la précision interne.

Si une limite est dépassée, bloquer le calcul et expliquer clairement la limite.

---

## 5. Architecture technique cible

### Frontend
- React
- TypeScript
- Vite
- interface responsive
- bibliothèque de composants cohérente et accessible
- gestion centralisée des appels API et des erreurs
- internationalisation français/anglais

### Backend
- Python
- FastAPI
- Pydantic pour la validation des contrats API
- moteur de calcul isolé du code HTTP
- tâches asynchrones pour les résolutions longues

### Données
- PostgreSQL comme base de données interne
- SQLAlchemy ou SQLModel pour l'accès aux données
- migrations versionnées avec Alembic
- stockage des tableaux/itérations associé à chaque tentative de résolution

### Exécution asynchrone
Prévoir une file de tâches et des workers (par exemple Celery/RQ avec Redis). Le choix final doit être cohérent avec le dépôt et documenté.

### Architecture logique
```text
Navigateur
   |
   v
Frontend React / TypeScript
   |
   v
API FastAPI
   |----------------------|
   v                      v
PostgreSQL            File de tâches
                          |
                          v
                    Worker Python
                          |
                          v
                    Moteur Simplexe
                          |
                          v
             Vérification mathématique
                          |
                          v
                 Résultat + itérations
```

Le frontend ne doit jamais exécuter le moteur de résolution comme source officielle du résultat. Le backend est l'autorité pour les calculs et les limites.

---

## 6. Modules de l'application

### 6.1 Authentification et compte
Fonctions P1 :
- inscription par e-mail et mot de passe ;
- connexion ;
- vérification e-mail ;
- réinitialisation du mot de passe ;
- gestion des sessions ;
- déconnexion de tous les appareils.

Prévoir ultérieurement la connexion Google et Microsoft. Ne pas stocker les mots de passe en clair. Utiliser un hachage moderne adapté aux mots de passe.

### 6.2 Tableau de bord
- liste des problèmes récents ;
- action « Nouveau problème » ;
- nombre de problèmes ;
- nombre de résolutions réussies et échouées ;
- activité récente ;
- accès aux projets et dossiers.

### 6.3 Éditeur de problème
L'utilisateur doit pouvoir :
- nommer le problème ;
- choisir maximisation ou minimisation ;
- définir les variables ;
- saisir les coefficients de la fonction objectif ;
- définir le domaine de chaque variable ;
- ajouter, modifier et supprimer des contraintes ;
- choisir le sens de chaque contrainte ;
- sauvegarder le modèle ;
- lancer la résolution.

Prévoir deux modes de saisie progressifs :
1. formulaire/tableau guidé ;
2. saisie matricielle structurée.

La saisie doit rester claire pour un débutant. Afficher les expressions mathématiques de manière lisible.

### 6.4 Validation de formulation
Détecter au minimum :
- absence de fonction objectif ;
- absence de variable ;
- coefficient non numérique ou invalide ;
- contrainte incomplète ;
- variable référencée de manière incohérente ;
- borne inférieure supérieure à la borne supérieure ;
- problème dépassant les limites ;
- données manquantes ou incohérentes.

Les erreurs bloquantes empêchent le lancement. Identifier le champ concerné et expliquer comment corriger. Ne jamais modifier silencieusement les coefficients.

### 6.5 Moteur de résolution
Le moteur doit être un module Python autonome, testable sans FastAPI.

Méthodes :
- simplexe primal lorsque les conditions d'application sont réunies ;
- méthode en deux phases lorsqu'il faut construire une base réalisable initiale ;
- transformations nécessaires pour traiter les variables libres, les bornes et les contraintes ;
- règle de Dantzig pour le choix principal de la variable entrante ;
- détection de dégénérescence et prévention du cyclage, avec activation de la règle de Bland si nécessaire ;
- règle de départage déterministe.

Chaque exécution doit enregistrer :
- méthode utilisée ;
- version du moteur ;
- statut ;
- durée ;
- valeur de l'objectif si disponible ;
- valeurs des variables si disponibles ;
- tableaux et informations de pivot ;
- messages internes de diagnostic, non exposés tels quels à l'utilisateur.

Ne pas confondre une erreur technique, une instabilité numérique, un problème infaisable et un problème non borné.

### 6.6 Vérification finale obligatoire
Avant d'afficher le statut « optimal », vérifier :
- toutes les contraintes ;
- toutes les bornes des variables ;
- la valeur de la fonction objectif recalculée à partir du modèle original ;
- la cohérence numérique de la solution ;
- les conditions d'optimalité appropriées au moteur.

Si les contrôles échouent ou si une instabilité numérique est détectée :
- ne pas annoncer une solution optimale ;
- marquer la tentative comme erreur ou instabilité numérique ;
- enregistrer les diagnostics techniques côté serveur ;
- afficher à l'utilisateur un message générique : « Une erreur est survenue. Veuillez réessayer. »

### 6.7 Résultats
Présenter les résultats dans des sections ou onglets distincts :
1. Résumé ;
2. Variables optimales ;
3. Vérification des contraintes ;
4. Analyse économique, lorsque les données mathématiques nécessaires sont disponibles ;
5. Sensibilité, uniquement lorsque les valeurs sont calculées et validées ;
6. Tableaux du simplexe.

Pour les contraintes, afficher :
- membre gauche calculé ;
- relation ;
- membre droit ;
- marge (slack/surplus) si elle est définie ;
- indication de contrainte saturée si elle est justifiée.

Pour les cas spéciaux :
- optimum unique : afficher la solution ;
- optimum multiple : afficher une solution optimale et signaler qu'il en existe d'autres ;
- infaisable : afficher « Problème infaisable » ;
- non borné : afficher « Problème non borné ».

Ne pas inventer de valeurs d'analyse de sensibilité ou de prix d'ombre.

### 6.8 Tableaux et itérations
Chaque itération doit pouvoir montrer :
- tableau correspondant ;
- variable entrante ;
- variable sortante ;
- élément pivot.

Interface :
- navigation précédente/suivante ;
- liste numérotée des itérations ;
- accès direct à une itération ;
- tableau avec défilement horizontal ;
- zoom ou adaptation d'affichage ;
- mise en évidence de la colonne entrante, de la ligne sortante et du pivot ;
- affichage configurable en fractions, décimales ou les deux.

Les résultats finaux et les tableaux du simplexe doivent être deux vues distinctes.

### 6.9 Historique et versions
- conserver les tentatives de résolution ;
- chaque tentative référence une version immuable du modèle ;
- chaque tentative conserve la version du moteur ;
- une modification du modèle crée une nouvelle version ;
- les anciennes résolutions restent consultables ;
- une ancienne version peut être restaurée comme nouvelle version courante ;
- la duplication copie le modèle et ses paramètres, mais pas les anciennes résolutions.

### 6.10 Import/export
P1 :
- import CSV et XLSX ;
- choix de feuille et plage ;
- aperçu avant import ;
- correspondance explicite des colonnes ;
- validation des données ;
- signalement des valeurs manquantes, doublons et incohérences ;
- aucune correction silencieuse.

Exports :
- PDF : modèle original, statut, valeur optimale, valeurs des variables ;
- Excel/CSV : coefficients du modèle, variables, contraintes et résultats essentiels ;
- tableaux du simplexe : export PDF uniquement ;
- pas de bouton d'impression directe : téléchargement PDF.

### 6.11 Partage et collaboration
P1, après stabilisation des comptes et versions :
- problème privé par défaut ;
- invitations par e-mail ;
- rôles : Lecteur, Éditeur, Administrateur ;
- maximum 5 collaborateurs actifs par problème, en plus du propriétaire ;
- invitation valable 7 jours ;
- lien de partage avec authentification obligatoire, expiration configurable (30 jours par défaut), mot de passe facultatif et révocation ;
- révocation immédiate des droits ;
- journal simplifié des actions ;
- détection des conflits d'édition ;
- aucune écriture silencieuse qui écrase le travail d'un autre utilisateur.

Le propriétaire seul gère les invitations, les rôles et les liens de partage.

---

## 7. Modèle de données initial

Le schéma exact doit être adapté après audit du dépôt. Prévoir au minimum les entités suivantes :

- `users` : comptes utilisateurs ;
- `projects` : espaces de travail ;
- `folders` : dossiers ;
- `problems` : identité d'un problème ;
- `model_versions` : versions immuables du modèle ;
- `resolutions` : tentatives de résolution ;
- `iterations` : tableaux et pivots d'une tentative ;
- `collaborations` : droits des collaborateurs ;
- `invitations` : invitations ;
- `activity_logs` : journal d'activité ;
- `user_preferences` : langue, thème et affichage numérique.

Une résolution doit référencer explicitement `model_version_id` et `engine_version`. Les tableaux doivent être rattachés à une résolution, jamais uniquement au problème courant.

Prévoir les clés étrangères, index, contraintes d'intégrité et règles de suppression. Isoler les données par utilisateur côté serveur. Pour une version multi-utilisateur, appliquer des contrôles d'autorisation à chaque accès à un problème.

Ne pas considérer ce paragraphe comme un schéma SQL final : produire les migrations réelles et les tester.

---

## 8. Contrats API indicatifs

Les routes peuvent être ajustées, mais leur comportement doit être équivalent.

```text
POST   /api/v1/problems
GET    /api/v1/problems
GET    /api/v1/problems/{problem_id}
PATCH  /api/v1/problems/{problem_id}
DELETE /api/v1/problems/{problem_id}

POST   /api/v1/problems/{problem_id}/versions
GET    /api/v1/problems/{problem_id}/versions
GET    /api/v1/versions/{version_id}

POST   /api/v1/versions/{version_id}/resolutions
GET    /api/v1/resolutions/{resolution_id}
GET    /api/v1/resolutions/{resolution_id}/iterations
GET    /api/v1/resolutions/{resolution_id}/iterations/{iteration_number}
POST   /api/v1/resolutions/{resolution_id}/cancel

POST   /api/v1/import/preview
POST   /api/v1/export/pdf
POST   /api/v1/export/xlsx
```

Une résolution longue doit retourner un identifiant de tâche et un statut. Le frontend interroge ensuite l'état de la résolution ou utilise un canal temps réel si celui-ci est réellement implémenté.

Statuts possibles :
- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`
- `timed_out`
- `numerical_instability`

Les réponses API doivent être validées par des schémas Pydantic. Ne jamais exposer de trace d'exception, mot de passe, jeton ou secret au frontend.

### Exemple de modèle transmis au backend
```json
{
  "name": "Production",
  "sense": "maximize",
  "objective": {
    "x1": 40,
    "x2": 30
  },
  "variables": {
    "x1": {"type": "lower_bounded", "lower": 0},
    "x2": {"type": "lower_bounded", "lower": 0}
  },
  "constraints": [
    {
      "name": "Ressource A",
      "coefficients": {"x1": 2, "x2": 1},
      "operator": "<=",
      "rhs": 100
    },
    {
      "name": "Ressource B",
      "coefficients": {"x1": 1, "x2": 2},
      "operator": "<=",
      "rhs": 80
    }
  ]
}
```

Pour ce modèle, le résultat attendu est `x1 = 40`, `x2 = 20`, `Z = 2200`. Le moteur doit retrouver ce résultat et vérifier les deux contraintes.

---

## 9. Interface utilisateur — parcours principal

### Parcours A : première résolution
1. L'utilisateur ouvre Simplex Solver.
2. Il choisit « Nouveau problème ».
3. Il saisit le nom, le type d'objectif, les variables et les contraintes.
4. Il visualise une synthèse mathématique de son modèle.
5. Il clique sur « Vérifier le modèle ».
6. Les erreurs éventuelles sont affichées avec leurs champs.
7. Si le modèle est valide, il clique sur « Résoudre ».
8. L'interface affiche l'état de la tâche.
9. À la fin, elle affiche le résultat et les contrôles.
10. L'utilisateur ouvre l'onglet des tableaux et parcourt les itérations.

### Parcours B : reprendre un problème
1. L'utilisateur ouvre son tableau de bord.
2. Il choisit un problème existant.
3. Il consulte la version courante ou l'historique.
4. Il peut consulter les anciennes résolutions.
5. S'il modifie le modèle, une nouvelle version est créée lors de la sauvegarde officielle.
6. Il peut lancer une nouvelle résolution sans supprimer les anciennes.

### Principes UX
- interface claire, sobre et professionnelle ;
- palette visuelle pétrole et sable ;
- priorité à la lisibilité des expressions et tableaux mathématiques ;
- explications courtes pour les étudiants débutants ;
- erreurs compréhensibles et proches du champ concerné ;
- aucune action destructive sans confirmation explicite ;
- navigation cohérente et responsive ;
- accessibilité clavier, contraste, libellés et lecteurs d'écran.

---

## 10. Sécurité et confidentialité

Exigences minimales :
- HTTPS/TLS en production ;
- mots de passe hachés avec un algorithme adapté ;
- validation et autorisation côté serveur ;
- protection contre injections SQL, XSS, CSRF selon le mode d'authentification ;
- limitation de débit ;
- gestion sécurisée des sessions ;
- secrets dans variables d'environnement ou gestionnaire de secrets ;
- chiffrement des données sensibles au repos ;
- journaux sans mots de passe, jetons ni données d'identification de connexion ;
- séparation stricte des données entre utilisateurs ;
- sauvegardes sécurisées et procédure de restauration testée ;
- contrôle de dépendances et de licences avant intégration ;
- tests de sécurité avant mise en production.

Ne jamais faire confiance à un identifiant utilisateur envoyé par le navigateur sans vérifier son autorisation côté backend.

Les journaux techniques sont conservés 90 jours. Les traces minimales de suppression sont conservées un an. Les données utilisateur ne sont pas supprimées automatiquement en raison de leur ancienneté.

La suppression définitive d'un problème doit demander une confirmation renforcée et ne doit pas être implémentée comme une simple suppression visuelle.

---

## 11. Tests et critères d'acceptation

### 11.1 Tests mathématiques indispensables

Créer des tests automatisés couvrant au minimum :

1. Maximisation avec contraintes `≤`.
2. Minimisation.
3. Contraintes `≥`.
4. Contraintes `=`.
5. Variable libre.
6. Variable non positive.
7. Bornes inférieure et supérieure.
8. Nécessité de la méthode en deux phases.
9. Problème infaisable.
10. Problème non borné.
11. Optimum multiple.
12. Dégénérescence.
13. Départage déterministe.
14. Détection de cyclage et règle anti-cyclage.
15. Erreurs numériques et tolérances.
16. Vérification de la solution dans le modèle original.

Comparer les résultats à des exemples de référence fiables. Tester aussi les petits problèmes dont la solution peut être vérifiée manuellement.

### 11.2 Tests applicatifs
- création, lecture, modification et suppression d'un problème ;
- validation des données invalides ;
- lancement, suivi et annulation d'une résolution ;
- conservation des anciennes tentatives ;
- isolation des données entre utilisateurs ;
- gestion des erreurs réseau ;
- import et export ;
- navigation dans les tableaux ;
- affichage mobile et desktop ;
- permissions de partage.

### 11.3 Critères de validation P0
Le noyau P0 est accepté uniquement si :
- un utilisateur peut saisir un problème valide ;
- le backend valide le modèle ;
- le moteur résout réellement les cas pris en charge ;
- le résultat est recalculé et vérifié sur le modèle original ;
- les cas infaisable et non borné sont correctement distingués ;
- les tableaux et informations de pivot sont consultables ;
- les limites 100 variables/200 contraintes sont appliquées côté serveur ;
- les tests mathématiques passent ;
- aucune donnée de test ou solution fictive n'est affichée comme un vrai résultat.

---

## 12. Organisation recommandée du dépôt

Adapter cette structure au dépôt existant plutôt que de la forcer :

```text
simplex-solver/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── problems/
│   │   │   ├── solver/
│   │   │   ├── results/
│   │   │   └── dashboard/
│   │   ├── services/
│   │   ├── i18n/
│   │   └── types/
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── solver/
│   │   ├── workers/
│   │   └── main.py
│   ├── tests/
│   ├── alembic/
│   └── requirements.txt
├── docs/
├── .env.example
├── .gitignore
└── README.md
```

---

## 13. Plan de développement obligatoire

### Étape 0 — Audit et préparation
- inspecter le dépôt et identifier le code existant ;
- vérifier les versions et dépendances ;
- identifier les fonctions déjà réalisées ;
- proposer un plan sans supprimer le travail existant ;
- préparer les environnements frontend et backend ;
- créer `.env.example` et une documentation de lancement.

**Livrable :** rapport d'audit et projet exécutable localement.

### Étape 1 — Moteur mathématique autonome
- définir le format canonique du modèle ;
- construire le validateur ;
- implémenter les transformations ;
- implémenter le simplexe primal ;
- implémenter la méthode en deux phases ;
- gérer les statuts spéciaux ;
- enregistrer les tableaux et pivots ;
- implémenter la vérification indépendante ;
- créer les tests mathématiques.

**Livrable :** moteur Python testable en ligne de commande, sans interface.

### Étape 2 — API et persistance
- créer les modèles de données ;
- créer les migrations ;
- exposer les endpoints de problèmes et résolutions ;
- mettre en place les tâches asynchrones ;
- stocker les résultats et itérations ;
- tester l'API.

**Livrable :** API documentée et fonctionnelle.

### Étape 3 — Interface du solveur
- construire le formulaire de problème ;
- afficher la synthèse mathématique ;
- intégrer la validation ;
- lancer une résolution ;
- afficher le statut ;
- afficher les résultats ;
- afficher les tableaux et naviguer entre les itérations.

**Livrable :** parcours complet de création et résolution.

### Étape 4 — Comptes et gestion des travaux
- authentification ;
- tableau de bord ;
- projets et dossiers ;
- versions et historique ;
- préférences utilisateur.

**Livrable :** espace utilisateur fonctionnel.

### Étape 5 — Import/export et collaboration
- import CSV/XLSX ;
- export PDF/CSV/XLSX ;
- partage et rôles ;
- conflits d'édition ;
- journal d'activité.

**Livrable :** fonctions complémentaires testées.

### Étape 6 — Durcissement et publication
- tests de sécurité ;
- tests multi-navigateurs et mobiles ;
- tests de charge raisonnables ;
- monitoring et sauvegardes ;
- staging ;
- validation humaine ;
- déploiement production ;
- procédure de rollback.

**Livrable :** version MVP déployable et documentée.

Ne passe pas à l'étape suivante tant que les critères d'acceptation de l'étape actuelle ne sont pas atteints.

---

## 14. Déploiement, qualité et maintenance

Prévoir trois environnements séparés :
- développement ;
- staging/test ;
- production.

Pipeline de livraison :
1. tests automatisés ;
2. vérifications de sécurité et dépendances ;
3. déploiement staging ;
4. tests fonctionnels ;
5. validation humaine ;
6. déploiement production.

Versionner le logiciel avec SemVer, identifiant de build, date de compilation et référence Git.

Prévoir :
- logs structurés ;
- suivi des erreurs API et du moteur ;
- disponibilité et ressources ;
- incidents et échecs de résolution ;
- sauvegardes et tests de restauration ;
- rollback automatique et manuel ;
- documentation utilisateur publique ;
- documentation technique réservée à l'équipe autorisée.

Les vulnérabilités critiques et élevées non corrigées bloquent le déploiement en production. Les dépendances doivent être vérifiées automatiquement et leurs licences contrôlées avant intégration.

---

## 15. Livrables attendus de l'agent IA

À la fin de chaque étape, fournir :
- fichiers créés et modifiés ;
- architecture réellement mise en place ;
- commandes exactes pour lancer le projet ;
- variables d'environnement nécessaires, sans secrets réels ;
- migrations et instructions de base de données ;
- tests exécutés et résultats ;
- limites connues ;
- décisions techniques prises ;
- prochaines tâches.

À la fin du MVP, fournir :
1. dépôt complet et exécutable ;
2. `README.md` clair ;
3. `.env.example` ;
4. documentation API ;
5. documentation du moteur mathématique ;
6. suite de tests ;
7. migrations de base de données ;
8. procédure de déploiement ;
9. rapport de sécurité initial ;
10. liste des fonctionnalités réellement disponibles et de celles reportées.

---

## 16. Prompt de démarrage à envoyer avec ce fichier

> Lis le fichier `SIMPLEX_SOLVER_MVP_SPEC.md` en entier et considère-le comme la référence fonctionnelle et technique du projet.
>
> Commence par auditer le dépôt actuel. Identifie le framework, les pages, les composants, les services, les dépendances, les fonctions déjà opérationnelles et les éléments manquants. Ne supprime aucun travail existant sans justification.
>
> Ensuite, présente-moi :
> 1. l'état réel du projet ;
> 2. les écarts par rapport à la spécification ;
> 3. l'architecture cible adaptée au dépôt ;
> 4. un plan de réalisation par étapes ;
> 5. les risques techniques et les décisions à confirmer.
>
> Ne commence pas par générer toute l'application en une seule fois. Après validation du plan, réalise uniquement l'étape 0, vérifie que le projet démarre, puis attends mon accord avant de passer à l'étape 1.
>
> Toute résolution doit être effectuée par un vrai moteur mathématique côté backend. Ne simule jamais les résultats et n'affiche jamais une solution comme optimale sans vérification indépendante.

---

**Fin du document — Simplex Solver MVP**
