export { PineappleAuth, createAuthMiddleware } from './middleware/auth.middleware';
export { PineappleAuthClient } from './client/auth.client';
export { createPublicAuth } from './middleware/public-auth.middleware';
export { InternalServiceClient } from './client/internal-service.client';
export { createAuthConfig, createPublicAuthConfig, validateRedisConfig, ConfigHelpers, CONFIG_PRESETS } from './utils/config-helpers';
export interface RedisConfig {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    username?: string;
    db?: number;
    family?: 4 | 6;
    keepAlive?: number;
    lazyConnect?: boolean;
    tls?: boolean | {
        servername?: string;
        rejectUnauthorized?: boolean;
    };
    connectTimeout?: number;
    commandTimeout?: number;
    retryDelayOnFailover?: number;
    enableOfflineQueue?: boolean;
    maxRetriesPerRequest?: number;
    retryConnect?: number;
    protocol?: 'redis' | 'valkey';
    cluster?: {
        enableAutoPipelining?: boolean;
        rootNodes?: Array<{
            host: string;
            port: number;
        }>;
        defaults?: {
            socket?: {
                host?: string;
                port?: number;
                family?: 4 | 6;
                keepAlive?: number;
                noDelay?: boolean;
            };
            password?: string;
            username?: string;
            database?: number;
        };
        useReplicas?: boolean;
        maxCommandRedirections?: number;
        retryDelayOnClusterDown?: number;
        retryDelayOnFailover?: number;
        maxRetriesPerRequest?: number;
        scaleReads?: 'master' | 'slave' | 'all';
    };
}
export interface AuthConfig {
    jwt: {
        secret?: string;
        issuer?: string;
    };
    aws?: {
        region?: string;
        service?: string;
    };
    redis?: RedisConfig;
}
export interface AuthContext {
    userId: string;
    email: string;
    role?: string;
    permissions?: string[];
    tokenId: string;
    type: 'jwt' | 'service';
}
//# sourceMappingURL=index.d.ts.map