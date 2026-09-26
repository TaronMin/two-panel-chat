export const MESSAGE_MAX_LENGTH = 4000;
export const INSTRUCTION_MAX_LENGTH = 500;

export const COUNTER_VISIBLE_RATIO = 0.8;

export type SenderRole = 'user' | 'answerer';
export type ComposeMode = 'manual' | 'ai';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  conversationId: string;
  sender: SenderRole;
  content: string;
  mode: ComposeMode;
  createdAt: string;
  status: MessageStatus;
  generatedBy?: string;
  editedAt?: string;
  deletedAt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  participants: SenderRole[];
}

export interface ConversationState {
  conversation: Conversation;
  messages: Message[];
  answererMode: ComposeMode;
  typing: SenderRole[];
  online: SenderRole[];
  aiGenerating: boolean;
}

export interface AiSuggestion {
  content: string;
  provider: string;
  model?: string;
  latencyMs: number;
}

export interface SendMessagePayload {
  sender: SenderRole;
  content: string;
  mode: ComposeMode;
  generatedBy?: string;
}

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

export interface ChatServerEvents {
  'connection:established': ConnectionEstablishedEvent;
  'conversation:state': ConversationState;
  'message:new': MessageNewEvent;
  'message:updated': MessageUpdatedEvent;
  'typing:update': TypingUpdateEvent;
  'answerer:mode-changed': AnswererModeChangedEvent;
  'presence:update': PresenceUpdateEvent;
  'message:receipt': MessageReceiptEvent;
  'ai:generating': AiGeneratingEvent;
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

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
