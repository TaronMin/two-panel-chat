import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { corsOrigin } from '../cors.config.js';
import { HubBase } from '../hub/hub.base.js';
import type { HubConnection } from '../hub/hub-connection.js';
import {
  ClientEvents,
  ServerEvents,
  conversationGroup,
  type ChatServerEvents,
  type JoinAck,
  type MutateMessageAck,
} from './contracts/chat-events.js';
import {
  ChangeAnswererModeDto,
  DeleteMessageDto,
  EditMessageDto,
  JoinConversationDto,
  LeaveConversationDto,
  MarkReadDto,
  TypingDto,
} from './dto/chat.dto.js';
import { ChatBroadcastService } from './services/chat-broadcast.service.js';
import { ConversationService } from './services/conversation.service.js';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: corsOrigin(), credentials: true },
})
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ChatGateway extends HubBase<ChatServerEvents> {
  protected readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly conversations: ConversationService,
    private readonly broadcast: ChatBroadcastService,
  ) {
    super();
  }

  protected override onHubInitialized(server: Server): void {
    this.broadcast.attach(server);
    this.logger.log('Chat hub ready on /chat');
  }

  protected override onConnectedAsync(connection: HubConnection): void {
    this.clients.client(connection.connectionId).send(ServerEvents.ConnectionEstablished, {
      connectionId: connection.connectionId,
      serverTime: new Date().toISOString(),
    });
  }

  protected override onDisconnectedAsync(connection: HubConnection): void {
    this.conversations.unregisterEverywhere(connection.connectionId);
  }

  @SubscribeMessage(ClientEvents.JoinConversation)
  async onJoinConversation(
    @MessageBody() dto: JoinConversationDto,
    @ConnectedSocket() socket: Socket,
  ): Promise<JoinAck> {
    try {
      const conversation = this.conversations.getConversation(dto.conversationId);

      await this.groups.addToGroupAsync(socket.id, conversationGroup(conversation.id));
      this.conversations.registerConnection(conversation.id, socket.id, dto.role);

      this.clients
        .client(socket.id)
        .send(ServerEvents.ConversationState, this.conversations.getState(conversation.id));

      return { ok: true, conversation };
    } catch (error) {
      return { ok: false, error: this.describe(error) };
    }
  }

  @SubscribeMessage(ClientEvents.LeaveConversation)
  async onLeaveConversation(
    @MessageBody() dto: LeaveConversationDto,
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: true }> {
    await this.groups.removeFromGroupAsync(socket.id, conversationGroup(dto.conversationId));
    this.conversations.unregisterConnection(dto.conversationId, socket.id);
    return { ok: true };
  }

  @SubscribeMessage(ClientEvents.EditMessage)
  onEditMessage(@MessageBody() dto: EditMessageDto): MutateMessageAck {
    try {
      const message = this.conversations.editMessage(
        dto.conversationId,
        dto.messageId,
        dto.role,
        dto.content,
      );
      return { ok: true, message };
    } catch (error) {
      const description = this.describe(error);
      this.logger.error(`message:edit failed — ${description}`);
      return { ok: false, error: description };
    }
  }

  @SubscribeMessage(ClientEvents.DeleteMessage)
  onDeleteMessage(@MessageBody() dto: DeleteMessageDto): MutateMessageAck {
    try {
      const message = this.conversations.deleteMessage(dto.conversationId, dto.messageId, dto.role);
      return { ok: true, message };
    } catch (error) {
      const description = this.describe(error);
      this.logger.error(`message:delete failed — ${description}`);
      return { ok: false, error: description };
    }
  }

  @SubscribeMessage(ClientEvents.TypingStart)
  onTypingStart(@MessageBody() dto: TypingDto): void {
    this.conversations.setTyping(dto.conversationId, dto.role, true);
  }

  @SubscribeMessage(ClientEvents.TypingStop)
  onTypingStop(@MessageBody() dto: TypingDto): void {
    this.conversations.setTyping(dto.conversationId, dto.role, false);
  }

  @SubscribeMessage(ClientEvents.ChangeAnswererMode)
  onChangeAnswererMode(@MessageBody() dto: ChangeAnswererModeDto): void {
    this.conversations.setAnswererMode(dto.conversationId, dto.mode);
  }

  @SubscribeMessage(ClientEvents.MarkRead)
  onMarkRead(@MessageBody() dto: MarkReadDto): void {
    this.conversations.markRead(dto.conversationId, dto.role, dto.messageIds);
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error';
  }
}
