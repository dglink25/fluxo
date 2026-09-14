import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { GithubController } from './github.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],   // pour RealtimeGateway dans GithubService
  controllers: [GithubController],
  providers: [GithubService],
})
export class GithubModule {}
