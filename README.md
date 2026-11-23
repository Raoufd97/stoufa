# Boutique de Stoufa — version GitHub Pages + Supabase

C'est la même appli que sur Claude (même design, mêmes onglets, mêmes calculs).
Seul l'endroit où les données sont enregistrées change : Supabase au lieu de Claude.

## Contenu du dossier

| Fichier | Rôle | Va sur GitHub ? |
|---|---|---|
| `index.html` | L'appli, inchangée sauf l'adresse des photos | Oui |
| `supabase-adapter.js` | Fait le lien entre l'appli et Supabase (base, photos, export Excel, code d'accès) | Oui |
| `config.js` | L'adresse du projet Supabase et la clé « anon » (publique) | Oui |
| `icon.svg`, `icon-180.png` | Icône pour l'écran d'accueil du téléphone | Oui |
| `supabase/schema.sql` | Crée la table, la sécurité, le temps réel et le bucket photos | Oui (aucune donnée dedans) |
| `migration/` | Copie des données + script de transfert | **Non** (bloqué par `.gitignore`) |

## Mise en place (une seule fois)

### 1. Supabase
1. Crée un projet gratuit sur supabase.com.
2. **SQL Editor** → New query → colle tout `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user** : crée le compte de la boutique
   (e-mail `boutique@stoufa.app` ou un autre, et un mot de passe = le code d'accès).
   Coche « Auto Confirm User ».
4. **Authentication → Sign In / Providers** : désactive **Allow new users to sign up**,
   pour que personne d'autre ne puisse créer un compte.
5. **Project Settings → API** : copie l'**URL** et la clé **anon public** dans `config.js`
   (et l'e-mail du compte si tu en as choisi un autre).

### 2. Transfert des données (au moment de basculer)
Ne le fais qu'au dernier moment, pour ne rien perdre de ce qui est saisi entre-temps
sur la version Claude.
```bash
cd migration
npm install
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=xxxx node migrate.mjs
```
La clé `service_role` se trouve aussi dans Project Settings → API. Elle reste sur ton
ordinateur : jamais dans `config.js`, jamais sur GitHub.

### 3. GitHub Pages
1. Crée un dépôt (par ex. `stoufa`) et pousse le dossier (sans `migration/`, c'est automatique).
2. **Settings → Pages** → Source : *Deploy from a branch* → `main` / `(root)`.
3. L'appli est en ligne sur `https://<ton-pseudo>.github.io/stoufa/`.

Aucun nom de domaine n'est nécessaire.

## Sur le téléphone
- Ouvre le lien dans Chrome (Android) ou Safari (iPhone), entre le code d'accès une fois.
- Menu du navigateur → **Ajouter à l'écran d'accueil**.

## Bon à savoir
- Ce que l'un enregistre apparaît chez les autres en quelques secondes.
- Un comptage pas encore validé reste sur le téléphone de la personne qui compte.
- Les photos sont lisibles par leur lien (adresse longue et aléatoire). Les fiches,
  prix et ventes ne sont visibles qu'avec le code d'accès.
- Supabase gratuit met le projet en pause après environ une semaine sans aucune
  utilisation : il suffit de cliquer sur « Restore » dans le tableau de bord.

## Structure du site (depuis novembre 2026)

| Adresse | Contenu |
|---|---|
| `/` | Vitrine publique (générée) |
| `/pieces/<nom>/` | Une page par pièce (générée) |
| `/categorie/velo/`, `mobylette/`, `peugeot/`, `vespa/` | Pages catégories (générées) |
| `/gestion/` | Appli de gestion (code d'accès, non indexée) |
| `/gestion/import.html` | Import d'une sauvegarde .zip |
| `/sitemap.xml` | Plan du site pour Google Search Console |

Les pages de la vitrine sont générées par `scripts/build-vitrine.mjs` à partir de la vue `catalogue`
(`supabase/catalogue.sql`). La GitHub Action `Vitrine` les régénère chaque nuit, et à la demande
(onglet Actions → Vitrine → Run workflow). Ne pas modifier `index.html`, `pieces/` ni `categorie/` à la main.
