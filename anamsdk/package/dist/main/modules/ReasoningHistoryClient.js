"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReasoningHistoryClient = void 0;
const types_1 = require("../types");
class ReasoningHistoryClient {
    constructor(publicEventEmitter, internalEventEmitter) {
        this.reasoning_messages = [];
        this.publicEventEmitter = publicEventEmitter;
        this.internalEventEmitter = internalEventEmitter;
        // register for events
        this.internalEventEmitter.addListener(types_1.InternalEvent.WEBRTC_REASONING_TEXT_MESSAGE_RECEIVED, this.processWebRtcReasoningTextMessageEvent.bind(this));
    }
    webRtcTextMessageEventToReasoningStreamEvent(event) {
        return {
            id: `${event.role}::${event.message_id}`,
            content: event.content,
            endOfThought: event.end_of_thought,
            role: event.role,
        };
    }
    processWebRtcReasoningTextMessageEvent(event) {
        const ReasoningStreamEvent = this.webRtcTextMessageEventToReasoningStreamEvent(event);
        this.publicEventEmitter.emit(types_1.AnamEvent.REASONING_STREAM_EVENT_RECEIVED, ReasoningStreamEvent);
        const message = {
            id: ReasoningStreamEvent.id,
            content: ReasoningStreamEvent.content,
            role: ReasoningStreamEvent.role,
        };
        const existingMessageIndex = this.reasoning_messages.findIndex((m) => m.id === message.id);
        if (existingMessageIndex !== -1) {
            // update existing message
            const existingMessage = this.reasoning_messages[existingMessageIndex];
            existingMessage.content += message.content;
            this.reasoning_messages[existingMessageIndex] = existingMessage;
        }
        else {
            // new message
            this.reasoning_messages.push(message);
        }
        if (ReasoningStreamEvent.endOfThought) {
            this.publicEventEmitter.emit(types_1.AnamEvent.REASONING_HISTORY_UPDATED, this.reasoning_messages);
        }
    }
}
exports.ReasoningHistoryClient = ReasoningHistoryClient;
//# sourceMappingURL=ReasoningHistoryClient.js.map