"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = exports.ClientError = exports.unsafe_createClientWithApiKey = exports.createClient = void 0;
const AnamClient_1 = __importDefault(require("./AnamClient"));
const ClientError_1 = require("./lib/ClientError");
Object.defineProperty(exports, "ClientError", { enumerable: true, get: function () { return ClientError_1.ClientError; } });
Object.defineProperty(exports, "ErrorCode", { enumerable: true, get: function () { return ClientError_1.ErrorCode; } });
/**
 * Create a new Anam client.
 * @param sessionToken - A session token can be obtained from the Anam API.
 * @param personaConfig - The persona configuration to use.
 * @param options - Additional options.
 * @returns A new Anam client instance.
 */
const createClient = (sessionToken, options) => {
    return new AnamClient_1.default(sessionToken, undefined, options);
};
exports.createClient = createClient;
/**
 * Create a new Anam client with an API key instead of a session token.
 * This method is unsafe for production environments because it requires exposing your API key to the client side.
 * Only use this method for local testing.
 * @param apiKey - Your Anam API key.
 * @param personaConfig - The persona configuration to use.
 * @param options - Additional options.
 * @returns A new Anam client instance.
 */
const unsafe_createClientWithApiKey = (apiKey, personaConfig, options) => {
    return new AnamClient_1.default(undefined, personaConfig, Object.assign(Object.assign({}, options), { apiKey }));
};
exports.unsafe_createClientWithApiKey = unsafe_createClientWithApiKey;
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map