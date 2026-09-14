import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Augmenter la limite de payload pour les uploads de fichiers (50 Mo) ──
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:4200',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Fluxo API démarrée sur http://localhost:${port}/api`);
}
bootstrap();
