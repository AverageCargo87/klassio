var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ClientError, ErrorCode } from '../lib/ClientError';
import { CLIENT_METADATA, DEFAULT_API_BASE_URL, DEFAULT_API_VERSION, DEFAULT_START_SESSION_INITIAL_BACKOFF_MS, DEFAULT_START_SESSION_MAX_ATTEMPTS, DEFAULT_START_SESSION_MAX_BACKOFF_MS, DEFAULT_START_SESSION_REQUEST_TIMEOUT_MS, } from '../lib/constants';
export class CoreApiRestClient {
    constructor(sessionToken, apiKey, options) {
        if (!sessionToken && !apiKey) {
            throw new Error('Either sessionToken or apiKey must be provided');
        }
        this.sessionToken = sessionToken || null;
        this.apiKey = apiKey || null;
        this.baseUrl = (options === null || options === void 0 ? void 0 : options.baseUrl) || DEFAULT_API_BASE_URL;
        this.apiVersion = (options === null || options === void 0 ? void 0 : options.apiVersion) || DEFAULT_API_VERSION;
        this.apiGatewayConfig = (options === null || options === void 0 ? void 0 : options.apiGateway) || undefined;
        this.retryOptions = resolveRetryOptions(options === null || options === void 0 ? void 0 : options.retry);
        this.requestTimeoutMs = Math.max(0, asFiniteNumber(options === null || options === void 0 ? void 0 : options.requestTimeoutMs, DEFAULT_START_SESSION_REQUEST_TIMEOUT_MS));
    }
    /**
     * Builds URL and headers for a request, applying API Gateway configuration if enabled
     */
    buildGatewayUrlAndHeaders(targetPath, baseHeaders) {
        var _a, _b;
        if (((_a = this.apiGatewayConfig) === null || _a === void 0 ? void 0 : _a.enabled) && ((_b = this.apiGatewayConfig) === null || _b === void 0 ? void 0 : _b.baseUrl)) {
            // Use gateway base URL with same endpoint path
            const url = `${this.apiGatewayConfig.baseUrl}${targetPath}`;
            // Add complete target URL header for gateway routing
            const targetUrl = new URL(`${this.baseUrl}${targetPath}`);
            const headers = Object.assign(Object.assign({}, baseHeaders), { 'X-Anam-Target-Url': targetUrl.href });
            return { url, headers };
        }
        else {
            // Direct call to Anam API
            return {
                url: `${this.baseUrl}${targetPath}`,
                headers: baseHeaders,
            };
        }
    }
    startSession(personaConfig, sessionOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.sessionToken) {
                if (!personaConfig) {
                    throw new ClientError('Persona configuration must be provided when using apiKey', ErrorCode.CLIENT_ERROR_CODE_VALIDATION_ERROR, 400);
                }
                this.sessionToken = yield this.unsafe_getSessionToken(personaConfig);
            }
            // Check if brainType is being used and log deprecation warning
            if (personaConfig && 'brainType' in personaConfig) {
                console.warn('Warning: brainType is deprecated and will be removed in a future version. Please use llmId instead.');
            }
            const { maxAttempts } = this.retryOptions;
            let lastError;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    return yield this.attemptStartSession(personaConfig, sessionOptions);
                }
                catch (error) {
                    lastError = error;
                    if (attempt >= maxAttempts || !isRetryableError(error)) {
                        throw error;
                    }
                    yield sleep(this.computeBackoffDelay(attempt));
                }
            }
            throw lastError;
        });
    }
    attemptStartSession(personaConfig, sessionOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const controller = this.requestTimeoutMs > 0 ? new AbortController() : undefined;
            const timeoutHandle = controller !== undefined
                ? setTimeout(() => controller.abort(), this.requestTimeoutMs)
                : undefined;
            try {
                const targetPath = `${this.apiVersion}/engine/session`;
                const { url, headers } = this.buildGatewayUrlAndHeaders(targetPath, {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.sessionToken}`,
                });
                const response = yield fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        personaConfig,
                        sessionOptions,
                        clientMetadata: CLIENT_METADATA,
                    }),
                    signal: controller === null || controller === void 0 ? void 0 : controller.signal,
                });
                const data = yield response.json();
                const errorCause = data.error;
                switch (response.status) {
                    case 200:
                    case 201:
                        return data;
                    case 400:
                        throw new ClientError('Invalid request to start session', ErrorCode.CLIENT_ERROR_CODE_VALIDATION_ERROR, 400, { cause: data.message });
                    case 401:
                        throw new ClientError('Authentication failed when starting session', ErrorCode.CLIENT_ERROR_CODE_AUTHENTICATION_ERROR, 401, { cause: data.message });
                    case 402:
                        throw new ClientError('Please sign up for a plan to start a session', ErrorCode.CLIENT_ERROR_CODE_NO_PLAN_FOUND, 402, { cause: data.message });
                    case 403:
                        throw new ClientError('Authentication failed when starting session', ErrorCode.CLIENT_ERROR_CODE_AUTHENTICATION_ERROR, 403, { cause: data.message });
                    case 429:
                        if (errorCause === 'Concurrent session limit reached') {
                            throw new ClientError('Concurrency limit reached, please upgrade your plan', ErrorCode.CLIENT_ERROR_CODE_MAX_CONCURRENT_SESSIONS_REACHED, 429, { cause: data.message });
                        }
                        else if (errorCause === 'Spend cap reached') {
                            throw new ClientError('Spend cap reached, please upgrade your plan', ErrorCode.CLIENT_ERROR_CODE_SPEND_CAP_REACHED, 429, { cause: data.message });
                        }
                        else {
                            throw new ClientError('Usage limit reached, please upgrade your plan', ErrorCode.CLIENT_ERROR_CODE_USAGE_LIMIT_REACHED, 429, { cause: data.message });
                        }
                    case 503:
                        throw new ClientError('There are no available personas, please try again later', ErrorCode.CLIENT_ERROR_CODE_SERVICE_BUSY, 503, { cause: data.message });
                    default:
                        throw new ClientError('Unknown error when starting session', ErrorCode.CLIENT_ERROR_CODE_SERVER_ERROR, response.status, { cause: data.message });
                }
            }
            catch (error) {
                if (error instanceof ClientError) {
                    throw error;
                }
                throw new ClientError('Failed to start session', ErrorCode.CLIENT_ERROR_CODE_SERVER_ERROR, 500, { cause: error instanceof Error ? error.message : String(error) });
            }
            finally {
                if (timeoutHandle !== undefined) {
                    clearTimeout(timeoutHandle);
                }
            }
        });
    }
    computeBackoffDelay(attempt) {
        const { initialBackoffMs, maxBackoffMs } = this.retryOptions;
        const exponential = Math.min(maxBackoffMs, initialBackoffMs * Math.pow(2, attempt - 1));
        // Equal jitter: half deterministic, half random. Avoids both thundering
        // herd and zero-delay retries that would hammer a recovering origin.
        return Math.floor(exponential / 2 + Math.random() * (exponential / 2));
    }
    unsafe_getSessionToken(personaConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            console.warn('Using an insecure method. This method should not be used in production.');
            if (!this.apiKey) {
                throw new Error('No apiKey provided');
            }
            // Check if brainType is being used and log deprecation warning
            if (personaConfig && 'brainType' in personaConfig) {
                console.warn('Warning: brainType is deprecated and will be removed in a future version. Please use llmId instead.');
            }
            const body = {
                clientLabel: 'js-sdk-api-key',
                personaConfig,
            };
            try {
                const targetPath = `${this.apiVersion}/auth/session-token`;
                const { url, headers } = this.buildGatewayUrlAndHeaders(targetPath, {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                });
                const response = yield fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });
                let data = {};
                try {
                    const responseBody = yield response.json();
                    if (responseBody && typeof responseBody === 'object') {
                        data = responseBody;
                    }
                }
                catch (_a) {
                    // Gateways can return empty or non-JSON error bodies. Status-based
                    // classification below must still preserve the real HTTP failure.
                }
                if (!response.ok) {
                    const isAuthenticationError = response.status === 401 || response.status === 403;
                    const responseMessage = typeof data.message === 'string'
                        ? data.message
                        : typeof data.error === 'string'
                            ? data.error
                            : `Request failed with HTTP status ${response.status}`;
                    const clientError = new ClientError('Failed to get session token', isAuthenticationError
                        ? ErrorCode.CLIENT_ERROR_CODE_AUTHENTICATION_ERROR
                        : response.status >= 400 && response.status < 500
                            ? ErrorCode.CLIENT_ERROR_CODE_VALIDATION_ERROR
                            : ErrorCode.CLIENT_ERROR_CODE_SERVER_ERROR, response.status, { cause: responseMessage });
                    // Keep the response available to the caller without forwarding a
                    // potentially sensitive or unbounded validation body into metrics.
                    clientError.details = { cause: responseMessage, responseBody: data };
                    throw clientError;
                }
                if (typeof data.sessionToken !== 'string' || !data.sessionToken) {
                    throw new ClientError('Failed to get session token', ErrorCode.CLIENT_ERROR_CODE_SERVER_ERROR, 500, { cause: 'Response did not include a session token' });
                }
                return data.sessionToken;
            }
            catch (error) {
                if (error instanceof ClientError) {
                    throw error;
                }
                throw new ClientError('Failed to get session token', ErrorCode.CLIENT_ERROR_CODE_SERVER_ERROR, 500, { cause: error instanceof Error ? error.message : String(error) });
            }
        });
    }
    getApiUrl() {
        return `${this.baseUrl}${this.apiVersion}`;
    }
}
function resolveRetryOptions(options) {
    // NaN/Infinity would silently break the retry loop or remove the backoff
    // cap, so coerce non-finite numerics back to the defaults before flooring.
    const maxAttempts = Math.max(1, Math.floor(asFiniteNumber(options === null || options === void 0 ? void 0 : options.maxAttempts, DEFAULT_START_SESSION_MAX_ATTEMPTS)));
    const initialBackoffMs = Math.max(0, asFiniteNumber(options === null || options === void 0 ? void 0 : options.initialBackoffMs, DEFAULT_START_SESSION_INITIAL_BACKOFF_MS));
    const maxBackoffMs = Math.max(initialBackoffMs, asFiniteNumber(options === null || options === void 0 ? void 0 : options.maxBackoffMs, DEFAULT_START_SESSION_MAX_BACKOFF_MS));
    return { maxAttempts, initialBackoffMs, maxBackoffMs };
}
function asFiniteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function isRetryableError(error) {
    if (error instanceof ClientError) {
        return error.statusCode >= 500 && error.statusCode < 600;
    }
    // Unwrapped errors (e.g. fetch network failures that escape attemptStartSession
    // without being normalized to a ClientError) are treated as transient.
    return true;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=CoreApiRestClient.js.map