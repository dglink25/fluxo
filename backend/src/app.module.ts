import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

// Infrastructure
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { HealthModule } from './health/health.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SchedulerModule } from './scheduler/scheduler.module';

// Domaine métier
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { InvitationsModule } from './invitations/invitations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagingModule } from './messaging/messaging.module';
import { FilesModule } from './files/files.module';
import { SecretsModule } from './secrets/secrets.module';
import { DeliverablesModule } from './deliverables/deliverables.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { GithubModule } from './github/github.module';
import { DocumentsModule } from './documents/documents.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),

    // Infrastructure
    PrismaModule,
    MailModule,
    WhatsappModule,
    HealthModule,
    RealtimeModule,
    SchedulerModule,

    // Auth & Utilisateurs
    AuthModule,
    UsersModule,

    // Organisations & Projets
    WorkspacesModule,
    ProjectsModule,
    TasksModule,
    InvitationsModule,

    // Collaboration
    NotificationsModule,
    MessagingModule,
    AnnouncementsModule,
    DocumentsModule,

    // Fichiers, Secrets & Livrables
    FilesModule,
    SecretsModule,
    DeliverablesModule,

    // Intégrations
    GithubModule,

    // Utilitaires
    SearchModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
