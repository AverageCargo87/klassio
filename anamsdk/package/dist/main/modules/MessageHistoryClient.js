"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHistoryClient = void 0;
const types_1 = require("../types");
class MessageHistoryClient {
    constructor(publicEventEmitter, internalEventEmitter) {
        this.messages = [];
        this.publishedUtterances = new WeakSet();
        this.publicEventEmitter = publicEventEmitter;
        this.internalEventEmitter = internalEventEmitter;
        // register for events
        this.internalEventEmitter.addListener(types_1.InternalEvent.WEBRTC_CHAT_MESSAGE_RECEIVED, this.processWebRtcTextMessageEvent.bind(this));
    }
    webRtcTextMessageEventToMessageStreamEvent(event) {
        var _a;
        const correlationId = (_a = event.user_action_correlation_id) !== null && _a !== void 0 ? _a : event.correlationId;
        return Object.assign(Object.assign(Object.assign({ id: `${event.role}::${event.message_id}`, content: event.content, role: event.role, endOfSpeech: event.end_of_speech, interrupted: event.interrupted, contentIndex: event.content_index }, (event.utterance_id ? { utteranceId: event.utterance_id } : {})), (correlationId ? { correlationId } : {})), (event.cue_tag ? { cueTag: event.cue_tag } : {}));
    }
    processUserMessage(messageEvent) {
        // each user message is added directly to the history
        // user messages can not be interrupted
        const userMessage = {
            id: messageEvent.id,
            content: messageEvent.content,
            role: messageEvent.role,
        };
        this.messages.push(userMessage);
    }
    // Appends a chunk to the message's per-utterance breakdown. A joining space is prepended
    // to each subsequent utterance so the turn-level content concatenates correctly; remove
    // only that separator while preserving all other leading whitespace.
    appendUtterance(utterances, messageEvent) {
        if (!messageEvent.utteranceId)
            return utterances;
        const wasPublished = !!utterances && this.publishedUtterances.has(utterances);
        const current = wasPublished ? [...utterances] : utterances !== null && utterances !== void 0 ? utterances : [];
        const last = current[current.length - 1];
        if (last && last.id === messageEvent.utteranceId) {
            const updatedLast = wasPublished ? Object.assign({}, last) : last;
            updatedLast.content += messageEvent.content;
            current[current.length - 1] = updatedLast;
            return current;
        }
        const content = current.length > 0 && messageEvent.content.startsWith(' ')
            ? messageEvent.content.slice(1)
            : messageEvent.content;
        current.push({ id: messageEvent.utteranceId, content });
        return current;
    }
    processPersonaMessage(messageEvent) {
        const personaMessage = {
            id: messageEvent.id,
            content: messageEvent.content,
            role: messageEvent.role,
            interrupted: messageEvent.interrupted,
        };
        // check for existing message in the history
        const existingMessageIndex = this.messages.findIndex((m) => m.id === personaMessage.id);
        if (existingMessageIndex !== -1) {
            const existingMessage = this.messages[existingMessageIndex];
            const utterances = this.appendUtterance(existingMessage.utterances, messageEvent);
            // update the existing message
            this.messages[existingMessageIndex] = Object.assign(Object.assign(Object.assign({}, existingMessage), { content: existingMessage.content + personaMessage.content, interrupted: existingMessage.interrupted || personaMessage.interrupted }), (utterances ? { utterances } : {}));
        }
        else {
            const utterances = this.appendUtterance(undefined, messageEvent);
            // add the new persona message to the history
            this.messages.push(Object.assign(Object.assign({}, personaMessage), (utterances ? { utterances } : {})));
        }
    }
    processWebRtcTextMessageEvent(event) {
        const messageStreamEvent = this.webRtcTextMessageEventToMessageStreamEvent(event);
        // pass to callback stream
        this.publicEventEmitter.emit(types_1.AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, messageStreamEvent);
        // update the message history
        switch (messageStreamEvent.role) {
            case types_1.MessageRole.USER:
                this.processUserMessage(messageStreamEvent);
                break;
            case types_1.MessageRole.PERSONA:
                this.processPersonaMessage(messageStreamEvent);
                break;
        }
        if (messageStreamEvent.endOfSpeech) {
            this.messages.forEach((message) => {
                if (message.utterances) {
                    this.publishedUtterances.add(message.utterances);
                }
            });
            this.publicEventEmitter.emit(types_1.AnamEvent.MESSAGE_HISTORY_UPDATED, this.messages);
        }
    }
}
exports.MessageHistoryClient = MessageHistoryClient;
//# sourceMappingURL=MessageHistoryClient.js.map