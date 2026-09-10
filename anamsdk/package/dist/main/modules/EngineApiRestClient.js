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
exports.EngineApiRestClient = void 0;
class EngineApiRestClient {
    constructor(baseUrl, sessionId, apiGatewayConfig) {
        this.baseUrl = baseUrl;
        this.sessionId = sessionId;
        this.apiGatewayConfig = apiGatewayConfig;
    }
    sendTalkCommand(content) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                // Determine the URL and headers based on API Gateway configuration
                let url;
                const headers = {
                    'Content-Type': 'application/json',
                };
                const targetPath = `/talk`;
                const queryString = `?session_id=${this.sessionId}`;
                if (((_a = this.apiGatewayConfig) === null || _a === void 0 ? void 0 : _a.enabled) && ((_b = this.apiGatewayConfig) === null || _b === void 0 ? void 0 : _b.baseUrl)) {
                    // Use gateway base URL with same endpoint path
                    url = `${this.apiGatewayConfig.baseUrl}${targetPath}${queryString}`;
                    // Add complete target URL header for gateway routing
                    const targetUrl = new URL(`${this.baseUrl}${targetPath}${queryString}`);
                    headers['X-Anam-Target-Url'] = targetUrl.href;
                }
                else {
                    // Direct call to Anam engine
                    url = `${this.baseUrl}${targetPath}${queryString}`;
                }
                const response = yield fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        content,
                    }),
                });
                if (!response.ok) {
                    throw new Error(`Failed to send talk command: ${response.status} ${response.statusText}`);
                }
            }
            catch (error) {
                console.error(error);
                throw new Error('EngineApiRestClient - sendTalkCommand: Failed to send talk command');
            }
        });
    }
}
exports.EngineApiRestClient = EngineApiRestClient;
//# sourceMappingURL=EngineApiRestClient.js.map