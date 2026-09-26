import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ChatModule],
})
export class AppModule {}
