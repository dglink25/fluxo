import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController, MyTasksController } from './tasks.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { MailModule } from '../mail/mail.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [RealtimeModule, MailModule, WhatsappModule],
  controllers: [MyTasksController, TasksController],
  providers: [TasksService],
})
export class TasksModule {}
