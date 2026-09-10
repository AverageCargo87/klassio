"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_START_SESSION_REQUEST_TIMEOUT_MS = exports.DEFAULT_START_SESSION_MAX_BACKOFF_MS = exports.DEFAULT_START_SESSION_INITIAL_BACKOFF_MS = exports.DEFAULT_START_SESSION_MAX_ATTEMPTS = exports.CLIENT_METADATA = exports.DEFAULT_API_VERSION = exports.DEFAULT_API_BASE_URL = exports.DEFAULT_HEADERS = void 0;
// Core API
exports.DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
};
exports.DEFAULT_API_BASE_URL = 'https://api.anam.ai';
exports.DEFAULT_API_VERSION = '/v1'; // include the leading slash
exports.CLIENT_METADATA = {
    client: 'js-sdk',
    // Placeholder substituted by semantic-release-mirror-version. The substitution
    // must happen here in src, not only in dist: `npm publish` re-runs the `prepare`
    // build, which would otherwise regenerate dist with the placeholder intact.
    version: '4.25.0',
};
// Retry policy for startSession. Applied to transient failures only
// (network errors and 5xx responses); 4xx responses are never retried.
exports.DEFAULT_START_SESSION_MAX_ATTEMPTS = 3;
exports.DEFAULT_START_SESSION_INITIAL_BACKOFF_MS = 250;
exports.DEFAULT_START_SESSION_MAX_BACKOFF_MS = 2000;
// Per-attempt timeout. Without this, a hung connection (no TCP reset)
// would block the retry loop from ever firing.
exports.DEFAULT_START_SESSION_REQUEST_TIMEOUT_MS = 10000;
//# sourceMappingURL=constants.js.map