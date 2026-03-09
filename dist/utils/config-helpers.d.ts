import type { AuthConfig, RedisConfig } from '../index';
/**
 * Creates a standardized auth configuration with flexible Redis options
 */
export declare function createAuthConfig(options: {
    jwt?: {
        secret?: string;
        issuer?: string;
    };
    aws?: {
        region?: string;
        service?: string;
    };
    redis?: RedisConfig | string;
    environment?: 'development' | 'staging' | 'production';
}): AuthConfig;
/**
 * Creates configuration specifically for PublicAuthMiddleware
 */
export declare function createPublicAuthConfig(options: {
    jwt?: {
        secret?: string;
        issuer?: string;
    };
    redis?: RedisConfig | string;
    environment?: 'development' | 'staging' | 'production';
}): Pick<AuthConfig, 'jwt' | 'redis'>;
/**
 * Normalizes Redis configuration from various input formats
 */
export declare function normalizeRedisConfig(redis: RedisConfig | string): RedisConfig;
/**
 * Validates and builds Redis connection URL from config
 */
export declare function validateRedisConfig(config: RedisConfig): string;
/**
 * Gets Redis configuration from various sources with fallbacks
 */
export declare function getRedisConfig(): RedisConfig | null;
/**
 * Environment-specific configuration presets
 */
export declare const CONFIG_PRESETS: {
    development: () => AuthConfig;
    staging: () => AuthConfig;
    production: () => AuthConfig;
    testing: () => AuthConfig;
};
/**
 * Quick configuration helpers for common scenarios
 */
export declare const ConfigHelpers: {
    /**
     * Simple configuration with just Redis URL
     */
    withRedisUrl: (redisUrl: string, jwtSecret?: string, jwtIssuer?: string) => AuthConfig;
    /**
     * Configuration for AWS deployment with ElastiCache
     */
    forAWS: (redisClusterEndpoint: string, region?: string) => AuthConfig;
    /**
     * Configuration for AWS ElastiCache with advanced options
     */
    forElastiCache: (endpoint: string, options?: {
        port?: number;
        tls?: boolean;
        authToken?: string;
        region?: string;
        connectTimeout?: number;
    }) => AuthConfig;
    /**
     * Configuration for AWS ElastiCache Serverless
     */
    forElastiCacheServerless: (endpoint: string, authToken: string, region?: string) => AuthConfig;
    /**
     * Configuration for Valkey (Redis alternative)
     */
    forValkey: (endpoint: string, port?: number, authToken?: string) => AuthConfig;
    /**
     * Configuration for Docker Compose development
     */
    forDocker: () => AuthConfig;
    /**
     * Configuration for Heroku with Redis addon
     */
    forHeroku: () => AuthConfig;
    /**
     * Configuration without Redis (degraded mode)
     */
    withoutRedis: () => AuthConfig;
};
//# sourceMappingURL=config-helpers.d.ts.map