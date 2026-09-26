import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { FiltroDeErros } from './comum/filtro-de-erros.js';
import { idDaRequisicao } from './comum/id-da-requisicao.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // A API só é chamada pelo web; CORS aberto aqui significaria qualquer site
  // podendo usar a sessão de quem está logado (o refresh vai em cookie).
  const origem = process.env.APP_URL ?? 'http://localhost:5173';
  app.enableCors({ origin: origem.split(','), credentials: true });

  // Antes de tudo: o id precisa existir mesmo se o erro for do próprio helmet.
  app.use(idDaRequisicao);
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Traduz qualquer exceção para { code, message } com message em português.
  app.useGlobalFilters(new FiltroDeErros());

  const config = new DocumentBuilder()
    .setTitle('GasteMenos')
    .setDescription('API do GasteMenos. Valores em centavos; datas em UTC.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const porta = Number(process.env.PORT ?? 3000);
  await app.listen(porta);

  // eslint-disable-next-line no-console
  console.log(`API em http://localhost:${porta}/v1 — Swagger em /docs`);
}

void bootstrap();
