import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { ChannelsController, DirectMessagesController } from './messaging.controller';

@Module({
  controllers: [ChannelsController, DirectMessagesController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
