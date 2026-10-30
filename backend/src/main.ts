import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { authProxyTrust } from './auth/auth-rate-limit.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', authProxyTrust(app.get(ConfigService)));

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // 🔥 Habilitar CORS
  // app.enableCors({
  //   origin: [
  //     "http://localhost:3000",
  //     "http://192.168.1.35:3000"
  //   ],
  //   credentials: true,
  // });

  app.enableCors({
    origin: true,
    credentials: true,
    exposedHeaders: ['Retry-After'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0'); // 👈 Backend en 3001
}

bootstrap();
