import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { InvitationsController, InvitationTokenController } from './invitations.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [InvitationsController, InvitationTokenController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
