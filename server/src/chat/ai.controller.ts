import { Controller, Get } from '@nestjs/common';
import type { AiProviderInfo } from '../ai/ai.service.js';
import { ConversationService } from './services/conversation.service.js';

@Controller('api/ai')
export class AiController {
  constructor(private readonly conversations: ConversationService) {}

  @Get('provider')
  provider(): AiProviderInfo {
    return this.conversations.providerInfo();
  }
}
