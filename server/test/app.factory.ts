import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { SenderRole } from '../src/chat/contracts/models.js';
import { ClientEvents, type JoinAck } from '../src/chat/contracts/chat-events.js';

export interface TestApp {
  app: INestApplication;
  url: string;
  connect(): Promise<Socket>;
  join(conversationId: string, role: SenderRole): Promise<{ socket: Socket; ack: JoinAck }>;
  close(): Promise<void>;
}

const HANDSHAKE_TIMEOUT_MS = 5000;

export async function createTestApp(): Promise<TestApp> {
  process.env['AI_PROVIDER'] = 'mock';
  process.env['CORS_ORIGIN'] = '*';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }),
  );

  await app.init();
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];

  async function connect(): Promise<Socket> {
    const socket = io(`${url}/chat`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('socket did not connect in time')),
        HANDSHAKE_TIMEOUT_MS,
      );
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    return socket;
  }

  async function join(conversationId: string, role: SenderRole) {
    const socket = await connect();
    const ack = (await socket.emitWithAck(ClientEvents.JoinConversation, {
      conversationId,
      role,
    })) as JoinAck;
    return { socket, ack };
  }

  async function close(): Promise<void> {
    for (const socket of sockets) {
      socket.disconnect();
    }
    await app.close();
  }

  return { app, url, connect, join, close };
}

export function nextEvent<TPayload>(
  socket: Socket,
  event: string,
  timeoutMs = HANDSHAKE_TIMEOUT_MS,
): Promise<TPayload> {
  return new Promise<TPayload>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: TPayload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export function noEventWithin(socket: Socket, event: string, windowMs = 300): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let seen = false;
    const handler = () => {
      seen = true;
    };
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve(!seen);
    }, windowMs);
  });
}
