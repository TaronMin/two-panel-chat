import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { ComposeMode, SenderRole } from '../contracts/models.js';

const SENDER_ROLES: SenderRole[] = ['user', 'answerer'];
const COMPOSE_MODES: ComposeMode[] = ['manual', 'ai'];

export class JoinConversationDto {
  @IsString()
  @Length(1, 128)
  conversationId!: string;

  @IsIn(SENDER_ROLES)
  role!: SenderRole;
}

export class LeaveConversationDto {
  @IsString()
  @Length(1, 128)
  conversationId!: string;
}

export class SendMessageBodyDto {
  @IsIn(SENDER_ROLES)
  sender!: SenderRole;

  @IsString()
  @Length(1, 4000)
  content!: string;

  @IsIn(COMPOSE_MODES)
  mode!: ComposeMode;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  generatedBy?: string;
}

export class SendMessageDto extends SendMessageBodyDto {
  @IsString()
  @Length(1, 128)
  conversationId!: string;
}

export class TypingDto {
  @IsString()
  @Length(1, 128)
  conversationId!: string;

  @IsIn(SENDER_ROLES)
  role!: SenderRole;
}

export class ChangeAnswererModeDto {
  @IsString()
  @Length(1, 128)
  conversationId!: string;

  @IsIn(COMPOSE_MODES)
  mode!: ComposeMode;
}

export class MarkReadDto {
  @IsString()
  @Length(1, 128)
  conversationId!: string;

  @IsIn(SENDER_ROLES)
  role!: SenderRole;

  @IsArray()
  @IsString({ each: true })
  messageIds!: string[];
}

export class EditMessageDto {
  @IsString()
  @Length(1, 128)
  conversationId!: string;

  @IsString()
  @Length(1, 128)
  messageId!: string;

  @IsIn(SENDER_ROLES)
  role!: SenderRole;

  @IsString()
  @Length(1, 4000)
  content!: string;
}

export class DeleteMessageDto {
  @IsString()
  @Length(1, 128)
  conversationId!: string;

  @IsString()
  @Length(1, 128)
  messageId!: string;

  @IsIn(SENDER_ROLES)
  role!: SenderRole;
}

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class GenerateSuggestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instruction?: string;

  @IsOptional()
  @IsBoolean()
  autoSend?: boolean;
}
