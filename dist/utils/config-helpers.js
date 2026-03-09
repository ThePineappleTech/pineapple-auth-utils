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
    const envDefaults = defaults[env] || defaults.development;
    const config = {
        jwt: {
            secret: options.jwt?.secret || envDefaults.jwt.secret,
            issuer: options.jwt?.issuer || envDefaults.jwt.issuer
        },
        aws: {
            region: options.aws?.region || envDefaults.aws.region,
            service: options.aws?.service || envDefaults.aws.service
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
     * Configuration for AWS ElastiCache with advanced options
     */
    forElastiCache: (endpoint, options) => {
        const port = options?.port || (options?.tls ? 6380 : 6379);
        const protocol = options?.tls ? 'rediss' : 'redis';
        let url = `${protocol}://`;
        if (options?.authToken) {
            url += `:${options.authToken}@`;
        }
        url += `${endpoint}:${port}`;
        return createAuthConfig({
            aws: { region: options?.region || 'us-east-1', service: 'pineapple' },
            redis: {
                url,
                tls: options?.tls ? {
                    servername: endpoint,
                    rejectUnauthorized: true
                } : false,
                connectTimeout: options?.connectTimeout || 20000,
                commandTimeout: 5000,
                retryDelayOnFailover: 100,
                enableOfflineQueue: false,
                maxRetriesPerRequest: 3,
                retryConnect: 3
            }
        });
    },
    /**
     * Configuration for AWS ElastiCache Serverless
     */
    forElastiCacheServerless: (endpoint, authToken, region = 'us-east-1') => {
        return createAuthConfig({
            aws: { region, service: 'pineapple' },
            redis: {
                url: `rediss://:${authToken}@${endpoint}:6380`,
                tls: {
                    servername: endpoint,
                    rejectUnauthorized: true
                },
                connectTimeout: 20000,
                commandTimeout: 5000,
                retryDelayOnFailover: 100,
                enableOfflineQueue: false,
                maxRetriesPerRequest: 3,
                retryConnect: 3
            }
        });
    },
    /**
     * Configuration for Valkey (Redis alternative)
     */
    forValkey: (endpoint, port = 6379, authToken) => createAuthConfig({
        redis: {
            host: endpoint,
            port,
            password: authToken,
            protocol: 'valkey',
            connectTimeout: 10000,
            commandTimeout: 5000,
            maxRetriesPerRequest: 3
        }
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
     * Configuration for AWS ElastiCache Cluster Mode
     */
    forElastiCacheCluster: (clusterEndpoint, options) => {
        const port = options?.port || (options?.tls ? 6380 : 6379);
        const protocol = options?.tls ? 'rediss' : 'redis';
        // ElastiCache cluster configuration endpoint format
        const rootNodes = options?.nodes || [{ host: clusterEndpoint, port }];
        return createAuthConfig({
            aws: { region: options?.region || 'us-east-1', service: 'pineapple' },
            redis: {
                cluster: {
                    rootNodes,
                    useReplicas: true,
                    enableAutoPipelining: true,
                    maxCommandRedirections: 16,
                    retryDelayOnClusterDown: 300,
                    retryDelayOnFailover: 100,
                    maxRetriesPerRequest: 3,
                    scaleReads: 'all'
                },
                password: options?.authToken,
                tls: options?.tls ? {
                    servername: clusterEndpoint,
                    rejectUnauthorized: true
                } : false,
                connectTimeout: options?.connectTimeout || 20000,
                commandTimeout: 5000
            }
        });
    },
    /**
     * Configuration for AWS ElastiCache Replication Group with multiple nodes
     */
    forElastiCacheReplicationGroup: (primaryEndpoint, readerEndpoint, options) => {
        const port = options?.port || (options?.tls ? 6380 : 6379);
        const rootNodes = [
            { host: primaryEndpoint, port }
        ];
        // Add reader endpoint if provided
        if (readerEndpoint) {
            rootNodes.push({ host: readerEndpoint, port });
        }
        return createAuthConfig({
            aws: { region: options?.region || 'us-east-1', service: 'pineapple' },
            redis: {
                cluster: {
                    rootNodes,
                    useReplicas: true,
                    enableAutoPipelining: false, // Disable for replication groups
                    maxCommandRedirections: 6,
                    retryDelayOnClusterDown: 100,
                    retryDelayOnFailover: 100,
                    maxRetriesPerRequest: 3,
                    scaleReads: 'slave' // Prefer replicas for read operations
                },
                password: options?.authToken,
                tls: options?.tls ? {
                    servername: primaryEndpoint,
                    rejectUnauthorized: true
                } : false,
                connectTimeout: options?.connectTimeout || 20000,
                commandTimeout: 5000
            }
        });
    },
    /**
     * Auto-detect ElastiCache configuration type from endpoint
     */
    forElastiCacheAuto: (endpoint, options) => {
        if (endpoint.includes('clustercfg')) {
            // This is a cluster configuration endpoint
            console.log('🍍 [CONFIG] Detected ElastiCache Cluster Mode endpoint');
            return exports.ConfigHelpers.forElastiCacheCluster(endpoint, options);
        }
        else if (endpoint.includes('serverless')) {
            // This is a serverless endpoint
            console.log('🍍 [CONFIG] Detected ElastiCache Serverless endpoint');
            return exports.ConfigHelpers.forElastiCacheServerless(endpoint, options?.authToken || '', options?.region);
        }
        else {
            // This is likely a standard replication group or single node
            console.log('🍍 [CONFIG] Detected standard ElastiCache endpoint');
            return exports.ConfigHelpers.forElastiCache(endpoint, options);
        }
    },
    /**
     * Configuration without Redis (degraded mode)
     */
    withoutRedis: () => createAuthConfig({
    // No redis configuration - will work but without token revocation
    })
};
//# sourceMappingURL=config-helpers.js.map