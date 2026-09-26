import type {
  ComposeMode,
  Conversation,
  ConversationState,
  Message,
  MessageStatus,
  SenderRole,
} from './models.js';

export const ClientEvents = {
  JoinConversation: 'conversation:join',
  LeaveConversation: 'conversation:leave',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
  ChangeAnswererMode: 'answerer:mode-change',
  MarkRead: 'message:read',
  EditMessage: 'message:edit',
  DeleteMessage: 'message:delete',
} as const;

export const ServerEvents = {
  ConnectionEstablished: 'connection:established',
  ConversationState: 'conversation:state',
  MessageNew: 'message:new',
  MessageUpdated: 'message:updated',
  TypingUpdate: 'typing:update',
  AnswererModeChanged: 'answerer:mode-changed',
  PresenceUpdate: 'presence:update',
  MessageReceipt: 'message:receipt',
  AiGenerating: 'ai:generating',
} as const;

export interface ConnectionEstablishedEvent {
  connectionId: string;
  serverTime: string;
}

export interface MessageNewEvent {
  message: Message;
}

export interface MessageUpdatedEvent {
  message: Message;
}

export interface TypingUpdateEvent {
  conversationId: string;
  typing: SenderRole[];
}

export interface AnswererModeChangedEvent {
  conversationId: string;
  mode: ComposeMode;
  changedBy: SenderRole;
}

export interface PresenceUpdateEvent {
  conversationId: string;
  online: SenderRole[];
}

export interface MessageReceiptEvent {
  conversationId: string;
  messageIds: string[];
  status: MessageStatus;
  by: SenderRole;
}

export interface AiGeneratingEvent {
  conversationId: string;
  generating: boolean;
}

export interface ChatServerEvents extends Record<string, unknown> {
  [ServerEvents.ConnectionEstablished]: ConnectionEstablishedEvent;
  [ServerEvents.ConversationState]: ConversationState;
  [ServerEvents.MessageNew]: MessageNewEvent;
  [ServerEvents.MessageUpdated]: MessageUpdatedEvent;
  [ServerEvents.TypingUpdate]: TypingUpdateEvent;
  [ServerEvents.AnswererModeChanged]: AnswererModeChangedEvent;
  [ServerEvents.PresenceUpdate]: PresenceUpdateEvent;
  [ServerEvents.MessageReceipt]: MessageReceiptEvent;
  [ServerEvents.AiGenerating]: AiGeneratingEvent;
}

export interface JoinAck {
  ok: boolean;
  conversation?: Conversation;
  error?: string;
}

export interface MutateMessageAck {
  ok: boolean;
  message?: Message;
  error?: string;
}

export const conversationGroup = (conversationId: string): string =>
  `conversation:${conversationId}`;
