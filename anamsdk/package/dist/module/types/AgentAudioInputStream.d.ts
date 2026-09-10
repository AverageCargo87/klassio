import { SignallingClient } from '../modules/SignallingClient';
import { AgentAudioInputConfig } from './signalling/AgentAudioInputConfig';
export declare class AgentAudioInputStream {
    private signallingClient;
    private config;
    private sequenceNumber;
    constructor(config: AgentAudioInputConfig, signallingClient: SignallingClient);
    /**
     * Send PCM audio chunk to server.
     * @param audioData - Raw PCM audio bytes (ArrayBuffer/Uint8Array) or base64-encoded string
     */
    sendAudioChunk(audioData: ArrayBuffer | Uint8Array | string): void;
    /**
     * Signal end of the current audio sequence/turn.
     * Sends AGENT_AUDIO_INPUT_END signal message and resets sequence number.
     */
    endSequence(): void;
    /**
     * Get the current sequence number (number of chunks sent in current sequence).
     */
    getSequenceNumber(): number;
    /**
     * Get the audio format configuration for this stream.
     */
    getConfig(): AgentAudioInputConfig;
    private arrayBufferToBase64;
}
//# sourceMappingURL=AgentAudioInputStream.d.ts.map