# Documentation du moteur mathématique — Simplex Solver

Module : `server/solver/` (version moteur : `1.0.0-mvp`)  
Exécution : 100 % côté serveur, isolé d’Express et de PostgreSQL, testable directement en CLI.

---

## 1. Représentation numérique exacte (`server/solver/rational.ts`)

Pour éliminer les erreurs d’arrondi flottant lors des pivots successifs, tous les calculs du simplexe reposent sur une arithmétique rationnelle exacte `Rational(num: bigint, den: bigint)` réduite automatiquement par PGCD :

- Entrées acceptées : entiers, décimaux exacts (`0.25`, `1e-3`) et fractions simples (`1/2`, `-3/4`).
- Rejet strict : expressions symboliques (`sqrt(2)`, `1+2`, `pi`), `NaN`, `Infinity`, diviseur nul.
- Garde de sécurité (`MAX_RATIONAL_BITS = 4096`) : lève `RationalPrecisionError` si une fraction dégénère au point de dépasser la précision sûre, classant alors la tentative en `numerical_instability` plutôt que d’afficher un faux optimal.

---

## 2. Validation et normalisation (`validator.ts`, `transformer.ts`)

Avant toute transformation, `validateAndParseModel` applique côté serveur :
- Plafonds : `1 <= variables <= maxVariables` (100) et `1 <= constraints <= maxConstraints` (200).
- Vérification des noms de variables, absence de doublons, cohérence des références dans l’objectif et les contraintes, bornes non inversées (`lower <= upper`).

Transformations vers la forme standard de minimisation / maximisation :
1. **Translation de bornes finies :**
   - `lower_bounded` ($x \ge l$) $\rightarrow x = x' + l$ avec $x' \ge 0$.
   - `upper_bounded` ($x \le u$) $\rightarrow x = u - x'$ avec $x' \ge 0$.
   - `bounded` ($l \le x \le u$) $\rightarrow x = x' + l$ avec $0 \le x' \le u - l$ (ajout explicite de contrainte $x' \le u - l$).
2. **Signes généraux :**
   - `non_positive` ($x \le 0$) $\rightarrow x = -x'$ avec $x' \ge 0$.
   - `free` ($x \in \mathbb{R}$) $\rightarrow x = x^+ - x^-$ avec $x^+, x^- \ge 0$.
3. **Normalisation des contraintes :**
   - Si membre droit $b_i < 0$ après translation des constantes : multiplication de la ligne par $-1$ et inversion de l’inégalité (`<=` $\leftrightarrow$ `>=`).
   - Ajout de variables d’écart (`<=`), de surplus et artificielles (`>=`, `=`).

---

## 3. Algorithme du Simplexe et Méthode en deux phases (`simplex.ts`)

- **Simplexe primal direct :** utilisé lorsque toutes les contraintes normalisées possèdent une variable d’écart initiale formant une base réalisable ($b \ge 0$ et aucun terme artificiel requis).
- **Méthode en deux phases :**
  - *Phase 1 :* minimisation de la somme des variables artificielles $W = \sum a_k$. Si $W^* > 0$, le problème est déclaré **infaisable** (`infeasible`). Si une variable artificielle reste en base à valeur nulle (contrainte redondante), elle est proprement éjectée de la base ou traitée sans fausser la Phase 2.
  - *Phase 2 :* suppression des colonnes artificielles, restauration de la fonction objectif réelle et poursuite jusqu’à l’optimalité ou détection d’absence de borne.
- **Règles de pivotage et anti-cyclage :**
  - Choix principal de la variable entrante : **règle de Dantzig** (coût réduit le plus favorable, départage déterministe par plus petit indice).
  - Détection de **dégénérescence** (rapport minimal $\theta = 0$ ou bases répétées via signature canonique).
  - **Règle de Bland** activée automatiquement dès qu’une répétition de base ou série dégénérée est détectée, garantissant la terminaison finie.
- **Cas particuliers :**
  - **Optimum multiple (`optimal_multiple`) :** détecté lorsque toutes les conditions d’optimalité sont satisfaites et qu’au moins une variable hors-base possède un coût réduit nul et une colonne candidate admissible.
  - **Non borné (`unbounded`) :** détecté lorsqu’une variable entrante améliorante ne possède aucun coefficient strictement positif dans sa colonne.
  - **Interruption (`cancelled` / `timed_out`) :** vérification régulière de `AbortSignal` et de l’échéance `timeoutMs`.

---

## 4. Vérification indépendante post-résolution (`verifier.ts`)

Avant qu’un statut `optimal_unique` ou `optimal_multiple` ne soit validé :
1. Reconstruction des variables originales $x$ à partir des variables transformées.
2. Vérification de chaque borne originale ($x_j \in [l_j, u_j]$) sans violation.
3. Recalcul indépendant du membre gauche $\sum_j a_{ij} x_j$ de chaque contrainte sur le **modèle original** et validation de la relation `<=`, `>=` ou `=`.
4. Recalcul indépendant de $Z = \sum_j c_j x_j$ et vérification de l’écart nul avec la valeur finale du tableau.

En cas d’échec d’un seul contrôle, la résolution bascule en `numerical_instability` et aucune solution n’est présentée comme optimale.
