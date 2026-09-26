import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { AiSuggestion } from '../ai/ai-provider.interface.js';
import type { Conversation, ConversationState, Message } from './contracts/models.js';
import {
  CreateConversationDto,
  GenerateSuggestionDto,
  SendMessageBodyDto,
} from './dto/chat.dto.js';
import { ConversationService } from './services/conversation.service.js';

@Controller('api/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationService) {}

  @Post()
  create(@Body() dto: CreateConversationDto): Conversation {
    return this.conversations.createConversation(dto.title);
  }

  @Get()
  list(): Conversation[] {
    return this.conversations.listConversations();
  }

  @Get(':id')
  get(@Param('id') id: string): Conversation {
    return this.conversations.getConversation(id);
  }

  @Get(':id/state')
  state(@Param('id') id: string): ConversationState {
    return this.conversations.getState(id);
  }

  @Get(':id/messages')
  history(
    @Param('id') id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Message[] {
    return this.conversations.getHistory(id, limit);
  }

  @Post(':id/messages')
  send(@Param('id') id: string, @Body() dto: SendMessageBodyDto): Message {
    return this.conversations.sendMessage({ ...dto, conversationId: id });
  }

  @Post(':id/suggestions')
  suggest(
    @Param('id') id: string,
    @Body() dto: GenerateSuggestionDto,
  ): Promise<{ suggestion: AiSuggestion; sent?: Message }> {
    return this.conversations.generateSuggestion(id, dto.instruction, dto.autoSend === true);
  }
}
