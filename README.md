# Fluxo — Plateforme de gestion de projet collaborative

Application web PWA de gestion de projets collaborative inspirée de GitHub + Trello/Jira.  
**Couleur principale :** `#166553` | **Stack :** Angular 18 + NestJS + PostgreSQL

---

## 🚀 Démarrage rapide

### Prérequis
- Node.js 20+
- PostgreSQL 15+
- npm 10+

### 1. Base de données
```bash
createdb fluxo
createuser fluxo -P  # mot de passe : fluxo
```

### 2. Backend
```bash
cd backend
cp .env.example .env    # puis remplir les valeurs
npm install
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```
API disponible sur http://localhost:3000/api

### 3. Frontend
```bash
cd frontend
npm install
npm start
```
App disponible sur http://localhost:4200

---

## ⚙️ Configuration `.env` backend

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL PostgreSQL |
| `JWT_SECRET` | Secret pour les access tokens |
| `JWT_REFRESH_SECRET` | Secret pour les refresh tokens |
| `FRONTEND_URL` | URL du frontend (CORS) |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth Google |
| `GITHUB_CLIENT_ID/SECRET` | OAuth GitHub |
| `CONVESSA_API_KEY` | API WhatsApp OTP (Convessa) |
| `MAIL_HOST` | Serveur SMTP (smtp.gmail.com) |
| `MAIL_PORT` | Port SMTP (465 pour SSL, 587 pour TLS) |
| `MAIL_USERNAME` | Adresse email expéditeur |
| `MAIL_PASSWORD` | **App Password Gmail** (pas le mot de passe du compte) |
| `RESEND_API_KEY` | Clé API Resend (alternative au SMTP) |

### 📧 Configurer Gmail (App Password)
1. Activer la vérification en 2 étapes sur [myaccount.google.com/security](https://myaccount.google.com/security)
2. Générer un App Password sur [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Copier le code 16 chars **sans espaces** dans `MAIL_PASSWORD`

---

## 📱 Fonctionnalités

| Module | Statut |
|---|---|
| Auth OAuth (Google/GitHub) + OTP WhatsApp | ✅ |
| Workspaces et projets | ✅ |
| Tâches Kanban/Liste avec drag & drop | ✅ |
| Assignation multiple par tâche | ✅ |
| Commentaires avec pièces jointes | ✅ |
| Sous-tâches et checklists | ✅ |
| Invitations (email, WhatsApp, pseudo) | ✅ |
| Gestion des membres et rôles | ✅ |
| Fil d'activité et heatmap GitHub-style | ✅ |
| Messagerie instantanée (channels + DMs) | ✅ |
| Messages vocaux (enregistrement) | ✅ |
| Upload fichiers dans les messages | ✅ |
| Visioconférence WebRTC | ✅ |
| Documents et fichiers partagés | ✅ |
| Variables d'environnement chiffrées | ✅ |
| Fichiers confidentiels (Google SA, certs) | ✅ |
| Annonces épinglées | ✅ |
| Intégration GitHub webhooks | ✅ |
| Recherche globale | ✅ |
| Notifications in-app + email | ✅ |
| PWA (installable sur mobile) | ✅ |
| Thème clair/sombre/système | ✅ |

---

## 🏗️ Architecture

```
fluxo/
├── backend/          # NestJS API
│   ├── src/
│   │   ├── auth/           # OAuth + JWT + OTP
│   │   ├── workspaces/     # Workspaces
│   │   ├── projects/       # Projets
│   │   ├── tasks/          # Tâches
│   │   ├── messaging/      # Messagerie
│   │   ├── realtime/       # WebSocket (Socket.io)
│   │   ├── secrets/        # Variables env chiffrées
│   │   ├── search/         # Recherche globale
│   │   └── ...
│   └── prisma/       # Schéma et migrations
│
└── frontend/         # Angular 18 PWA
    └── src/app/
        ├── core/           # Services, modèles, guards
        ├── features/       # Pages et vues
        │   ├── auth/
        │   ├── dashboard/
        │   ├── project/
        │   ├── messaging/
        │   ├── call/       # Visioconférence WebRTC
        │   └── ...
        └── shared/         # Composants partagés
```

---

## 🧪 Données de démo

```bash
cd backend && npm run seed
# Crée : alice@fluxo.app + workspace + projet de démo
```

---

## 🚀 Déploiement

- **Frontend** : Netlify (netlify.toml configuré)
- **Backend** : Railway/Render
- **DB** : Supabase ou Railway PostgreSQL

```bash
# Build production
cd frontend && npm run build
cd backend && npm run build
```
