"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientError = exports.ErrorCode = void 0;
const ClientMetrics_1 = require("./ClientMetrics");
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["CLIENT_ERROR_CODE_USAGE_LIMIT_REACHED"] = "CLIENT_ERROR_CODE_USAGE_LIMIT_REACHED";
    ErrorCode["CLIENT_ERROR_CODE_SPEND_CAP_REACHED"] = "CLIENT_ERROR_CODE_SPEND_CAP_REACHED";
    ErrorCode["CLIENT_ERROR_CODE_VALIDATION_ERROR"] = "CLIENT_ERROR_CODE_VALIDATION_ERROR";
    ErrorCode["CLIENT_ERROR_CODE_AUTHENTICATION_ERROR"] = "CLIENT_ERROR_CODE_AUTHENTICATION_ERROR";
    ErrorCode["CLIENT_ERROR_CODE_SERVER_ERROR"] = "CLIENT_ERROR_CODE_SERVER_ERROR";
    ErrorCode["CLIENT_ERROR_CODE_MAX_CONCURRENT_SESSIONS_REACHED"] = "CLIENT_ERROR_CODE_MAX_CONCURRENT_SESSIONS_REACHED";
    ErrorCode["CLIENT_ERROR_CODE_SERVICE_BUSY"] = "CLIENT_ERROR_CODE_SERVICE_BUSY";
    ErrorCode["CLIENT_ERROR_CODE_NO_PLAN_FOUND"] = "CLIENT_ERROR_CODE_NO_PLAN_FOUND";
    ErrorCode["CLIENT_ERROR_CODE_UNKNOWN_ERROR"] = "CLIENT_ERROR_CODE_UNKNOWN_ERROR";
    ErrorCode["CLIENT_ERROR_CODE_CONFIGURATION_ERROR"] = "CLIENT_ERROR_CODE_CONFIGURATION_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
class ClientError extends Error {
    constructor(message, code, statusCode = 500, details) {
        super(message);
        this.name = 'ClientError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        Object.setPrototypeOf(this, ClientError.prototype);
        // Send error metric when error is created
        (0, ClientMetrics_1.sendClientMetric)(ClientMetrics_1.ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_ERROR, code, {
            details,
            statusCode,
        });
    }
}
exports.ClientError = ClientError;
//# sourceMappingURL=ClientError.js.map