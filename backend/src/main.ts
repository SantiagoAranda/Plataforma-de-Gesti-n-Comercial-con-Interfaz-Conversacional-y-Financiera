import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🔥 Habilitar CORS
  app.enableCors({
    origin: [
      "http://localhost:3000",
      "http://192.168.1.107:3000"
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(3001, '0.0.0.0'); // 👈 Backend en 3001
}

bootstrap();