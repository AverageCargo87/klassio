import { WebRtcTextMessageEvent } from '../types';
import { PublicEventEmitter, InternalEventEmitter } from '.';
export declare class MessageHistoryClient {
    private publicEventEmitter;
    private internalEventEmitter;
    private messages;
    private publishedUtterances;
    constructor(publicEventEmitter: PublicEventEmitter, internalEventEmitter: InternalEventEmitter);
    private webRtcTextMessageEventToMessageStreamEvent;
    private processUserMessage;
    private appendUtterance;
    private processPersonaMessage;
    processWebRtcTextMessageEvent(event: WebRtcTextMessageEvent): void;
}
//# sourceMappingURL=MessageHistoryClient.d.ts.map