import { AnamClientOptions, AnamEvent, AgentAudioInputConfig, DirectorNoteCueOptions, DirectorNoteCueTag, EventCallbacks, InputAudioState, PersonaConfig, ToolCallHandler } from './types';
import { AgentAudioInputStream } from './types/AgentAudioInputStream';
import { TalkMessageStream } from './types/TalkMessageStream';
export default class AnamClient {
    private publicEventEmitter;
    private internalEventEmitter;
    private toolCallManager;
    private readonly messageHistoryClient;
    private readonly reasoningHistoryClient;
    private personaConfig;
    private clientOptions;
    private inputAudioState;
    private sessionId;
    private servedRegion;
    private organizationId;
    private streamingClient;
    private apiClient;
    private _isStreaming;
    constructor(sessionToken: string | undefined, personaConfig?: PersonaConfig, options?: AnamClientOptions);
    private decodeJwt;
    private validateClientConfig;
    private buildStartSessionOptionsForClient;
    private startConnectionAttempt;
    private startSession;
    private startSessionIfNeeded;
    stream(userProvidedAudioStream?: MediaStream): Promise<MediaStream[]>;
    /**
     * @deprecated This method is deprecated. Please use streamToVideoElement instead.
     */
    streamToVideoAndAudioElements(videoElementId: string, audioElementId: string, userProvidedAudioStream?: MediaStream): Promise<void>;
    streamToVideoElement(videoElementId: string, userProvidedAudioStream?: MediaStream): Promise<void>;
    /**
     * Send a talk command to make the persona speak the provided content.
     * @param content - The text content for the persona to speak
     * @throws Error if session is not started or not currently streaming
     */
    talk(content: string): Promise<void>;
    /**
     * Send a raw data message through the WebRTC data channel.
     * @param message - The message string to send through the data channel
     * @throws Error if session is not started
     */
    sendDataMessage(message: string): void;
    /**
     * Send a user text message in the active streaming session.
     * @param content - The text message content to send
     * @throws Error if not currently streaming or session is not started
     */
    sendUserMessage(content: string): void;
    interruptPersona(): void;
    /**
     * Add context information to the active streaming session.
     * This allows injecting additional context (e.g., DOM state, user actions)
     * that the persona can use to inform its responses.
     * @param content - The context content string to send
     * @throws Error if not currently streaming or no active session
     */
    addContext(content: string): void;
    /**
     * Send a Director Note cue to the active streaming session without purging
     * buffered audio or video (Cara 4 avatars only).
     *
     * Omit timing to apply the cue immediately. `inSeconds` delays from now;
     * `atSeconds` targets an absolute offset from the start of persona speech.
     *
     * @param tag - Runtime performance cue understood by the engine.
     * @param options - Optional mutually exclusive cue timing.
     * @throws Error if not currently streaming, if the data channel is not open,
     * or if the cue is invalid
     */
    sendDirectorNoteCue(tag: DirectorNoteCueTag, options?: DirectorNoteCueOptions): void;
    stopStreaming(): Promise<void>;
    isStreaming(): boolean;
    setPersonaConfig(personaConfig: PersonaConfig): void;
    getPersonaConfig(): PersonaConfig | undefined;
    getInputAudioState(): InputAudioState;
    muteInputAudio(): InputAudioState;
    unmuteInputAudio(): InputAudioState;
    changeAudioInputDevice(deviceId: string): Promise<void>;
    createTalkMessageStream(correlationId?: string): TalkMessageStream;
    createAgentAudioInputStream(config: AgentAudioInputConfig): AgentAudioInputStream;
    /**
     * Event handling
     */
    addListener<K extends AnamEvent>(event: K, callback: EventCallbacks[K]): void;
    removeListener<K extends AnamEvent>(event: K, callback: EventCallbacks[K]): void;
    getActiveSessionId(): string | null;
    getActiveSessionRegion(): string | null;
    registerToolCallHandler(toolName: string, handler: ToolCallHandler): () => void;
    private validatePersonaConfigOrThrow;
}
//# sourceMappingURL=AnamClient.d.ts.map