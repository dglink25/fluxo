import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController, MyTasksController } from './tasks.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [MyTasksController, TasksController],
  providers: [TasksService],
})
export class TasksModule {}
