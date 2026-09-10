import { TalkMessageStreamState } from './TalkMessageStreamState';
import { InternalEventEmitter } from '../modules/InternalEventEmitter';
import { SignallingClient } from '../modules/SignallingClient';
export declare class TalkMessageStream {
    private internalEventEmitter;
    private state;
    private correlationId;
    private signallingClient;
    constructor(correlationId: string, internalEventEmitter: InternalEventEmitter, signallingClient: SignallingClient);
    private onDeactivate;
    private onSignalMessage;
    endMessage(): Promise<void>;
    streamMessageChunk(partialMessage: string, endOfSpeech: boolean): Promise<void>;
    getCorrelationId(): string;
    isActive(): boolean;
    getState(): TalkMessageStreamState;
}
//# sourceMappingURL=TalkMessageStream.d.ts.map