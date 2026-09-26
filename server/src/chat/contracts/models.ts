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
