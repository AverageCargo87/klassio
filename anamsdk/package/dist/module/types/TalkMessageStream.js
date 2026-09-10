var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { InternalEvent, SignalMessageAction } from '.';
import { TalkMessageStreamState } from './TalkMessageStreamState';
export class TalkMessageStream {
    constructor(correlationId, internalEventEmitter, signallingClient) {
        this.state = TalkMessageStreamState.UNSTARTED;
        this.correlationId = correlationId;
        this.internalEventEmitter = internalEventEmitter;
        this.signallingClient = signallingClient;
        this.internalEventEmitter.addListener(InternalEvent.SIGNAL_MESSAGE_RECEIVED, this.onSignalMessage.bind(this));
    }
    onDeactivate() {
        this.internalEventEmitter.removeListener(InternalEvent.SIGNAL_MESSAGE_RECEIVED, this.onSignalMessage.bind(this));
    }
    onSignalMessage(signalMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            if (signalMessage.actionType === SignalMessageAction.TALK_STREAM_INTERRUPTED) {
                const message = signalMessage.payload;
                if (message.correlationId === this.correlationId) {
                    this.state = TalkMessageStreamState.INTERRUPTED;
                    this.onDeactivate();
                }
            }
        });
    }
    endMessage() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state === TalkMessageStreamState.ENDED) {
                console.warn('Talk stream is already ended via end of speech. No need to call endMessage.');
                return;
            }
            if (this.state !== TalkMessageStreamState.STREAMING) {
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
            this.state = TalkMessageStreamState.ENDED;
            this.onDeactivate();
        });
    }
    streamMessageChunk(partialMessage, endOfSpeech) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state !== TalkMessageStreamState.STREAMING &&
                this.state !== TalkMessageStreamState.UNSTARTED) {
                // throw error
                throw new Error('Talk stream is not in an active state: ' + this.state);
            }
            const payload = {
                content: partialMessage,
                startOfSpeech: this.state === TalkMessageStreamState.UNSTARTED,
                endOfSpeech: endOfSpeech,
                correlationId: this.correlationId,
            };
            this.state = endOfSpeech
                ? TalkMessageStreamState.ENDED
                : TalkMessageStreamState.STREAMING;
            if (this.state === TalkMessageStreamState.ENDED) {
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
        return (this.state === TalkMessageStreamState.STREAMING ||
            this.state === TalkMessageStreamState.UNSTARTED);
    }
    getState() {
        return this.state;
    }
}
//# sourceMappingURL=TalkMessageStream.js.map