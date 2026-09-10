import AnamClient from './AnamClient';
import { PersonaConfig } from './types';
import { AnamPublicClientOptions } from './types/AnamPublicClientOptions';
import { ClientError, ErrorCode } from './lib/ClientError';
/**
 * Create a new Anam client.
 * @param sessionToken - A session token can be obtained from the Anam API.
 * @param personaConfig - The persona configuration to use.
 * @param options - Additional options.
 * @returns A new Anam client instance.
 */
declare const createClient: (sessionToken: string, options?: AnamPublicClientOptions) => AnamClient;
/**
 * Create a new Anam client with an API key instead of a session token.
 * This method is unsafe for production environments because it requires exposing your API key to the client side.
 * Only use this method for local testing.
 * @param apiKey - Your Anam API key.
 * @param personaConfig - The persona configuration to use.
 * @param options - Additional options.
 * @returns A new Anam client instance.
 */
declare const unsafe_createClientWithApiKey: (apiKey: string, personaConfig: PersonaConfig, options?: AnamPublicClientOptions) => AnamClient;
export { createClient, unsafe_createClientWithApiKey, ClientError, ErrorCode };
export type { AnamClient };
export * from './types';
//# sourceMappingURL=index.d.ts.map