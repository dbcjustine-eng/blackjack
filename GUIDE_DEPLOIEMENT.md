# 🃏 Guide de déploiement — Blackjack Casino

Temps estimé : **15-20 minutes**, zéro code à écrire.

---

## ÉTAPE 1 — Créer un compte GitHub (gratuit)
> GitHub = l'endroit où tu stockes le code pour le déployer

1. Va sur https://github.com et crée un compte
2. Clique **"New repository"** (bouton vert)
3. Nom : `blackjack-casino`
4. Coche **"Private"** ← important, le code reste privé
5. Clique **"Create repository"**
6. Clique **"uploading an existing file"**
7. **Glisse-dépose tous les fichiers du dossier** `blackjack/` dans la page
   (respecte l'arborescence : src/, index.html, package.json, etc.)
8. Clique **"Commit changes"**

---

## ÉTAPE 2 — Créer la base de données Supabase (gratuit)
> Supabase = ta base de données pour stocker les comptes et les jetons

1. Va sur https://supabase.com et crée un compte (bouton "Start for free")
2. Clique **"New project"**
   - Nom : `blackjack`
   - Mot de passe DB : mets quelque chose (note-le)
   - Région : choisir la plus proche (ex: West EU)
3. Attends ~2 minutes que le projet se crée
4. Dans le menu gauche, clique **"SQL Editor"**
5. Clique **"New query"**
6. **Copie-colle tout le contenu du fichier `supabase_schema.sql`** dans l'éditeur
7. Clique **"Run"** ✅ — ta table est créée avec ton compte admin

### Récupérer tes clés API Supabase
1. Menu gauche → **Settings** → **API**
2. Note les deux valeurs :
   - **Project URL** → ressemble à `https://abcdefgh.supabase.co`
   - **anon public key** → longue chaîne qui commence par `eyJ...`

---

## ÉTAPE 3 — Déployer sur Vercel (gratuit)
> Vercel = hébergement gratuit, tes potes accèdent via un lien

1. Va sur https://vercel.com et clique **"Sign up with GitHub"**
2. Une fois connecté, clique **"Add New Project"**
3. Trouve ton repo `blackjack-casino` et clique **"Import"**
4. **AVANT de cliquer Deploy**, configure les variables d'environnement :
   - Clique **"Environment Variables"**
   - Ajoute : `VITE_SUPABASE_URL` = ta Project URL Supabase
   - Ajoute : `VITE_SUPABASE_ANON_KEY` = ta anon key Supabase
5. Clique **"Deploy"** 🚀

Vercel te génère un lien du style :
**`https://blackjack-casino-xxxx.vercel.app`**

→ C'est ce lien que tu envoies à tes potes !

---

## ÉTAPE 4 — Créer les comptes de tes potes

1. Va sur ton lien Vercel
2. Connecte-toi avec `admin` / `admin123`
   ⚠️ **Change le mot de passe admin** : dans Supabase → Table Editor → players → edit
3. Dans le panel admin, onglet **"➕ Créer"**
4. Crée un compte pour chaque pote avec le pseudo et mot de passe de ton choix
5. Crédite-leur des jetons de départ

---

## Résumé des URLs importantes

| Service  | Lien |
|----------|------|
| Ton appli | `https://blackjack-casino-xxxx.vercel.app` |
| Dashboard Supabase | https://app.supabase.com |
| Dashboard Vercel | https://vercel.com/dashboard |

---

## ❓ FAQ

**Mes potes voient-ils le code ?**
Non. Le repo GitHub est privé. Ils ont juste le lien de l'appli.

**Les jetons sont-ils sauvegardés ?**
Oui ! Tout est dans Supabase. Même si tout le monde ferme la page, les jetons restent.

**Comment modifier le solde d'un joueur ?**
Connecte-toi en admin → panel admin → sélectionne le joueur → créditer/retirer.

**Est-ce vraiment gratuit ?**
Oui. Vercel gratuit = largement suffisant pour un usage entre amis.
Supabase gratuit = jusqu'à 500 MB et 50 000 requêtes/mois (plus que suffisant).

**Comment mettre à jour l'appli si je modifie le code ?**
Tu re-uploades les fichiers modifiés sur GitHub → Vercel redéploie automatiquement.
