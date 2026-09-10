"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCorrelationId = void 0;
function generateCorrelationId() {
    // Try native crypto.randomUUID() first (supported in modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older environments and older react native
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
exports.generateCorrelationId = generateCorrelationId;
//# sourceMappingURL=correlationId.js.map