import { Injectable } from '@nestjs/common';
import type { ComposeMode, SenderRole } from '../contracts/models.js';

interface ConversationPresence {
  connections: Map<string, SenderRole>;
  typing: Set<SenderRole>;
  answererMode: ComposeMode;
}

@Injectable()
export class PresenceService {
  private readonly state = new Map<string, ConversationPresence>();

  join(conversationId: string, connectionId: string, role: SenderRole): void {
    this.forConversation(conversationId).connections.set(connectionId, role);
  }

  leaveAll(connectionId: string): string[] {
    const affected: string[] = [];
    for (const [conversationId, presence] of this.state) {
      const role = presence.connections.get(connectionId);
      if (!role) {
        continue;
      }
      presence.connections.delete(connectionId);
      if (!this.online(conversationId).includes(role)) {
        presence.typing.delete(role);
      }
      affected.push(conversationId);
    }
    return affected;
  }

  leave(conversationId: string, connectionId: string): void {
    const presence = this.state.get(conversationId);
    if (!presence) {
      return;
    }
    const role = presence.connections.get(connectionId);
    presence.connections.delete(connectionId);
    if (role && !this.online(conversationId).includes(role)) {
      presence.typing.delete(role);
    }
  }

  online(conversationId: string): SenderRole[] {
    const presence = this.state.get(conversationId);
    return presence ? [...new Set(presence.connections.values())] : [];
  }

  setTyping(conversationId: string, role: SenderRole, isTyping: boolean): SenderRole[] {
    const presence = this.forConversation(conversationId);
    if (isTyping) {
      presence.typing.add(role);
    } else {
      presence.typing.delete(role);
    }
    return [...presence.typing];
  }

  typing(conversationId: string): SenderRole[] {
    return [...this.forConversation(conversationId).typing];
  }

  getAnswererMode(conversationId: string): ComposeMode {
    return this.forConversation(conversationId).answererMode;
  }

  setAnswererMode(conversationId: string, mode: ComposeMode): ComposeMode {
    this.forConversation(conversationId).answererMode = mode;
    return mode;
  }

  private forConversation(conversationId: string): ConversationPresence {
    let presence = this.state.get(conversationId);
    if (!presence) {
      presence = {
        connections: new Map(),
        typing: new Set(),
        answererMode: 'manual',
      };
      this.state.set(conversationId, presence);
    }
    return presence;
  }
}
