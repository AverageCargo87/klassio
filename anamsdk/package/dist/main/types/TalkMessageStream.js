"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TalkMessageStream = void 0;
const _1 = require(".");
const TalkMessageStreamState_1 = require("./TalkMessageStreamState");
class TalkMessageStream {
    constructor(correlationId, internalEventEmitter, signallingClient) {
        this.state = TalkMessageStreamState_1.TalkMessageStreamState.UNSTARTED;
        this.correlationId = correlationId;
        this.internalEventEmitter = internalEventEmitter;
        this.signallingClient = signallingClient;
        this.internalEventEmitter.addListener(_1.InternalEvent.SIGNAL_MESSAGE_RECEIVED, this.onSignalMessage.bind(this));
    }
    onDeactivate() {
        this.internalEventEmitter.removeListener(_1.InternalEvent.SIGNAL_MESSAGE_RECEIVED, this.onSignalMessage.bind(this));
    }
    onSignalMessage(signalMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            if (signalMessage.actionType === _1.SignalMessageAction.TALK_STREAM_INTERRUPTED) {
                const message = signalMessage.payload;
                if (message.correlationId === this.correlationId) {
                    this.state = TalkMessageStreamState_1.TalkMessageStreamState.INTERRUPTED;
                    this.onDeactivate();
                }
            }
        });
    }
    endMessage() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state === TalkMessageStreamState_1.TalkMessageStreamState.ENDED) {
                console.warn('Talk stream is already ended via end of speech. No need to call endMessage.');
                return;
            }
            if (this.state !== TalkMessageStreamState_1.TalkMessageStreamState.STREAMING) {
                console.warn('Talk stream is not in an active state: ' + this.state);
                return;
            }
            const payload = {
                content: '',
                startOfSpeech: false,
                endOfSpeech: true,
                correlationId: this.correlationId,
            };
            yield this.signallingClient.sendTalkMessage(payload);
            this.state = TalkMessageStreamState_1.TalkMessageStreamState.ENDED;
            this.onDeactivate();
        });
    }
    streamMessageChunk(partialMessage, endOfSpeech) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state !== TalkMessageStreamState_1.TalkMessageStreamState.STREAMING &&
                this.state !== TalkMessageStreamState_1.TalkMessageStreamState.UNSTARTED) {
                // throw error
                throw new Error('Talk stream is not in an active state: ' + this.state);
            }
            const payload = {
                content: partialMessage,
                startOfSpeech: this.state === TalkMessageStreamState_1.TalkMessageStreamState.UNSTARTED,
                endOfSpeech: endOfSpeech,
                correlationId: this.correlationId,
            };
            this.state = endOfSpeech
                ? TalkMessageStreamState_1.TalkMessageStreamState.ENDED
                : TalkMessageStreamState_1.TalkMessageStreamState.STREAMING;
            if (this.state === TalkMessageStreamState_1.TalkMessageStreamState.ENDED) {
                this.onDeactivate();
            }
            // send message to signalling client
            yield this.signallingClient.sendTalkMessage(payload);
        });
    }
    getCorrelationId() {
        return this.correlationId;
    }
    isActive() {
        return (this.state === TalkMessageStreamState_1.TalkMessageStreamState.STREAMING ||
            this.state === TalkMessageStreamState_1.TalkMessageStreamState.UNSTARTED);
    }
    getState() {
        return this.state;
    }
}
exports.TalkMessageStream = TalkMessageStream;
//# sourceMappingURL=TalkMessageStream.js.map