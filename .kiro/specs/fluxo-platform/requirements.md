# Document de Requirements — Fluxo Platform

## Introduction

Fluxo est une plateforme web collaborative de gestion de projet disponible en PWA (Progressive Web App). Elle permet à des équipes de créer des workspaces et des projets, d'inviter des collaborateurs, d'assigner et suivre des tâches, de communiquer en temps réel via messagerie instantanée et visioconférence, et de consulter un fil d'activité complet façon GitHub. La plateforme s'inspire de GitHub (traçabilité, intégration Git) et de Trello/Jira (Kanban, gestion de tâches), le tout dans une interface PWA responsive (mobile, tablette, desktop) avec la couleur principale `#166553`.

Le backend NestJS (Phase 1 & 2) est partiellement implémenté : authentification OAuth + OTP WhatsApp, CRUD projets/tâches, invitations, fil d'activité de base. Ce document couvre l'ensemble de la plateforme, y compris les fonctionnalités déjà existantes (pour s'assurer de leur complétude) et toutes les fonctionnalités restantes.

---

## Glossaire

- **System** : la plateforme Fluxo dans son ensemble (backend NestJS + frontend Angular PWA)
- **API** : le backend NestJS exposant les endpoints REST et WebSocket
- **Frontend** : l'application Angular PWA
- **Auth_Service** : le module d'authentification (OAuth, JWT, OTP)
- **User** : un utilisateur enregistré sur la plateforme
- **Workspace** : une organisation regroupant plusieurs projets sous une même entité
- **Project** : un espace de travail dédié à un objectif, appartenant à un Workspace
- **ProjectMember** : un User membre d'un Project avec un rôle défini
- **Task** : une tâche appartenant à un Project, assignable à un ou plusieurs membres
- **SubTask** : une sous-tâche ou un élément de checklist appartenant à une Task
- **Comment** : un message textuel attaché à une Task
- **Invitation** : une demande d'adhésion envoyée à un User ou une adresse externe
- **Activity** : un événement traçable lié à un Project ou un User
- **Notification** : un message système adressé à un User
- **Message** : un message de messagerie instantanée entre membres
- **Channel** : un fil de discussion de groupe lié à un Project
- **DirectMessage** : une conversation 1-to-1 entre deux Users
- **Meeting** : une réunion vidéo/audio programmée ou instantanée
- **Deliverable** : un livrable déposé sur une Task
- **Secret** : une variable d'environnement sensible stockée de façon chiffrée dans un Project
- **Document** : un document collaboratif lié à un Project ou une Task
- **GitIntegration** : la connexion entre un dépôt GitHub et un Project
- **Search_Service** : le moteur de recherche globale de la plateforme
- **Notification_Service** : le service d'envoi de notifications (in-app, email, push)
- **OTP** : code à usage unique à 6 chiffres, valide 3 minutes
- **JWT** : JSON Web Token utilisé pour l'authentification des requêtes

---

## Requirements

---

### Requirement 1 : Authentification OAuth et vérification du téléphone

**User Story :** En tant qu'utilisateur, je veux me connecter via Google ou GitHub et vérifier mon numéro de téléphone, afin d'accéder à la plateforme de façon sécurisée sans gérer de mot de passe.

#### Acceptance Criteria

1. WHEN un User initie une connexion OAuth (Google ou GitHub), THE Auth_Service SHALL créer un compte User s'il n'en existe pas encore, en utilisant les données du profil OAuth (email, nom complet, avatar, pseudo).
2. WHEN un User s'authentifie via OAuth pour la première fois, THE Auth_Service SHALL émettre un JWT à portée `pending_phone` valable 30 minutes, donnant accès uniquement aux endpoints de vérification du téléphone.
3. WHEN un User soumet un numéro de téléphone au format E.164, THE Auth_Service SHALL générer un OTP à 6 chiffres, le hacher avec bcrypt, et l'envoyer par WhatsApp via le service Convessa dans un délai de 10 secondes.
4. IF un OTP valide existe déjà pour le couple (userId, phone) et que moins de 30 secondes se sont écoulées depuis l'envoi, THEN THE Auth_Service SHALL retourner une erreur 429 indiquant le délai restant avant de pouvoir renvoyer un code.
5. WHEN un User soumet un OTP correct et non expiré, THE Auth_Service SHALL marquer le téléphone comme vérifié, émettre un JWT `access_token` (15 min) et un `refresh_token` (7 jours), et retourner le profil User complet.
6. IF un OTP est incorrect, THEN THE Auth_Service SHALL incrémenter le compteur de tentatives et retourner une erreur 400.
7. IF le compteur de tentatives d'un OTP atteint 5, THEN THE Auth_Service SHALL invalider le code et retourner une erreur 400 demandant un nouveau code.
8. IF un OTP est soumis après sa date d'expiration, THEN THE Auth_Service SHALL retourner une erreur 400 indiquant que le code est expiré.
9. WHEN un User présente un `refresh_token` valide, THE Auth_Service SHALL émettre un nouvel `access_token` et un nouveau `refresh_token`.
10. IF un numéro de téléphone est déjà vérifié pour un autre compte, THEN THE Auth_Service SHALL retourner une erreur 409.
11. THE Auth_Service SHALL protéger toutes les routes non-auth avec le JWT guard, rejetant les requêtes sans token valide avec une erreur 401.
12. WHILE un User possède un JWT à portée `pending_phone`, THE API SHALL rejeter l'accès à toute route autre que `/auth/phone/send-otp` et `/auth/phone/verify-otp` avec une erreur 403.

---

### Requirement 2 : Gestion des Workspaces

**User Story :** En tant qu'utilisateur, je veux créer et gérer des workspaces (organisations), afin de regrouper plusieurs projets sous une même entité et d'organiser mon travail en équipe.

#### Acceptance Criteria

1. WHEN un User crée un Workspace en fournissant un nom (3–80 caractères), THE API SHALL persister le Workspace, désigner le User créateur comme Owner, et retourner la ressource créée avec un code 201.
2. THE API SHALL lister les Workspaces dont un User est Owner ou membre, triés par date de dernière mise à jour décroissante.
3. WHEN un Owner met à jour le nom ou la description d'un Workspace, THE API SHALL persister les modifications et retourner la ressource mise à jour.
4. WHEN un Owner supprime un Workspace, THE API SHALL supprimer en cascade tous les Projects, Tasks, Members, Invitations et Activities associés.
5. IF un User tente de modifier ou supprimer un Workspace sans être Owner ou Admin, THEN THE API SHALL retourner une erreur 403.
6. THE API SHALL associer chaque Project à exactement un Workspace.

---

### Requirement 3 : Gestion des Projets

**User Story :** En tant que membre d'un Workspace, je veux créer, modifier, archiver et supprimer des projets, afin d'organiser les tâches de mon équipe par objectif.

#### Acceptance Criteria

1. WHEN un User crée un Project dans un Workspace en fournissant un nom (3–100 caractères) et une visibilité (PRIVATE ou PUBLIC), THE API SHALL persister le Project, inscrire le User en tant que ProjectMember avec le rôle OWNER, enregistrer une Activity `PROJECT_CREATED`, et retourner la ressource avec un code 201.
2. THE API SHALL lister les Projects d'un User (Owner ou Member) dans un Workspace, en excluant les projets archivés, avec le nombre de tâches et de membres.
3. WHEN un Owner ou Admin met à jour le nom, la description ou la visibilité d'un Project, THE API SHALL persister les changements.
4. WHEN un Owner archive un Project, THE API SHALL marquer le Project comme archivé et l'exclure des listes par défaut.
5. WHEN un Owner supprime un Project, THE API SHALL supprimer en cascade les Tasks, Invitations, Members, Activities et Notifications associés.
6. IF un User tente d'accéder à un Project PRIVATE sans en être membre, THEN THE API SHALL retourner une erreur 403.
7. THE API SHALL permettre à un Owner ou Admin de retirer un Member d'un Project et d'enregistrer l'Activity `MEMBER_REMOVED`.
8. THE API SHALL permettre à un Owner de changer le rôle d'un Member (ADMIN, MEMBER, READER) et d'enregistrer l'Activity `MEMBER_ROLE_CHANGED`.

---

### Requirement 4 : Système d'Invitations

**User Story :** En tant que Owner ou Admin d'un projet, je veux inviter des collaborateurs par email, téléphone ou pseudo, afin qu'ils rejoignent le projet avec le rôle approprié.

#### Acceptance Criteria

1. WHEN un Owner ou Admin envoie une invitation par email, THE API SHALL créer une Invitation avec un token unique (32 caractères), une expiration à 7 jours, envoyer un email d'invitation via le Mail_Service, et retourner la ressource Invitation avec un code 201.
2. WHEN un Owner ou Admin envoie une invitation par numéro de téléphone, THE API SHALL créer une Invitation et envoyer un message WhatsApp contenant le lien d'invitation via le WhatsApp_Service.
3. WHEN un Owner ou Admin envoie une invitation par pseudo, THE API SHALL rechercher le User correspondant, créer l'Invitation liée à ce User, créer une Notification in-app pour ce User, et retourner l'Invitation.
4. IF la cible d'une invitation est déjà membre du Project, THEN THE API SHALL retourner une erreur 409.
5. IF le pseudo fourni ne correspond à aucun User, THEN THE API SHALL retourner une erreur 404.
6. WHEN un User accepte une invitation via son token, THE API SHALL vérifier que le token est valide, non expiré et à l'état PENDING, créer le ProjectMember avec le rôle défini dans l'Invitation, passer l'Invitation à l'état ACCEPTED, et enregistrer l'Activity `MEMBER_JOINED`.
7. IF un token d'invitation est expiré au moment de l'acceptation, THEN THE API SHALL passer l'Invitation à l'état EXPIRED et retourner une erreur 400.
8. WHEN un User refuse une invitation, THE API SHALL passer l'Invitation à l'état DECLINED.
9. THE API SHALL lister les invitations en attente adressées à l'utilisateur courant (par userId, email ou téléphone).

---

### Requirement 5 : Gestion des Tâches

**User Story :** En tant que membre d'un projet, je veux créer, modifier, assigner et suivre des tâches avec sous-tâches, commentaires et pièces jointes, afin de coordonner le travail de l'équipe.

#### Acceptance Criteria

1. WHEN un Member ou Admin crée une Task dans un Project en fournissant un titre (1–200 caractères), THE API SHALL persister la Task avec les champs optionnels (description, assigneeId, priorité, date d'échéance, labels, position), enregistrer l'Activity `TASK_CREATED`, et retourner la Task avec un code 201.
2. THE API SHALL lister les Tasks d'un Project avec filtres combinables par status, assigneeId et priority, incluant l'assigné, les sous-tâches et le nombre de commentaires.
3. WHEN un Member met à jour le status d'une Task, THE API SHALL persister le changement et enregistrer l'Activity `TASK_STATUS_CHANGED` avec le nouveau statut.
4. THE API SHALL supporter les statuts de Task : TODO, IN_PROGRESS, IN_REVIEW, DONE, et permettre à un Owner ou Admin de définir des statuts personnalisés par Project.
5. THE API SHALL supporter les priorités de Task : LOW, MEDIUM, HIGH, URGENT.
6. WHEN un Member crée une SubTask en fournissant un titre, THE API SHALL persister la SubTask liée à la Task parente avec `done: false`.
7. WHEN un Member modifie l'état `done` d'une SubTask, THE API SHALL persister le changement.
8. WHEN un Member ajoute un Comment à une Task, THE API SHALL persister le Comment avec l'heure de création, enregistrer l'Activity `TASK_COMMENTED`, et retourner le Comment avec les infos de l'auteur.
9. WHEN un Member modifie la position d'une Task (drag & drop Kanban), THE API SHALL mettre à jour le champ `position` de la Task et de toutes les Tasks adjacentes affectées dans la même colonne, de façon atomique.
10. WHEN un Member modifie une Task, THE API SHALL enregistrer l'historique des modifications dans les détails de l'Activity `TASK_UPDATED`, incluant les champs modifiés et leurs anciennes valeurs.
11. IF un User tente de créer ou modifier une Task dans un Project dont il est READER, THEN THE API SHALL retourner une erreur 403.

---

### Requirement 6 : Vue Kanban et Vue Liste

**User Story :** En tant que membre d'un projet, je veux visualiser les tâches en vue Kanban (colonnes drag & drop) et en vue liste (filtrée et triée), afin de suivre l'avancement du travail selon mes préférences.

#### Acceptance Criteria

1. THE Frontend SHALL afficher les Tasks d'un Project regroupées par status dans des colonnes Kanban, dans l'ordre : TODO → IN_PROGRESS → IN_REVIEW → DONE.
2. WHEN un User déplace une Task d'une colonne à une autre par drag & drop, THE Frontend SHALL appeler l'API pour mettre à jour le status et la position de la Task, et mettre à jour l'affichage sans rechargement.
3. THE Frontend SHALL afficher les Tasks en vue liste avec tri par priorité, date d'échéance ou date de création, et filtres par status, assigné et label.
4. THE Frontend SHALL afficher, pour chaque Task en vue Kanban, au minimum : le titre, la priorité (avec code couleur), l'assigné (avatar), la date d'échéance et le nombre de commentaires.
5. WHILE une mise à jour de position est en cours, THE Frontend SHALL afficher un état optimiste et annuler le changement visuel si l'API retourne une erreur.

---

### Requirement 7 : Fil d'Activité et Heatmap

**User Story :** En tant que membre d'un projet ou utilisateur de la plateforme, je veux consulter le fil d'activité par projet et par utilisateur, et visualiser ma contribution via une heatmap, afin de suivre l'historique des actions de l'équipe.

#### Acceptance Criteria

1. THE API SHALL enregistrer une Activity pour chaque événement métier significatif : `PROJECT_CREATED`, `TASK_CREATED`, `TASK_STATUS_CHANGED`, `TASK_COMMENTED`, `TASK_UPDATED`, `MEMBER_JOINED`, `MEMBER_REMOVED`, `MEMBER_ROLE_CHANGED`, `INVITATION_SENT`, `FILE_UPLOADED`, `DELIVERABLE_SUBMITTED`, `DELIVERABLE_VALIDATED`, `COMMIT_LINKED`.
2. THE API SHALL exposer un endpoint retournant les 100 dernières Activities d'un Project, incluant le User auteur (username, avatarUrl) et les détails de l'événement.
3. THE API SHALL exposer un endpoint retournant le fil d'activité d'un User à travers tous ses projets, paginé par 50 éléments.
4. THE API SHALL exposer un endpoint retournant le nombre d'Activities par jour pour un User sur les 365 derniers jours, structuré pour alimenter une heatmap.
5. THE Frontend SHALL afficher la heatmap de contribution d'un User sur sa page de profil, avec une grille de 52 semaines × 7 jours, chaque case colorée selon l'intensité d'activité (0 → 4 niveaux).

---

### Requirement 8 : Notifications

**User Story :** En tant qu'utilisateur, je veux recevoir des notifications in-app, par email et en push mobile lorsque des événements me concernent (tâche assignée, mention, échéance proche, invitation), afin de rester informé sans consulter la plateforme en permanence.

#### Acceptance Criteria

1. WHEN une Task est assignée à un User, THE Notification_Service SHALL créer une Notification in-app de type `TASK_ASSIGNED` pour ce User et lui envoyer un email de notification dans un délai de 60 secondes.
2. WHEN un User est mentionné dans un Comment (syntaxe `@username`), THE Notification_Service SHALL créer une Notification in-app de type `MENTION` pour le User mentionné.
3. WHEN une Task dont un User est assigné atteint 24 heures avant sa date d'échéance, THE Notification_Service SHALL créer une Notification in-app de type `DUE_DATE_REMINDER` et envoyer un email de rappel.
4. WHEN un User reçoit une invitation par pseudo, THE Notification_Service SHALL créer une Notification in-app de type `PROJECT_INVITATION`.
5. THE API SHALL exposer un endpoint retournant les Notifications non lues d'un User, triées par date décroissante.
6. WHEN un User marque une Notification comme lue, THE API SHALL mettre à jour le champ `read` à `true`.
7. THE Frontend SHALL afficher le nombre de Notifications non lues dans la barre de navigation, mis à jour en temps réel via WebSocket.
8. WHERE la PWA est installée sur mobile, THE Frontend SHALL envoyer des notifications push via l'API Web Push pour les événements de type `TASK_ASSIGNED`, `MENTION` et `DUE_DATE_REMINDER`.

---

### Requirement 9 : Messagerie Instantanée Temps Réel

**User Story :** En tant que membre d'un projet, je veux envoyer et recevoir des messages en temps réel dans des channels de projet ou en messages directs (1-to-1), afin de communiquer avec mon équipe sans quitter la plateforme.

#### Acceptance Criteria

1. THE API SHALL créer automatiquement un Channel général pour chaque Project à sa création, accessible à tous les membres du Project.
2. WHEN un Member envoie un Message dans un Channel ou DirectMessage, THE API SHALL persister le Message, diffuser l'événement `message:new` via WebSocket à tous les participants connectés, et retourner le Message avec un code 201.
3. THE API SHALL supporter les types de messages suivants : texte, image, vidéo, fichier, audio, et réaction emoji à un Message existant.
4. WHEN un User se connecte via WebSocket, THE API SHALL diffuser l'événement `presence:online` à ses contacts connectés, et diffuser `presence:offline` à la déconnexion.
5. WHILE un User est en train d'écrire dans un Channel, THE API SHALL diffuser l'événement `typing:start` aux autres participants, et `typing:stop` après 3 secondes d'inactivité de frappe.
6. WHEN un Message est livré à un destinataire connecté, THE API SHALL mettre à jour l'accusé de réception `delivered` à `true`.
7. WHEN un User ouvre une conversation et lit les Messages, THE API SHALL mettre à jour l'accusé de lecture `read` à `true` pour ces Messages.
8. THE API SHALL permettre la recherche dans l'historique des Messages d'un Channel par mot-clé, retournant les Messages correspondants avec leur contexte (5 messages avant/après).
9. THE API SHALL persister l'intégralité de l'historique des Messages et le synchroniser à la reconnexion du User.
10. THE Frontend SHALL afficher les indicateurs de présence (en ligne / hors ligne / en train d'écrire) en temps réel dans les conversations.

---

### Requirement 10 : Visioconférence Intégrée

**User Story :** En tant que membre d'un projet, je veux lancer des appels vidéo/audio en groupe ou en 1-to-1, partager mon écran et programmer des réunions, afin de collaborer à distance sans dépendre d'un outil externe.

#### Acceptance Criteria

1. WHEN un User initie un appel vidéo ou audio vers un autre User ou dans un Channel, THE API SHALL créer une salle de réunion Meeting avec un identifiant unique et notifier les participants via WebSocket avec l'événement `call:incoming`.
2. THE Frontend SHALL établir la connexion peer-to-peer via WebRTC en utilisant l'API comme serveur de signalisation (SDP offer/answer, ICE candidates échangés via WebSocket).
3. THE API SHALL fournir un serveur STUN/TURN pour permettre la traversée NAT lors des appels WebRTC.
4. WHEN un User partage son écran, THE Frontend SHALL capturer le flux d'écran via `getDisplayMedia` et le diffuser aux participants de l'appel.
5. WHEN un Owner ou Admin programme une réunion en fournissant une date, une heure et une liste de participants, THE API SHALL créer le Meeting, créer une Notification in-app pour chaque participant, et envoyer un email de rappel 15 minutes avant l'heure prévue.
6. WHERE l'enregistrement de session est activé par le Owner de la réunion et que tous les participants ont consenti, THE API SHALL enregistrer le flux audio/vidéo et stocker le fichier sur S3/Cloudinary.
7. IF un participant rejette l'enregistrement, THEN THE API SHALL empêcher l'enregistrement de démarrer pour cette session.

---

### Requirement 11 : Annonces et Notifications Programmées

**User Story :** En tant que Owner ou Admin d'un projet, je veux publier des annonces épinglées et programmer des notifications récurrentes, afin de communiquer des informations importantes à tous les membres de façon organisée.

#### Acceptance Criteria

1. WHEN un Owner ou Admin publie une annonce dans un Project, THE API SHALL persister l'annonce avec les champs : titre, contenu, épinglée (booléen), et créer une Notification de type `ANNOUNCEMENT` pour chaque membre du Project.
2. THE API SHALL lister les annonces d'un Project, triées avec les annonces épinglées en premier, puis par date décroissante.
3. WHEN un Owner ou Admin programme une notification récurrente en fournissant un type, un contenu, une cible (Project ou User), une date de début et une fréquence (quotidienne, hebdomadaire, mensuelle), THE API SHALL persister la règle de planification et l'exécuter aux échéances définies.
4. THE Notification_Service SHALL envoyer les notifications programmées via les canaux configurés : in-app, email, et push mobile.
5. WHEN un Owner ou Admin supprime une règle de notification programmée, THE API SHALL arrêter immédiatement son exécution et supprimer les notifications futures non encore envoyées.

---

### Requirement 12 : Gestion des Fichiers et Secrets

**User Story :** En tant que membre d'un projet, je veux partager des fichiers avec mon équipe, gérer des variables d'environnement sensibles chiffrées, et versionner les fichiers partagés, afin de centraliser les ressources du projet en toute sécurité.

#### Acceptance Criteria

1. WHEN un Member ou Admin téléverse un fichier dans un Project, THE API SHALL stocker le fichier sur S3/Cloudinary, créer une entrée File avec les métadonnées (nom, taille, type MIME, URL, uploadedBy, projectId), et enregistrer l'Activity `FILE_UPLOADED`.
2. THE API SHALL conserver l'historique de versions d'un fichier : chaque mise à jour crée une nouvelle version, les versions précédentes restant accessibles.
3. IF un User non membre d'un Project tente de télécharger un fichier de ce Project PRIVATE, THEN THE API SHALL retourner une erreur 403.
4. WHEN un Owner ou Admin crée un Secret (variable d'environnement) en fournissant un nom et une valeur, THE API SHALL chiffrer la valeur avec AES-256 avant persistance et la stocker chiffrée en base de données.
5. THE API SHALL masquer la valeur des Secrets par défaut dans toutes les réponses, en retournant uniquement le nom et les métadonnées.
6. WHEN un Owner ou Admin demande la révélation d'un Secret, THE API SHALL déchiffrer la valeur, la retourner, et enregistrer l'accès dans un log d'audit incluant userId, secretId et timestamp.
7. IF un User avec le rôle MEMBER ou READER tente d'accéder, créer, modifier ou supprimer un Secret, THEN THE API SHALL retourner une erreur 403.
8. THE API SHALL retourner l'historique complet des accès et modifications d'un Secret (qui a révélé quoi, quand, qui a modifié quoi).

---

### Requirement 13 : Espace de Dépôt des Livrables

**User Story :** En tant que membre d'un projet, je veux déposer des livrables sur une tâche (fichiers, liens, captures) et soumettre leur validation, afin de tracer qui a livré quoi et quand, et de permettre au responsable de valider ou refuser les livrables.

#### Acceptance Criteria

1. WHEN un Member dépose un Deliverable sur une Task en fournissant un fichier ou un lien URL, THE API SHALL créer la ressource Deliverable avec le statut `DRAFT`, les métadonnées (type, url, nom, taille si fichier), l'auteur et la date, et enregistrer l'Activity `DELIVERABLE_SUBMITTED`.
2. WHEN un Member soumet un Deliverable pour validation (passage de `DRAFT` à `SUBMITTED`), THE API SHALL mettre à jour le statut et créer une Notification de type `DELIVERABLE_READY` pour le Owner et les Admins du Project.
3. WHEN un Owner ou Admin valide un Deliverable, THE API SHALL passer le statut à `VALIDATED`, enregistrer l'Activity `DELIVERABLE_VALIDATED` avec le validateur et la date, et créer une Notification pour l'auteur du Deliverable.
4. WHEN un Owner ou Admin refuse un Deliverable en fournissant un motif, THE API SHALL passer le statut à `REFUSED`, enregistrer le motif, et créer une Notification pour l'auteur.
5. THE API SHALL lister tous les Deliverables d'une Task avec leur historique complet de statuts, incluant qui a déposé, soumis, validé ou refusé chaque Deliverable et à quelle date.

---

### Requirement 14 : Intégration Git / GitHub

**User Story :** En tant que Owner d'un projet, je veux connecter un dépôt GitHub à mon projet Fluxo et lier automatiquement les commits aux tâches, afin de tracer le travail de développement directement dans le contexte du projet.

#### Acceptance Criteria

1. WHEN un Owner connecte un dépôt GitHub à un Project en fournissant le token OAuth GitHub et l'identifiant du dépôt, THE API SHALL persister la GitIntegration et configurer un webhook GitHub sur le dépôt pour les événements `push`.
2. WHEN le webhook GitHub reçoit un événement `push`, THE API SHALL analyser les messages de commit à la recherche de références de tâches au format `#TASK-{id}` (insensible à la casse).
3. WHEN un message de commit contient `#TASK-{id}`, THE API SHALL créer un lien entre le commit et la Task correspondante, enregistrer l'Activity `COMMIT_LINKED` avec le SHA du commit, l'auteur et le message.
4. WHEN un message de commit contient `closes #TASK-{id}`, `fixes #TASK-{id}` ou `resolves #TASK-{id}` (insensible à la casse), THE API SHALL passer automatiquement le status de la Task à `DONE` et enregistrer l'Activity `TASK_STATUS_CHANGED`.
5. THE API SHALL afficher, sur la page d'une Task, la liste des commits liés avec leur SHA (court, 7 caractères), l'auteur, le message et le lien vers le commit sur GitHub.
6. IF une référence de commit pointe vers une Task qui n'existe pas dans le Project connecté, THEN THE API SHALL ignorer silencieusement la référence sans retourner d'erreur au webhook.

---

### Requirement 15 : Documents Collaboratifs

**User Story :** En tant que membre d'un projet, je veux créer et modifier des documents collaboratifs (cahiers des charges, comptes-rendus) avec des modèles réutilisables, les lier à des projets et des tâches, et les exporter en PDF ou Word, afin de centraliser la documentation du projet.

#### Acceptance Criteria

1. WHEN un Member crée un Document dans un Project en fournissant un titre et un contenu (format Markdown ou delta OT pour édition collaborative), THE API SHALL persister le Document lié au Project et le retourner avec un code 201.
2. THE API SHALL fournir un mécanisme de résolution de conflits pour l'édition collaborative simultanée via Operational Transformation ou CRDT, diffusé en temps réel via WebSocket.
3. THE API SHALL permettre de lier un Document à une Task existante du Project.
4. THE API SHALL conserver un historique de versions du Document, chaque sauvegarde créant une nouvelle version avec l'auteur et l'horodatage.
5. WHEN un User demande l'export d'un Document, THE API SHALL générer un fichier PDF ou DOCX à partir du contenu du Document et le retourner en téléchargement.
6. THE API SHALL permettre la création de modèles de Documents réutilisables au niveau du Workspace, sélectionnables lors de la création d'un nouveau Document.

---

### Requirement 16 : Recherche Globale

**User Story :** En tant qu'utilisateur, je veux effectuer une recherche globale sur la plateforme (projets, tâches, utilisateurs, messages), afin de retrouver rapidement n'importe quelle ressource sans naviguer manuellement.

#### Acceptance Criteria

1. WHEN un User soumet une requête de recherche (minimum 2 caractères), THE Search_Service SHALL retourner les résultats pertinents dans les catégories : Projects, Tasks, Users, Messages, en respectant les droits d'accès de l'utilisateur courant.
2. THE Search_Service SHALL retourner les résultats dans un délai de 500 ms pour les requêtes portant sur moins de 10 000 enregistrements accessibles par l'utilisateur.
3. THE Search_Service SHALL exclure des résultats tout Project PRIVATE dont le User n'est pas membre.
4. THE Frontend SHALL afficher les résultats de recherche groupés par catégorie avec mise en évidence du terme recherché dans les extraits de résultats.

---

### Requirement 17 : Profil Utilisateur et Paramètres

**User Story :** En tant qu'utilisateur, je veux consulter et modifier mon profil public (avatar, bio, compétences, projets publics) et gérer mes paramètres de sécurité, afin de personnaliser mon expérience et protéger mon compte.

#### Acceptance Criteria

1. THE API SHALL exposer un endpoint retournant le profil public d'un User par username, incluant : fullName, username, avatarUrl, bio, compétences, liste des projets PUBLIC dont il est membre, heatmap de contribution sur 365 jours.
2. WHEN un User met à jour son profil (fullName, bio, compétences, avatarUrl), THE API SHALL valider les champs (fullName ≤ 100 chars, bio ≤ 500 chars) et persister les modifications.
3. WHEN un User téléverse un avatar, THE API SHALL stocker l'image sur S3/Cloudinary, redimensionner l'image à 256×256 pixels, et mettre à jour le champ `avatarUrl` de l'utilisateur.
4. THE API SHALL enregistrer chaque connexion réussie d'un User avec la date, l'heure et l'adresse IP, accessible via l'historique de connexion du User.
5. THE API SHALL permettre à un User d'activer ou désactiver la double authentification (2FA) basée sur TOTP (RFC 6238), en générant un secret TOTP et un QR code lors de l'activation.
6. WHEN un User a activé la 2FA et s'authentifie via OAuth, THE Auth_Service SHALL exiger un code TOTP valide avant d'émettre le JWT final.

---

### Requirement 18 : Interface PWA et Expérience Mobile

**User Story :** En tant qu'utilisateur mobile, je veux utiliser Fluxo installée sur mon écran d'accueil comme une application native, avec une navigation adaptée, des performances fluides et un thème personnalisable, afin de travailler confortablement depuis n'importe quel appareil.

#### Acceptance Criteria

1. THE Frontend SHALL être une PWA conforme aux critères d'installabilité (manifest.webmanifest avec `display: standalone`, Service Worker avec stratégie cache-first pour les assets statiques, HTTPS).
2. THE Frontend SHALL afficher une barre de navigation basse (bottom nav bar) sur les appareils avec viewport < 769 px, avec les onglets : Projets, Messagerie, Notifications, Profil.
3. THE Frontend SHALL masquer la barre de navigation basse et afficher une barre de navigation latérale ou supérieure sur les viewports ≥ 769 px.
4. THE Frontend SHALL utiliser la couleur principale `#166553` comme couleur d'accent pour les éléments interactifs (boutons primaires, liens actifs, indicateurs).
5. WHEN le système d'exploitation de l'utilisateur est en mode sombre, THE Frontend SHALL appliquer le thème sombre par défaut au premier chargement, détecté via `prefers-color-scheme`.
6. WHEN un User sélectionne manuellement un thème (clair, sombre, système), THE Frontend SHALL persister ce choix dans `localStorage` et l'appliquer immédiatement.
7. THE Frontend SHALL obtenir un score Lighthouse Performance ≥ 80 et Accessibility ≥ 90 sur mobile (viewport 375 px).
8. THE Frontend SHALL permettre le chargement hors ligne des pages déjà visitées via le Service Worker, affichant une page de repli si la ressource n'est pas en cache.

---

### Requirement 19 : Sécurité et Conformité

**User Story :** En tant qu'administrateur de la plateforme, je veux que Fluxo applique des mesures de sécurité robustes (rate limiting, chiffrement, validation des entrées, CORS, HTTPS), afin de protéger les données des utilisateurs et prévenir les abus.

#### Acceptance Criteria

1. THE API SHALL appliquer un rate limiting global de 100 requêtes par minute par adresse IP, retournant une erreur 429 en cas de dépassement.
2. THE API SHALL valider et assainir toutes les entrées utilisateur via des DTOs avec des règles `class-validator` avant tout traitement.
3. THE API SHALL chiffrer les valeurs de Secrets avec AES-256-GCM au repos et les transmettre uniquement via TLS (HTTPS).
4. THE API SHALL configurer CORS pour n'autoriser que l'origine définie dans la variable d'environnement `FRONTEND_URL`.
5. THE API SHALL utiliser des requêtes paramétrées (via Prisma) pour toutes les interactions avec la base de données, empêchant les injections SQL.
6. THE Frontend SHALL inclure les en-têtes de sécurité HTTP : `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
7. WHEN un fichier est téléversé, THE API SHALL vérifier le type MIME réel du fichier (magic bytes), rejeter les types non autorisés (liste blanche : images, vidéos, PDF, archives, audio), et limiter la taille à 100 Mo par fichier.

---

### Requirement 20 : Déploiement et Observabilité

**User Story :** En tant que développeur, je veux que l'application soit déployable sur Vercel/Netlify (frontend) et Railway/Render (backend), et qu'elle expose des logs et métriques exploitables, afin de monitorer la santé de la plateforme en production.

#### Acceptance Criteria

1. THE API SHALL exposer un endpoint `/health` retournant le statut de l'API et de la connexion PostgreSQL, avec un code 200 si tout est opérationnel.
2. THE API SHALL logger chaque requête HTTP avec : méthode, path, status code, durée en ms, et userId (si authentifié), dans un format JSON structuré.
3. THE Frontend SHALL être compilable en production avec `ng build --configuration production` et produire des bundles optimisés (tree-shaking, lazy loading par route).
4. THE API SHALL lire toutes ses variables de configuration depuis des variables d'environnement, sans valeur codée en dur dans le code source, avec validation au démarrage via `@nestjs/config`.
5. THE Frontend SHALL inclure un fichier `netlify.toml` avec une règle de redirection `/*` → `/index.html` pour le routage SPA Angular.
