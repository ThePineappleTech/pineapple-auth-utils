"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PineappleAuthClient = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const aws4_1 = __importDefault(require("aws4"));
const client_sts_1 = require("@aws-sdk/client-sts");
class PineappleAuthClient {
    constructor(config) {
        this.config = config;
        this.credentialsCache = new Map();
        if (config.aws) {
            this.sts = new client_sts_1.STS({ region: config.aws.region });
        }
    }
    /**
     * Generate JWT tokens for user authentication
     */
    generateUserTokens(userId, email, role, permissions) {
        if (!this.config.jwt) {
            throw new Error('JWT config not provided');
        }
        const tokenId = crypto_1.default.randomUUID();
        const payload = {
            userId,
            email,
            role,
            permissions,
            jti: tokenId
        };
        const accessOptions = {
            expiresIn: this.config.jwt.accessExpiresIn || '15m',
            issuer: this.config.jwt.issuer,
            audience: 'pineapple-services',
            subject: userId
        };
        const refreshOptions = {
            expiresIn: this.config.jwt.refreshExpiresIn || '30d',
            issuer: this.config.jwt.issuer,
            audience: 'pineapple-refresh',
            subject: userId
        };
        const accessToken = jsonwebtoken_1.default.sign(payload, this.config.jwt.accessSecret, accessOptions);
        const refreshToken = jsonwebtoken_1.default.sign({ userId, jti: tokenId }, this.config.jwt.refreshSecret, refreshOptions);
        return { accessToken, refreshToken, tokenId };
    }
    /**
     * Sign service-to-service request with AWS SigV4
     */
    async signServiceRequest(serviceName, options) {
        if (!this.config.aws || !this.sts) {
            throw new Error('AWS config not provided');
        }
        const credentials = await this.getServiceCredentials(serviceName);
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = crypto_1.default.randomUUID();
        // Parse URL
        const urlObj = new URL(options.url);
        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            'X-Pineapple-Timestamp': timestamp.toString(),
            'X-Pineapple-Nonce': nonce,
            ...options.headers
        };
        // AWS4 signing
        const signOptions = {
            service: 'pineapple',
            region: credentials.region,
            method: options.method.toUpperCase(),
            path: urlObj.pathname + urlObj.search,
            headers,
            body: options.body || '',
            host: urlObj.host
        };
        const signed = aws4_1.default.sign(signOptions, {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken
        });
        return {
            headers: Object.entries(signed.headers || {}).reduce((acc, [key, value]) => {
                if (typeof value === 'string') {
                    acc[key] = value;
                }
                return acc;
            }, {}),
            body: options.body
        };
    }
    /**
     * Get rotating AWS credentials for service
     */
    async getServiceCredentials(serviceName) {
        const cacheKey = `service-${serviceName}`;
        const cached = this.credentialsCache.get(cacheKey);
        // Return cached if valid for 5+ more minutes
        if (cached && cached.expiry.getTime() - Date.now() > 300000) {
            return cached.credentials;
        }
        if (!this.sts || !this.config.aws) {
            throw new Error('AWS not configured');
        }
        try {
            const roleArn = `${this.config.aws.roleArn}-${serviceName}`;
            const result = await this.sts.assumeRole({
                RoleArn: roleArn,
                RoleSessionName: `${serviceName}-${Date.now()}`,
                DurationSeconds: 3600 // 1 hour
            });
            if (!result.Credentials) {
                throw new Error('Failed to assume role');
            }
            const credentials = {
                accessKeyId: result.Credentials.AccessKeyId,
                secretAccessKey: result.Credentials.SecretAccessKey,
                sessionToken: result.Credentials.SessionToken,
                region: this.config.aws.region
            };
            // Cache credentials
            this.credentialsCache.set(cacheKey, {
                credentials,
                expiry: result.Credentials.Expiration
            });
            return credentials;
        }
        catch (error) {
            throw new Error(`Failed to get service credentials: ${error}`);
        }
    }
}
exports.PineappleAuthClient = PineappleAuthClient;
//# sourceMappingURL=auth.client.js.map