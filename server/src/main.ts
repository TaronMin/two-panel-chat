import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module.js';
import { corsOrigin } from './cors.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: corsOrigin(), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`REST on port ${port} at /api — hub on /chat`);
}

await bootstrap();
