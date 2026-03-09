"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicAuthMiddleware = void 0;
exports.createPublicAuth = createPublicAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const redis_1 = require("redis");
const config_helpers_1 = require("../utils/config-helpers");
/**
 * JWT-only authentication middleware for PUBLIC-FACING services
 * (pineapple-api, pineapple-motor-service, pineapple-building-and-contents-service)
 */
class PublicAuthMiddleware {
    constructor(config) {
        /**
         * Validate JWT tokens from frontend applications
         * This is the ONLY authentication method supported
         */
        this.validateJWT = async (req, res, next) => {
            const requestId = Math.random().toString(36).substr(2, 9);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[PUBLIC-AUTH-${requestId}] 🔐 Starting JWT validation for ${req.method} ${req.path}`);
            }
            try {
                // Allow OPTIONS requests
                if (req.method === 'OPTIONS') {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[PUBLIC-AUTH-${requestId}] ✅ OPTIONS request - bypassing auth`);
                    }
                    return next();
                }
                const authHeader = req.headers.authorization;
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[PUBLIC-AUTH-${requestId}] 📝 Auth header present: ${authHeader ? 'YES' : 'NO'}`);
                }
                if (!authHeader?.startsWith('Bearer ')) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[PUBLIC-AUTH-${requestId}] ❌ Invalid auth header format: ${authHeader || 'missing'}`);
                    }
                    return res.status(403).json({
                        success: false,
                        error: { message: 'JWT Bearer token required' }
                    });
                }
                const token = authHeader.substring(7);
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[PUBLIC-AUTH-${requestId}] 🎫 Token extracted (length: ${token.length})`);
                    console.log(`[PUBLIC-AUTH-${requestId}] 🎫 Token preview: ${token.substring(0, 20)}...`);
                }
                try {
                    if (!this.config.jwt.secret) {
                        console.log(`[PUBLIC-AUTH-${requestId}] ❌ JWT secret not configured`);
                        return res.status(500).json({
                            error: 'Authentication configuration error'
                        });
                    }
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[PUBLIC-AUTH-${requestId}] 🔍 Verifying JWT with secret: ${this.config.jwt.secret.substring(0, 10)}...`);
                        console.log(`[PUBLIC-AUTH-${requestId}] 🔍 Expected issuer: ${this.config.jwt.issuer}`);
                    }
                    const decoded = jsonwebtoken_1.default.verify(token, this.config.jwt.secret, {
                        issuer: this.config.jwt.issuer
                    });
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[PUBLIC-AUTH-${requestId}] ✅ JWT decoded successfully`);
                        console.log(`[PUBLIC-AUTH-${requestId}] 👤 User: ${decoded.email} (ID: ${decoded.userId})`);
                        console.log(`[PUBLIC-AUTH-${requestId}] 🎭 Role: ${decoded.role || 'none'}`);
                        console.log(`[PUBLIC-AUTH-${requestId}] 🎯 Token ID: ${decoded.jti}`);
                        console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Expires: ${decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'never'}`);
                    }
                    // Check if token is revoked (if Redis is available)
                    if (this.redisClient) {
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`[PUBLIC-AUTH-${requestId}] 🔄 Checking token revocation in Redis`);
                        }
                        const isRevoked = await this.redisClient.get(`revoked:${decoded.jti}`);
                        if (isRevoked) {
                            if (process.env.NODE_ENV !== 'production') {
                                console.log(`[PUBLIC-AUTH-${requestId}] ❌ Token is revoked`);
                            }
                            return res.status(403).json({
                                success: false,
                                error: { message: 'Token has been revoked' }
                            });
                        }
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`[PUBLIC-AUTH-${requestId}] ✅ Token not revoked`);
                        }
                    }
                    else {
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`[PUBLIC-AUTH-${requestId}] ⚠️  Redis not configured - skipping revocation check`);
                        }
                    }
                    // Validate token hasn't expired (additional security)
                    const now = Math.floor(Date.now() / 1000);
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Current time: ${now}, Token exp: ${decoded.exp}`);
                    }
                    if (decoded.exp && decoded.exp < now) {
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`[PUBLIC-AUTH-${requestId}] ❌ Token expired (exp check)`);
                        }
                        return res.status(403).json({
                            success: false,
                            error: { message: 'Token expired' }
                        });
                    }
                    req.auth = {
                        userId: decoded.userId,
                        email: decoded.email,
                        role: decoded.role,
                        permissions: decoded.permissions || [],
                        tokenId: decoded.jti,
                        type: 'jwt'
                    };
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[PUBLIC-AUTH-${requestId}] ✅ Authentication successful - proceeding to next middleware`);
                    }
                    next();
                }
                catch (jwtError) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[PUBLIC-AUTH-${requestId}] ❌ JWT verification failed: ${jwtError.name}`);
                        console.log(`[PUBLIC-AUTH-${requestId}] ❌ JWT error details: ${jwtError.message}`);
                    }
                    if (jwtError.name === 'TokenExpiredError') {
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Token expired at: ${new Date(jwtError.expiredAt).toISOString()}`);
                        }
                        return res.status(403).json({
                            success: false,
                            error: { message: 'Token expired' }
                        });
                    }
                    return res.status(403).json({
                        success: false,
                        error: { message: 'Invalid JWT token' }
                    });
                }
            }
            catch (error) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[PUBLIC-AUTH-${requestId}] 💥 Unexpected error during JWT validation:`, error);
                }
                return res.status(500).json({
                    success: false,
                    error: { message: 'Authentication error' }
                });
            }
        };
        this.config = config;
        if (process.env.NODE_ENV !== 'production') {
            console.log('🍍 [PUBLIC-AUTH] Initializing public authentication middleware');
            console.log('🍍 [PUBLIC-AUTH] JWT Issuer:', config.jwt.issuer);
            console.log('🍍 [PUBLIC-AUTH] JWT Secret configured:', config.jwt.secret ? 'YES' : 'NO');
            console.log('🍍 [PUBLIC-AUTH] Redis configured:', config.redis ? 'YES' : 'NO');
        }
        if (config.redis) {
            try {
                const redisOptions = this.getRedisOptions(config.redis);
                if (process.env.NODE_ENV !== 'production') {
                    console.log('🍍 [PUBLIC-AUTH] Connecting to Redis:', this.maskCredentials(redisOptions.url || redisOptions.socket?.host || 'unknown'));
                }
                this.redisClient = (0, redis_1.createClient)(redisOptions);
                this.redisClient.connect()
                    .then(() => {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log('🍍 [PUBLIC-AUTH] ✅ Redis connected successfully');
                    }
                })
                    .catch((error) => {
                    console.error('🍍 [PUBLIC-AUTH] ❌ Redis connection failed:', error);
                });
            }
            catch (error) {
                console.error('🍍 [PUBLIC-AUTH] ❌ Redis configuration error:', error.message);
            }
        }
        if (process.env.NODE_ENV !== 'production') {
            console.log('🍍 [PUBLIC-AUTH] ✅ Public authentication middleware initialized');
        }
    }
    getRedisUrl(redisConfig) {
        // Handle legacy format
        if ('url' in redisConfig && typeof redisConfig.url === 'string') {
            return redisConfig.url;
        }
        // Handle new flexible format
        return (0, config_helpers_1.validateRedisConfig)(redisConfig);
    }
    getRedisOptions(redisConfig) {
        // Handle legacy format
        if ('url' in redisConfig && typeof redisConfig.url === 'string' && Object.keys(redisConfig).length === 1) {
            return { url: redisConfig.url };
        }
        const config = redisConfig;
        // If URL is provided with additional options, use URL but apply extra options
        if (config.url) {
            const options = { url: config.url };
            // Add TLS options if specified
            if (config.tls) {
                if (typeof config.tls === 'boolean' && config.tls) {
                    options.socket = { tls: true };
                }
                else if (typeof config.tls === 'object') {
                    options.socket = {
                        tls: true,
                        servername: config.tls.servername,
                        rejectUnauthorized: config.tls.rejectUnauthorized
                    };
                }
            }
            // Add timeout options
            if (config.connectTimeout)
                options.socket = { ...options.socket, connectTimeout: config.connectTimeout };
            if (config.commandTimeout)
                options.commandTimeout = config.commandTimeout;
            // Add retry options  
            if (config.retryDelayOnFailover)
                options.retryDelayOnFailover = config.retryDelayOnFailover;
            if (config.enableOfflineQueue !== undefined)
                options.enableOfflineQueue = config.enableOfflineQueue;
            if (config.maxRetriesPerRequest)
                options.maxRetriesPerRequest = config.maxRetriesPerRequest;
            if (config.retryConnect)
                options.retryConnect = config.retryConnect;
            return options;
        }
        // Build from individual components
        const options = {
            socket: {
                host: config.host || 'localhost',
                port: config.port || 6379
            }
        };
        if (config.password)
            options.password = config.password;
        if (config.username)
            options.username = config.username;
        if (config.db)
            options.database = config.db;
        if (config.family)
            options.socket.family = config.family;
        // TLS configuration
        if (config.tls) {
            if (typeof config.tls === 'boolean' && config.tls) {
                options.socket.tls = true;
            }
            else if (typeof config.tls === 'object') {
                options.socket.tls = true;
                if (config.tls.servername)
                    options.socket.servername = config.tls.servername;
                if (config.tls.rejectUnauthorized !== undefined)
                    options.socket.rejectUnauthorized = config.tls.rejectUnauthorized;
            }
        }
        // Timeout options
        if (config.connectTimeout)
            options.socket.connectTimeout = config.connectTimeout;
        if (config.commandTimeout)
            options.commandTimeout = config.commandTimeout;
        // Retry options
        if (config.retryDelayOnFailover)
            options.retryDelayOnFailover = config.retryDelayOnFailover;
        if (config.enableOfflineQueue !== undefined)
            options.enableOfflineQueue = config.enableOfflineQueue;
        if (config.maxRetriesPerRequest)
            options.maxRetriesPerRequest = config.maxRetriesPerRequest;
        if (config.retryConnect)
            options.retryConnect = config.retryConnect;
        return options;
    }
    maskCredentials(url) {
        // Mask credentials in logs for security
        return url.replace(/:\/\/[^@]*@/, '://***:***@');
    }
}
exports.PublicAuthMiddleware = PublicAuthMiddleware;
// Factory function
function createPublicAuth(config) {
    return new PublicAuthMiddleware(config);
}
//# sourceMappingURL=public-auth.middleware.js.map