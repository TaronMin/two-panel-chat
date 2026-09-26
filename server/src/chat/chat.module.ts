import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AiController } from './ai.controller.js';
import { ConversationsController } from './chat.controller.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatBroadcastService } from './services/chat-broadcast.service.js';
import { ConversationService } from './services/conversation.service.js';
import { MessageStore } from './services/message-store.service.js';
import { PresenceService } from './services/presence.service.js';

@Module({
  imports: [AiModule],
  controllers: [ConversationsController, AiController],
  providers: [
    ChatGateway,
    ConversationService,
    ChatBroadcastService,
    PresenceService,
    MessageStore,
  ],
})
export class ChatModule {}
