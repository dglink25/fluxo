import { Module } from '@nestjs/common';
import { VideoCallService } from './video-call.service';
import { VideoCallController } from './video-call.controller';
import { JaasTokenService } from './jaas-token.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, MailModule, WhatsappModule, RealtimeModule],
  controllers: [VideoCallController],
  providers: [VideoCallService, JaasTokenService],
  exports: [VideoCallService, JaasTokenService],
})
export class VideoCallModule {}
