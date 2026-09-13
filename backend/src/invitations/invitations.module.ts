import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { InvitationsController, InvitationTokenController } from './invitations.controller';

@Module({
  controllers: [InvitationsController, InvitationTokenController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
