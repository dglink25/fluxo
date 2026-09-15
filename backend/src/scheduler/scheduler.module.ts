import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { MailModule } from '../mail/mail.module';
import { VideoCallModule } from '../video-call/video-call.module';

@Module({
  imports: [RealtimeModule, MailModule, VideoCallModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
