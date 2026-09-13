import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
