import { Module } from '@nestjs/common';
import { SecretsService } from './secrets.service';
import { SecretsController, ConfidentialFilesController } from './secrets.controller';

@Module({
  controllers: [SecretsController, ConfidentialFilesController],
  providers: [SecretsService],
})
export class SecretsModule {}
