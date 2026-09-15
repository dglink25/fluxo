# Spécification — Visioconférence Fluxo

## Vue d'ensemble

Permettre aux utilisateurs de **lancer immédiatement** ou **planifier** une visioconférence depuis n'importe quel contexte de l'application (channel de projet, message direct), avec notifications multi-canaux (Push in-app, Email, WhatsApp), rappels automatiques pour les appels planifiés, et une expérience modale flottante permettant de naviguer dans l'app pendant l'appel.

---

## Requirements

### R1 — Lancer un appel immédiat

**R1.1** L'utilisateur peut lancer un appel vidéo immédiat depuis :
- Un channel de projet (bouton dans la barre d'outils du channel)
- Une conversation directe / DM (bouton dans la barre d'outils du DM)

**R1.2** Lors du lancement, un message système est automatiquement posté dans le channel ou DM d'origine, contenant :
- Le nom de l'hôte
- Le titre de l'appel (si renseigné)
- Un bouton / lien cliquable "Rejoindre la visioconférence"

**R1.3** Tous les participants invités reçoivent simultanément :
- Une **notification push in-app** (via WebSocket, event `call:invite`)
- Un **email** d'invitation avec lien de rejoindre
- Un **message WhatsApp** (via Convessa) avec lien de rejoindre
- Le message dans le chat (R1.2)

**R1.4** L'hôte rejoint l'appel immédiatement après la création.

---

### R2 — Planifier un appel

**R2.1** L'utilisateur peut planifier un appel pour une date et heure future depuis les mêmes points d'entrée que R1.

**R2.2** Le formulaire de planification comprend :
- Titre de la visioconférence (obligatoire)
- Date et heure (obligatoires, doivent être dans le futur)
- Liste de participants (sélection parmi les membres du projet ou les contacts DM)

**R2.3** À la création de l'appel planifié, les participants reçoivent immédiatement :
- Une **notification push in-app** (event `call:scheduled`)
- Un **email** de confirmation avec date/heure et lien
- Un **message WhatsApp** de confirmation avec date/heure et lien
- Un message dans le chat (channel ou DM) indiquant la date/heure prévue

**R2.4** Des rappels automatiques sont envoyés aux participants via les **3 canaux** (push, email, WhatsApp) à :
- **1 heure avant** l'heure planifiée
- **5 minutes avant** l'heure planifiée
- **À l'heure exacte** (l'appel passe automatiquement au statut LIVE)

**R2.5** Chaque type de rappel n'est envoyé qu'une seule fois par appel (pas de doublons si le cron tourne plusieurs fois dans la fenêtre).

---

### R3 — Expérience modale flottante (Picture-in-Picture interne)

**R3.1** Quand un utilisateur est en cours d'appel et navigue vers une autre page de l'application, la visioconférence **ne se ferme pas** — elle se réduit en un modal flottant positionné en bas à droite de l'écran.

**R3.2** Le modal flottant affiche :
- La vidéo distante (ou locale si pas encore de pair connecté)
- Les contrôles essentiels : micro, caméra, raccrocher
- Un bouton pour revenir à la vue plein écran de l'appel

**R3.3** Le modal flottant est **toujours visible** quelle que soit la page consultée (dashboard, projets, messaging, profil, etc.), sans bloquer la navigation.

**R3.4** L'utilisateur peut naviguer librement dans l'application (cliquer sur des menus, ouvrir des projets, consulter des messages) **pendant l'appel actif**.

**R3.5** Quand l'utilisateur clique sur "agrandir" dans le modal flottant, il revient à la vue `/call?room=<roomId>` en plein écran.

---

### R4 — Ouvrir l'appel dans un nouvel onglet

**R4.1** Depuis n'importe quel endroit où le lien de l'appel est visible (message dans le chat, notification, modal), l'utilisateur peut ouvrir l'appel dans un **nouvel onglet du navigateur**.

**R4.2** L'URL de l'appel (`/call?room=<roomId>`) est fonctionnelle dans un nouvel onglet (authentification et connexion WebRTC gérées normalement).

---

### R5 — Partager le lien de l'appel

**R5.1** Depuis la vue de l'appel (plein écran ou modal flottant), l'utilisateur peut copier le lien de l'appel dans le presse-papiers via un bouton dédié.

**R5.2** Le lien copié est l'URL complète `<FRONTEND_URL>/call?room=<roomId>`, accessible directement depuis un navigateur.

**R5.3** Un retour visuel confirme la copie (ex. : icône checkmark pendant 2 secondes).

---

### R6 — Ouvrir le chat pendant un appel

**R6.1** Depuis la vue plein écran de l'appel, l'utilisateur peut ouvrir un panneau latéral de chat **sans quitter l'appel**.

**R6.2** Le panneau de chat affiche les messages du channel ou DM depuis lequel l'appel a été lancé.

**R6.3** L'utilisateur peut envoyer des messages dans ce panneau pendant que l'appel est actif.

**R6.4** Si l'appel est passé en modal flottant, l'accès au chat se fait via la navigation normale (l'utilisateur peut naviguer vers `/messaging`).

---

### R7 — Gestion du cycle de vie de l'appel

**R7.1** L'hôte peut terminer l'appel pour tous les participants via un bouton "Raccrocher" (ou "Terminer l'appel").

**R7.2** Chaque participant peut quitter l'appel individuellement sans le terminer pour les autres.

**R7.3** Quand tous les participants ont quitté, l'appel passe automatiquement au statut `ENDED`.

**R7.4** Un appel planifié peut être **annulé** par l'hôte avant son démarrage. Les participants reçoivent une notification d'annulation (push + email + WhatsApp).

**R7.5** L'appel planifié qui passe en `LIVE` à l'heure exacte (via le cron `now`) envoie une notification aux participants pour les prévenir que l'appel a commencé.

---

### R8 — Intégration backend manquante (complétion)

**R8.1** Le `VideoCallService` doit être exposé via un `VideoCallController` et un `VideoCallModule` enregistré dans `AppModule`.

**R8.2** Le `SchedulerService` doit appeler `VideoCallService.sendReminders('1h')`, `sendReminders('5min')` et `sendReminders('now')` via des crons dédiés (toutes les 5 minutes ou adapté).

**R8.3** Le `WhatsappService` doit implémenter les méthodes `sendCallInviteMessage()` et `sendCallReminderMessage()` manquantes.

**R8.4** Le `MailService` doit implémenter les méthodes `sendCallInviteEmail()` et `sendCallReminderEmail()` manquantes.

---

### R9 — Contraintes techniques

**R9.1** La solution WebRTC reste **peer-to-peer** (pas de MCU/SFU tiers) pour les appels jusqu'à 4 participants. Au-delà, un avertissement est affiché.

**R9.2** La signalisation continue via le gateway Socket.IO existant (`/ws`).

**R9.3** Le modal flottant est implémenté dans le composant racine Angular (`AppComponent`) via un service d'état partagé (`CallStateService`), pour être disponible sur toutes les routes.

**R9.4** L'état de l'appel actif (roomId, statut, participants) est géré dans un `CallStateService` singleton (Angular) partagé entre `CallComponent` et `AppComponent`.

**R9.5** Les appels à `sendCallInviteEmail`, `sendCallReminderEmail`, `sendCallInviteMessage`, `sendCallReminderMessage` sont toujours enveloppés dans un `.catch()` — les erreurs de livraison ne bloquent pas la création de l'appel.

---

## Critères d'acceptance

| ID  | Critère |
|-----|---------|
| AC1 | Lancer un appel depuis un channel envoie un message dans le channel ET notifie par push/email/WhatsApp tous les participants dans les 5 secondes |
| AC2 | Planifier un appel pour H+1 entraîne l'envoi d'un rappel push/email/WhatsApp à H-1h, H-5min et exactement à H |
| AC3 | Naviguer vers `/dashboard` pendant un appel affiche le modal flottant avec vidéo et contrôles |
| AC4 | Cliquer "agrandir" dans le modal flottant revient à la vue plein écran sans reconnecter WebRTC |
| AC5 | Le bouton "Copier le lien" copie l'URL complète et affiche un feedback visuel |
| AC6 | Le chat latéral s'ouvre en plein écran sans couper l'appel |
| AC7 | Annuler un appel planifié envoie une notification d'annulation à tous les participants |
| AC8 | Les endpoints REST `/video-calls` (POST startCall, POST scheduleCall, DELETE endCall, GET listForRoom) répondent correctement |
