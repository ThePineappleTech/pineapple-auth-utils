"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalServiceClient = void 0;
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
/**
 * Client for making authenticated calls from PUBLIC services to INTERNAL services
 * Uses simple signature-based authentication with rotating secrets
 */
class InternalServiceClient {
    constructor(serviceName) {
        this.serviceName = serviceName;
        this.apiKey = process.env.INTERNAL_API_KEY || 'default-key';
        this.apiSecret = process.env.INTERNAL_API_SECRET || 'default-secret';
    }
    /**
     * Make authenticated call to internal service via pineapple-api
     */
    async callInternalService(endpoint, method = 'GET', data) {
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = crypto_1.default.randomUUID();
        // Create signature with nonce for one-time use
        const signatureData = `${this.apiKey}:${timestamp}:${nonce}:${this.apiSecret}`;
        const signature = crypto_1.default.createHash('sha256').update(signatureData).digest('hex').toUpperCase();
        const headers = {
            'Authorization': `PINEAPPLE-INTERNAL key=${this.apiKey} timestamp=${timestamp} nonce=${nonce} signature=${signature}`,
            'Content-Type': 'application/json',
            'X-Service-Name': this.serviceName
        };
        const baseUrl = process.env.PINEAPPLE_API_URL || 'http://localhost:3000';
        const url = `${baseUrl}${endpoint}`;
        try {
            const response = await (0, axios_1.default)({
                method,
                url,
                headers,
                data: data ? JSON.stringify(data) : undefined
            });
            return response.data;
        }
        catch (error) {
            console.error(`Internal service call failed: ${error.message}`);
            throw error;
        }
    }
    /**
     * Call auth service for user operations
     */
    async callAuthService(endpoint, data) {
        return this.callInternalService(`/internal/auth${endpoint}`, 'POST', data);
    }
    /**
     * Example: Validate user session
     */
    async validateUserSession(userId) {
        return this.callAuthService('/validate-session', { userId });
    }
    /**
     * Example: Get user profile
     */
    async getUserProfile(userId) {
        return this.callAuthService('/user-profile', { userId });
    }
}
exports.InternalServiceClient = InternalServiceClient;
//# sourceMappingURL=internal-service.client.js.map