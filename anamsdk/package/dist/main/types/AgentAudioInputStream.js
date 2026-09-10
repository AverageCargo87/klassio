"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentAudioInputStream = void 0;
class AgentAudioInputStream {
    constructor(config, signallingClient) {
        this.sequenceNumber = 0;
        this.config = config;
        this.signallingClient = signallingClient;
    }
    /**
     * Send PCM audio chunk to server.
     * @param audioData - Raw PCM audio bytes (ArrayBuffer/Uint8Array) or base64-encoded string
     */
    sendAudioChunk(audioData) {
        const base64 = typeof audioData === 'string'
            ? audioData
            : this.arrayBufferToBase64(audioData);
        const payload = {
            audioData: base64,
            encoding: this.config.encoding,
            sampleRate: this.config.sampleRate,
            channels: this.config.channels,
            sequenceNumber: this.sequenceNumber++,
        };
        this.signallingClient.sendAgentAudioInput(payload);
    }
    /**
     * Signal end of the current audio sequence/turn.
     * Sends AGENT_AUDIO_INPUT_END signal message and resets sequence number.
     */
    endSequence() {
        this.signallingClient.sendAgentAudioInputEnd();
        this.sequenceNumber = 0;
    }
    /**
     * Get the current sequence number (number of chunks sent in current sequence).
     */
    getSequenceNumber() {
        return this.sequenceNumber;
    }
    /**
     * Get the audio format configuration for this stream.
     */
    getConfig() {
        return this.config;
    }
    arrayBufferToBase64(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
        return btoa(binary);
    }
}
exports.AgentAudioInputStream = AgentAudioInputStream;
//# sourceMappingURL=AgentAudioInputStream.js.map