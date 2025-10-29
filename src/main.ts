import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import cors from 'cors';

const port = process.env.PORT || 10000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const origins = ['http://localhost:3000'];
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  app.use(
    cors({
      origin: [...origins],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  await app.listen(port, () => {
    console.log(`NestJS chat server listening on http://localhost:${port}`);
  });
}
void bootstrap();
