"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCustomPersonaConfig = void 0;
function isCustomPersonaConfig(personaConfig) {
    return 'brainType' in personaConfig || 'llmId' in personaConfig;
}
exports.isCustomPersonaConfig = isCustomPersonaConfig;
//# sourceMappingURL=PersonaConfig.js.map