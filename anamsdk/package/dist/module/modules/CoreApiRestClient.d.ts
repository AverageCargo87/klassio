import { ApiOptions, PersonaConfig, StartSessionResponse } from '../types';
import { StartSessionOptions } from '../types/coreApi/StartSessionOptions';
export declare class CoreApiRestClient {
    private baseUrl;
    private apiVersion;
    private apiKey;
    private sessionToken;
    private apiGatewayConfig;
    private retryOptions;
    private requestTimeoutMs;
    constructor(sessionToken?: string, apiKey?: string, options?: ApiOptions);
    /**
     * Builds URL and headers for a request, applying API Gateway configuration if enabled
     */
    private buildGatewayUrlAndHeaders;
    startSession(personaConfig?: PersonaConfig, sessionOptions?: StartSessionOptions): Promise<StartSessionResponse>;
    private attemptStartSession;
    private computeBackoffDelay;
    unsafe_getSessionToken(personaConfig: PersonaConfig): Promise<string>;
    private getApiUrl;
}
//# sourceMappingURL=CoreApiRestClient.d.ts.map