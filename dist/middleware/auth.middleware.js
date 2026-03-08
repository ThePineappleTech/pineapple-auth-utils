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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PineappleAuth = void 0;
exports.createAuthMiddleware = createAuthMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Redis = __importStar(require("redis"));
class PineappleAuth {
    constructor(config) {
        this.config = config;
        /**
         * Middleware for JWT authentication (frontend -> service)
         */
        this.validateJWT = async (req, res, next) => {
            const requestId = Math.random().toString(36).substr(2, 9);
            console.log(`[JWT-AUTH-${requestId}] 🔐 Starting JWT validation for ${req.method} ${req.path}`);
            try {
                // Allow OPTIONS requests
                if (req.method === 'OPTIONS') {
                    console.log(`[JWT-AUTH-${requestId}] ✅ OPTIONS request - bypassing auth`);
                    return next();
                }
                const authHeader = req.headers.authorization;
                console.log(`[JWT-AUTH-${requestId}] 📝 Auth header present: ${authHeader ? 'YES' : 'NO'}`);
                if (!authHeader?.startsWith('Bearer ')) {
                    console.log(`[JWT-AUTH-${requestId}] ❌ Invalid auth header format: ${authHeader || 'missing'}`);
                    return res.status(403).json({
                        success: false,
                        error: { message: 'Missing or invalid Authorization header' }
                    });
                }
                const token = authHeader.substring(7);
                console.log(`[JWT-AUTH-${requestId}] 🎫 Token extracted (length: ${token.length})`);
                console.log(`[JWT-AUTH-${requestId}] 🎫 Token preview: ${token.substring(0, 20)}...`);
                try {
                    console.log(`[JWT-AUTH-${requestId}] 🔍 Verifying JWT with secret: ${this.config.jwt.secret.substring(0, 10)}...`);
                    console.log(`[JWT-AUTH-${requestId}] 🔍 Expected issuer: ${this.config.jwt.issuer}`);
                    const decoded = jsonwebtoken_1.default.verify(token, this.config.jwt.secret, {
                        issuer: this.config.jwt.issuer,
                        audience: 'pineapple-services'
                    });
                    console.log(`[JWT-AUTH-${requestId}] ✅ JWT decoded successfully`);
                    console.log(`[JWT-AUTH-${requestId}] 👤 User: ${decoded.email} (ID: ${decoded.userId})`);
                    console.log(`[JWT-AUTH-${requestId}] 🎭 Role: ${decoded.role || 'none'}`);
                    console.log(`[JWT-AUTH-${requestId}] 🎯 Token ID: ${decoded.jti}`);
                    console.log(`[JWT-AUTH-${requestId}] ⏰ Expires: ${decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'never'}`);
                    // Check if token is revoked (if Redis is available)
                    if (this.redisClient) {
                        console.log(`[JWT-AUTH-${requestId}] 🔄 Checking token revocation in Redis`);
                        const isRevoked = await this.redisClient.get(`revoked:${decoded.jti}`);
                        if (isRevoked) {
                            console.log(`[JWT-AUTH-${requestId}] ❌ Token is revoked`);
                            return res.status(403).json({
                                success: false,
                                error: { message: 'Token has been revoked' }
                            });
                        }
                        console.log(`[JWT-AUTH-${requestId}] ✅ Token not revoked`);
                    }
                    else {
                        console.log(`[JWT-AUTH-${requestId}] ⚠️  Redis not configured - skipping revocation check`);
                    }
                    req.auth = {
                        userId: decoded.userId,
                        email: decoded.email,
                        role: decoded.role,
                        permissions: decoded.permissions || [],
                        tokenId: decoded.jti,
                        type: 'jwt'
                    };
                    console.log(`[JWT-AUTH-${requestId}] ✅ Authentication successful - proceeding to next middleware`);
                    next();
                }
                catch (jwtError) {
                    console.log(`[JWT-AUTH-${requestId}] ❌ JWT verification failed: ${jwtError.name}`);
                    console.log(`[JWT-AUTH-${requestId}] ❌ JWT error details: ${jwtError.message}`);
                    if (jwtError.name === 'TokenExpiredError') {
                        console.log(`[JWT-AUTH-${requestId}] ⏰ Token expired at: ${new Date(jwtError.expiredAt).toISOString()}`);
                        return res.status(403).json({
                            success: false,
                            error: { message: 'Token expired' }
                        });
                    }
                    return res.status(403).json({
                        success: false,
                        error: { message: 'Invalid token' }
                    });
                }
            }
            catch (error) {
                console.log(`[JWT-AUTH-${requestId}] 💥 Unexpected error during JWT validation:`, error);
                return res.status(500).json({
                    success: false,
                    error: { message: 'Authentication error' }
                });
            }
        };
        /**
         * Middleware for AWS SigV4 authentication (service -> service)
         */
        this.validateServiceAuth = async (req, res, next) => {
            const requestId = Math.random().toString(36).substr(2, 9);
            console.log(`[SERVICE-AUTH-${requestId}] 🔧 Starting service auth validation for ${req.method} ${req.path}`);
            try {
                // Allow OPTIONS requests
                if (req.method === 'OPTIONS') {
                    console.log(`[SERVICE-AUTH-${requestId}] ✅ OPTIONS request - bypassing auth`);
                    return next();
                }
                const authHeader = req.headers.authorization;
                console.log(`[SERVICE-AUTH-${requestId}] 📝 Auth header: ${authHeader ? 'Present (AWS4)' : 'Missing'}`);
                if (!authHeader?.includes('AWS4-HMAC-SHA256')) {
                    console.log(`[SERVICE-AUTH-${requestId}] ❌ Invalid service auth format: ${authHeader || 'missing'}`);
                    return res.status(403).json({
                        success: false,
                        error: { message: 'Missing or invalid service authorization' }
                    });
                }
                const timestamp = parseInt(req.headers['x-pineapple-timestamp'] || '0');
                const nonce = req.headers['x-pineapple-nonce'];
                console.log(`[SERVICE-AUTH-${requestId}] ⏰ Timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
                console.log(`[SERVICE-AUTH-${requestId}] 🎲 Nonce: ${nonce || 'missing'}`);
                // Validate timestamp (5 minute window)
                const now = Math.floor(Date.now() / 1000);
                const timeDiff = Math.abs(now - timestamp);
                console.log(`[SERVICE-AUTH-${requestId}] ⏰ Time difference: ${timeDiff}s (max 300s)`);
                if (timeDiff > 300) {
                    console.log(`[SERVICE-AUTH-${requestId}] ❌ Request timestamp outside valid window`);
                    return res.status(403).json({
                        success: false,
                        error: { message: 'Request timestamp outside valid window' }
                    });
                }
                // Validate nonce
                if (!nonce) {
                    console.log(`[SERVICE-AUTH-${requestId}] ❌ Missing request nonce`);
                    return res.status(403).json({
                        success: false,
                        error: { message: 'Missing request nonce' }
                    });
                }
                // Check nonce hasn't been used (if Redis available)
                if (this.redisClient) {
                    console.log(`[SERVICE-AUTH-${requestId}] 🔄 Checking nonce replay in Redis`);
                    const nonceUsed = await this.redisClient.get(`nonce:${nonce}`);
                    if (nonceUsed) {
                        console.log(`[SERVICE-AUTH-${requestId}] ❌ Nonce already used - replay attack detected`);
                        return res.status(403).json({
                            success: false,
                            error: { message: 'Request nonce already used' }
                        });
                    }
                    // Store nonce for 5 minutes
                    await this.redisClient.setEx(`nonce:${nonce}`, 300, 'used');
                    console.log(`[SERVICE-AUTH-${requestId}] ✅ Nonce stored for replay protection`);
                }
                else {
                    console.log(`[SERVICE-AUTH-${requestId}] ⚠️  Redis not configured - skipping nonce replay check`);
                }
                // Extract service name from signature
                const serviceName = this.extractServiceFromAuth(authHeader);
                console.log(`[SERVICE-AUTH-${requestId}] 🏷️  Extracted service name: ${serviceName || 'none'}`);
                if (!serviceName) {
                    console.log(`[SERVICE-AUTH-${requestId}] ❌ Could not extract service from signature`);
                    return res.status(403).json({
                        success: false,
                        error: { message: 'Invalid service signature' }
                    });
                }
                req.auth = {
                    userId: serviceName,
                    email: `${serviceName}@service.pineapple.internal`,
                    role: 'service',
                    permissions: ['service:*'],
                    tokenId: nonce,
                    type: 'service'
                };
                console.log(`[SERVICE-AUTH-${requestId}] ✅ Service authentication successful - proceeding to next middleware`);
                next();
            }
            catch (error) {
                console.log(`[SERVICE-AUTH-${requestId}] 💥 Unexpected error during service auth:`, error);
                return res.status(500).json({
                    success: false,
                    error: { message: 'Service authentication error' }
                });
            }
        };
        /**
         * Combined middleware that accepts both JWT and Service authentication
         */
        this.validateAnyAuth = async (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (authHeader?.startsWith('Bearer ')) {
                return this.validateJWT(req, res, next);
            }
            else if (authHeader?.includes('AWS4-HMAC-SHA256')) {
                return this.validateServiceAuth(req, res, next);
            }
            else {
                return res.status(403).json({
                    success: false,
                    error: { message: 'No valid authentication provided' }
                });
            }
        };
        console.log('🍍 [PINEAPPLE-AUTH] Initializing authentication middleware');
        console.log('🍍 [PINEAPPLE-AUTH] JWT Issuer:', config.jwt.issuer);
        console.log('🍍 [PINEAPPLE-AUTH] JWT Secret configured:', config.jwt.secret ? 'YES' : 'NO');
        console.log('🍍 [PINEAPPLE-AUTH] Redis configured:', config.redis ? 'YES' : 'NO');
        if (config.redis) {
            console.log('🍍 [PINEAPPLE-AUTH] Connecting to Redis:', config.redis.url);
            this.redisClient = Redis.createClient({ url: config.redis.url });
            this.redisClient.connect()
                .then(() => console.log('🍍 [PINEAPPLE-AUTH] ✅ Redis connected successfully'))
                .catch((error) => {
                console.error('🍍 [PINEAPPLE-AUTH] ❌ Redis connection failed:', error);
            });
        }
        console.log('🍍 [PINEAPPLE-AUTH] ✅ Authentication middleware initialized');
    }
    /**
     * Revoke JWT token (requires Redis)
     */
    async revokeToken(tokenId, expirySeconds = 86400) {
        if (!this.redisClient) {
            throw new Error('Redis not configured for token revocation');
        }
        await this.redisClient.setEx(`revoked:${tokenId}`, expirySeconds, 'true');
    }
    extractServiceFromAuth(authHeader) {
        // Extract service name from AWS4 signature format
        // This is a simplified version - you'd enhance this based on your needs
        const credentialMatch = authHeader.match(/Credential=([^\/]+)\//);
        return credentialMatch ? credentialMatch[1] : null;
    }
}
exports.PineappleAuth = PineappleAuth;
// Export factory function for easy setup
function createAuthMiddleware(config) {
    return new PineappleAuth(config);
}
//# sourceMappingURL=auth.middleware.js.map