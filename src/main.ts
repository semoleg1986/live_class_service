import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ApplicationErrorFilter } from './modules/common/application-error.filter';
import { installHttpObservability } from './modules/common/http-observability';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  installHttpObservability(app);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );
  app.useGlobalFilters(new ApplicationErrorFilter());

  const config = app.get(ConfigService);
  const port = config.get<number>('liveClass.httpPort', 8010);
  await app.listen(port);
}

bootstrap();
