"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigHelpers = exports.CONFIG_PRESETS = void 0;
exports.createAuthConfig = createAuthConfig;
exports.createPublicAuthConfig = createPublicAuthConfig;
exports.normalizeRedisConfig = normalizeRedisConfig;
exports.validateRedisConfig = validateRedisConfig;
exports.getRedisConfig = getRedisConfig;
/**
 * Creates a standardized auth configuration with flexible Redis options
 */
function createAuthConfig(options) {
    const env = options.environment || process.env.NODE_ENV || 'development';
    // Default configurations per environment
    const defaults = {
        development: {
            jwt: {
                secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
                issuer: process.env.JWT_ISSUER || 'pineapple-dev'
            },
            aws: {
                region: process.env.AWS_REGION || 'us-east-1',
                service: 'pineapple'
            }
        },
        staging: {
            jwt: {
                secret: process.env.JWT_SECRET,
                issuer: process.env.JWT_ISSUER || 'pineapple-staging'
            },
            aws: {
                region: process.env.AWS_REGION || 'us-east-1',
                service: 'pineapple'
            }
        },
        production: {
            jwt: {
                secret: process.env.JWT_SECRET,
                issuer: process.env.JWT_ISSUER || 'pineapple'
            },
            aws: {
                region: process.env.AWS_REGION || 'us-east-1',
                service: 'pineapple'
            }
        }
    };
    const config = {
        jwt: {
            secret: options.jwt?.secret || defaults[env].jwt.secret,
            issuer: options.jwt?.issuer || defaults[env].jwt.issuer
        },
        aws: {
            region: options.aws?.region || defaults[env].aws.region,
            service: options.aws?.service || defaults[env].aws.service
        }
    };
    // Handle Redis configuration
    if (options.redis) {
        config.redis = normalizeRedisConfig(options.redis);
    }
    else if (process.env.REDIS_URL) {
        config.redis = normalizeRedisConfig(process.env.REDIS_URL);
    }
    // Validate required fields
    if (!config.jwt.secret) {
        throw new Error('JWT secret is required. Set JWT_SECRET environment variable or provide jwt.secret in config.');
    }
    return config;
}
/**
 * Creates configuration specifically for PublicAuthMiddleware
 */
function createPublicAuthConfig(options) {
    const fullConfig = createAuthConfig(options);
    return {
        jwt: fullConfig.jwt,
        redis: fullConfig.redis
    };
}
/**
 * Normalizes Redis configuration from various input formats
 */
function normalizeRedisConfig(redis) {
    if (typeof redis === 'string') {
        return { url: redis };
    }
    return redis;
}
/**
 * Validates and builds Redis connection URL from config
 */
function validateRedisConfig(config) {
    if (config.url) {
        // Validate URL format
        if (!config.url.startsWith('redis://') && !config.url.startsWith('rediss://')) {
            throw new Error('Redis URL must start with redis:// or rediss://');
        }
        return config.url;
    }
    // Build URL from individual components
    const { host = 'localhost', port = 6379, username, password, db = 0 } = config;
    let url = 'redis://';
    if (username || password) {
        if (username && password) {
            url += `${username}:${password}@`;
        }
        else if (password) {
            url += `:${password}@`;
        }
        else if (username) {
            url += `${username}@`;
        }
    }
    url += `${host}:${port}`;
    if (db > 0) {
        url += `/${db}`;
    }
    return url;
}
/**
 * Gets Redis configuration from various sources with fallbacks
 */
function getRedisConfig() {
    // Priority order:
    // 1. REDIS_URL environment variable
    // 2. Individual Redis environment variables
    // 3. Default localhost (only in development)
    if (process.env.REDIS_URL) {
        return normalizeRedisConfig(process.env.REDIS_URL);
    }
    if (process.env.REDIS_HOST || process.env.REDIS_PORT) {
        return {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD,
            username: process.env.REDIS_USERNAME,
            db: parseInt(process.env.REDIS_DB || '0', 10)
        };
    }
    // Only default to localhost in development
    if (process.env.NODE_ENV === 'development') {
        return { url: 'redis://localhost:6379' };
    }
    return null;
}
/**
 * Environment-specific configuration presets
 */
exports.CONFIG_PRESETS = {
    development: () => createAuthConfig({
        environment: 'development',
        redis: getRedisConfig() || undefined
    }),
    staging: () => createAuthConfig({
        environment: 'staging',
        redis: getRedisConfig() || undefined
    }),
    production: () => createAuthConfig({
        environment: 'production',
        redis: getRedisConfig() || undefined
    }),
    testing: () => createAuthConfig({
        jwt: {
            secret: 'test-secret',
            issuer: 'test-issuer'
        },
        aws: {
            region: 'us-east-1',
            service: 'pineapple'
        }
        // No Redis in testing by default
    })
};
/**
 * Quick configuration helpers for common scenarios
 */
exports.ConfigHelpers = {
    /**
     * Simple configuration with just Redis URL
     */
    withRedisUrl: (redisUrl, jwtSecret, jwtIssuer) => createAuthConfig({
        jwt: {
            secret: jwtSecret,
            issuer: jwtIssuer
        },
        redis: redisUrl
    }),
    /**
     * Configuration for AWS deployment with ElastiCache
     */
    forAWS: (redisClusterEndpoint, region = 'us-east-1') => createAuthConfig({
        aws: { region, service: 'pineapple' },
        redis: { url: `redis://${redisClusterEndpoint}:6379` }
    }),
    /**
     * Configuration for Docker Compose development
     */
    forDocker: () => createAuthConfig({
        redis: { host: 'redis', port: 6379 } // Assumes redis service name in docker-compose
    }),
    /**
     * Configuration for Heroku with Redis addon
     */
    forHeroku: () => createAuthConfig({
        redis: process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDISTOGO_URL
    }),
    /**
     * Configuration without Redis (degraded mode)
     */
    withoutRedis: () => createAuthConfig({
    // No redis configuration - will work but without token revocation
    })
};
//# sourceMappingURL=config-helpers.js.map