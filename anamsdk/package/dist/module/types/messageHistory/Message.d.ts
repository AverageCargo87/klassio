import { MessageRole } from './MessageRole';
export interface MessageUtterance {
    id: string;
    content: string;
}
export interface Message {
    id: string;
    content: string;
    role: MessageRole;
    interrupted?: boolean;
    utterances?: MessageUtterance[];
}
//# sourceMappingURL=Message.d.ts.map