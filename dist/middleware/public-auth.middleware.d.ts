import { Request, Response, NextFunction } from 'express';
import type { RedisConfig } from '../index';
interface PublicAuthConfig {
    jwt: {
        secret: string;
        issuer: string;
    };
    redis?: RedisConfig | {
        url: string;
    };
}
interface AuthContext {
    userId: string;
    email: string;
    role?: string;
    permissions?: string[];
    tokenId: string;
    type: 'jwt' | 'service';
}
declare global {
    namespace Express {
        interface Request {
            auth?: AuthContext;
        }
    }
}
/**
 * JWT-only authentication middleware for PUBLIC-FACING services
 * (pineapple-api, pineapple-motor-service, pineapple-building-and-contents-service)
 */
export declare class PublicAuthMiddleware {
    private redisClient?;
    private redisManager?;
    private config;
    constructor(config: PublicAuthConfig);
    /**
     * Validate JWT tokens from frontend applications
     * Supports both HttpOnly cookies and Authorization header
     */
    validateJWT: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    private getRedisUrl;
    private getRedisOptions;
    private getRedisClusterOptions;
    private maskCredentials;
}
export declare function createPublicAuth(config: PublicAuthConfig): PublicAuthMiddleware;
export {};
//# sourceMappingURL=public-auth.middleware.d.ts.map