import { ApiGatewayConfig } from '../types/ApiGatewayConfig';
export declare class EngineApiRestClient {
    private baseUrl;
    private sessionId;
    private apiGatewayConfig;
    constructor(baseUrl: string, sessionId: string, apiGatewayConfig?: ApiGatewayConfig);
    sendTalkCommand(content: string): Promise<void>;
}
//# sourceMappingURL=EngineApiRestClient.d.ts.map