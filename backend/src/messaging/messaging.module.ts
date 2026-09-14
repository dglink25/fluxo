import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { AllChannelsController, ChannelsController, DirectMessagesController } from './messaging.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [AllChannelsController, ChannelsController, DirectMessagesController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
