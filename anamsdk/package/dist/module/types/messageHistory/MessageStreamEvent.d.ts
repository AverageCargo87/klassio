import { MessageRole } from './MessageRole';
export interface MessageStreamEvent {
    id: string;
    content: string;
    role: MessageRole;
    endOfSpeech: boolean;
    interrupted: boolean;
    contentIndex?: number;
    utteranceId?: string;
    correlationId?: string;
    cueTag?: string;
}
//# sourceMappingURL=MessageStreamEvent.d.ts.map