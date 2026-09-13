# Fluxo

Plateforme web de gestion de projet collaborative — dans l'esprit de GitHub combiné à un outil type Trello/Jira. Créez des projets, invitez des collaborateurs, suivez vos tâches en Kanban ou en liste, et consultez le fil d'activité de votre équipe.

> **État du projet** : ce dépôt contient la **Phase 1 (MVP)** telle que définie dans le cahier des charges — authentification, projets, tâches (vues Kanban + Liste), invitations par email et rôles par projet. Les phases suivantes (temps réel, messagerie, visioconférence, intégration Git, gestion de secrets, etc.) sont prévues dans l'architecture (voir [Feuille de route](#feuille-de-route)) mais pas encore implémentées.

## Sommaire

- [Stack technique](#stack-technique)
- [Structure du dépôt](#structure-du-dépôt)
- [Authentification](#authentification)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration des identifiants OAuth et Convessa](#configuration-des-identifiants-oauth-et-convessa)
- [Démarrage en développement](#démarrage-en-développement)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Déploiement en production](#déploiement-en-production)
- [Thème clair / sombre](#thème-clair--sombre)
- [PWA mobile](#pwa-mobile)
- [Feuille de route](#feuille-de-route)

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Angular 18 (standalone components + Signals), PWA (Service Worker) |
| Backend | NestJS (Node.js / TypeScript) |
| Base de données | PostgreSQL |
| ORM | Prisma |
| Authentification | OAuth 2.0 (Google, GitHub) + JWT, vérification du téléphone par OTP WhatsApp |
| WhatsApp (OTP) | [Convessa](https://convessa.epac-uac-optica-chapter.bj/) |
| Emails | Resend (invitations projet uniquement) |

## Structure du dépôt

```
fluxo/
├── backend/          # API NestJS
│   ├── prisma/       # Schéma de base de données + seed
│   └── src/
│       ├── auth/         # OAuth Google/GitHub, JWT, vérification téléphone (OTP)
│       ├── whatsapp/      # Intégration Convessa (envoi de l'OTP par WhatsApp)
│       ├── users/
│       ├── projects/     # CRUD projets, rôles, membres, activité
│       ├── tasks/        # CRUD tâches, sous-tâches, commentaires
│       ├── invitations/  # Invitations par email (token + expiration)
│       ├── mail/         # Envoi d'emails (Resend)
│       └── common/       # Guards de rôles, décorateurs partagés
├── frontend/         # Application Angular (PWA)
│   └── src/app/
│       ├── core/         # Services, guards, intercepteurs, modèles
│       ├── features/
│       │   ├── auth/         # Connexion OAuth, callback, vérification téléphone
│       │   ├── dashboard/
│       │   ├── project/      # Kanban + Liste
│       │   ├── notifications/
│       │   └── profile/
│       └── shared/       # Navbar, barre basse mobile, icônes SVG, thème
└── docker-compose.yml    # PostgreSQL local pour le développement
```

## Authentification

Fluxo n'utilise **aucun mot de passe**. La connexion se fait exclusivement via **Google** ou **GitHub** (OAuth 2.0). Parcours en deux temps :

1. **Connexion OAuth** — l'utilisateur clique sur "Continuer avec Google/GitHub", le backend crée le compte s'il n'existe pas encore et redirige vers le frontend avec un jeton temporaire (`scope: pending_phone`).
2. **Vérification du téléphone** — à la première connexion, l'utilisateur saisit son numéro. Le backend génère un code à **6 chiffres**, valable **3 minutes**, et l'envoie par **WhatsApp** via l'API [Convessa](https://convessa.epac-uac-optica-chapter.bj/). Une fois le code validé, un jeton complet (`scope: full`) est délivré et le compte devient utilisable normalement.

Tant que le téléphone n'est pas vérifié, aucune route protégée (projets, tâches...) n'est accessible — seules `/auth/phone/send-otp` et `/auth/phone/verify-otp` le sont.

> **Limite technique à noter** : Convessa envoie des messages WhatsApp classiques (texte, image, document, audio) — il n'existe pas de "bouton copier" interactif natif dans un message WhatsApp standard. Le message envoyé est donc formaté pour une lisibilité maximale (code en `monospace`, texte en gras), et c'est côté application que l'utilisateur dispose d'un bouton **"Coller le code"** (lecture du presse-papiers) pour accélérer la saisie.

## Prérequis

- [Node.js](https://nodejs.org/) 20 ou supérieur
- [Docker](https://www.docker.com/) (recommandé pour PostgreSQL) — ou une instance PostgreSQL déjà installée
- Un compte [Google Cloud](https://console.cloud.google.com/) (identifiants OAuth)
- Une [OAuth App GitHub](https://github.com/settings/developers)
- Une clé API [Convessa](https://convessa.epac-uac-optica-chapter.bj/) (sinon, en dev, les codes OTP s'affichent dans les logs du serveur)
- Un compte [Resend](https://resend.com) (optionnel — emails d'invitation projet, sans lien avec l'authentification)

## Installation

```bash
git clone <url-de-votre-dépôt> fluxo
cd fluxo

# Backend
cd backend
npm install
cp .env.example .env   # puis éditez .env (voir section suivante)

# Frontend
cd ../frontend
npm install
```

## Configuration des identifiants OAuth et Convessa

### Google

1. [console.cloud.google.com](https://console.cloud.google.com/) → **APIs & Services → Credentials → Create Credentials → OAuth client ID** (type "Web application").
2. **Authorized redirect URIs** : `http://localhost:3000/api/auth/google/callback` (en dev).
3. Copiez le **Client ID** et le **Client Secret** dans `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

### GitHub

1. [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**.
2. **Authorization callback URL** : `http://localhost:3000/api/auth/github/callback` (en dev).
3. Copiez le **Client ID** et générez un **Client Secret** dans `backend/.env` (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`).

### Convessa (OTP WhatsApp)

1. Créez votre clé API sur [convessa.epac-uac-optica-chapter.bj](https://convessa.epac-uac-optica-chapter.bj/) et connectez votre numéro WhatsApp expéditeur.
2. Renseignez `CONVESSA_API_KEY` et `CONVESSA_API_URL` dans `backend/.env`.
3. Sans clé configurée, le backend fonctionne quand même en dev : le code OTP s'affiche dans les logs (`[DEV] ... code OTP pour +229... : 123456`) au lieu d'être envoyé.

## Démarrage en développement

**1. Démarrer PostgreSQL** (à la racine du projet) :

```bash
docker compose up -d
```

**2. Initialiser la base de données** (dans `backend/`) :

```bash
cd backend
npx prisma migrate dev --name oauth_and_phone_verification
npx prisma db seed        # optionnel : crée un projet de démo
```

**3. Démarrer l'API** :

```bash
npm run start:dev
```

L'API est disponible sur `http://localhost:3000/api`.

**4. Démarrer le frontend** (nouveau terminal, dossier `frontend/`) :

```bash
cd frontend
npm install
npm start
```

L'application est disponible sur `http://localhost:4200`.

## Comptes de démonstration

Le seed (`npx prisma db seed`) crée un utilisateur `alice@fluxo.app` déjà marqué comme vérifié (téléphone `+22900000000`), utilisé comme simple fixture pour peupler un projet de démonstration. L'authentification étant exclusivement OAuth, il n'y a pas de mot de passe à utiliser : connectez-vous avec votre propre compte Google ou GitHub pour tester le parcours complet (y compris la vérification par WhatsApp).

## Déploiement en production

⚠️ Netlify héberge uniquement des sites statiques : le frontend Angular va sur **Netlify**, le backend NestJS va sur **Railway** ou **Render** (voir `frontend/netlify.toml`, déjà inclus, pour le routage SPA).

Variables supplémentaires à renseigner côté backend en production :

- `GOOGLE_CALLBACK_URL` / `GITHUB_CALLBACK_URL` → remplacer `localhost:3000` par l'URL réelle de l'API déployée, et mettre à jour les URIs de redirection autorisées côté Google Cloud Console et GitHub OAuth App en conséquence.
- `FRONTEND_URL` → l'URL Netlify finale (redirections post-OAuth et CORS).
- `CONVESSA_API_KEY`, `CONVESSA_API_URL` → identiques à la production Convessa.

Une fois le backend déployé, mettez à jour `frontend/src/environments/environment.prod.ts` avec l'URL réelle de l'API avant de déployer le frontend sur Netlify.

## Thème clair / sombre

Le thème suit automatiquement les préférences système (`prefers-color-scheme`) au premier chargement, avec un sélecteur manuel (clair / système / sombre) dans la barre de navigation. Le choix est mémorisé dans le navigateur (`localStorage`). Toutes les couleurs sont des variables CSS dans `frontend/src/styles.scss` — couleur d'accent : `#059669`. Aucun dégradé n'est utilisé ; toutes les icônes sont de vraies icônes vectorielles (`shared/components/icon`), sans emoji.

## PWA mobile

Une fois installée sur téléphone (Android/iOS via "Ajouter à l'écran d'accueil"), Fluxo s'affiche en plein écran (`display: standalone`) avec une **barre de navigation basse** (Projets / Notifications / Profil), dans l'esprit d'une application mobile native type WhatsApp. Cette barre est masquée automatiquement sur desktop (≥ 769px), où la navigation reste en haut.

## Feuille de route

- **Phase 2** — Invitations par téléphone/pseudo, commentaires enrichis, fil d'activité détaillé
- **Phase 3** — WebSockets (activité live, notifications en temps réel)
- **Phase 4** — Heatmap de contribution, recherche globale, pièces jointes (S3/Cloudinary)
- **Au-delà** — Messagerie instantanée temps réel, visioconférence intégrée (WebRTC), intégration Git/GitHub (webhooks), gestion de secrets chiffrés, édition collaborative de documents
