import { Request, Response, NextFunction } from 'express';
import type { AuthConfig } from '../index';
interface LegacyAuthConfig {
    jwt: {
        secret: string;
        issuer: string;
    };
    aws: {
        region: string;
        service: string;
    };
    redis?: {
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
export declare class PineappleAuth {
    private redisClient?;
    private config;
    constructor(config: AuthConfig | LegacyAuthConfig);
    /**
     * Middleware for JWT authentication (frontend -> service)
     */
    validateJWT: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    /**
     * Middleware for AWS SigV4 authentication (service -> service)
     */
    validateServiceAuth: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    /**
     * Combined middleware that accepts both JWT and Service authentication
     */
    validateAnyAuth: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    /**
     * Revoke JWT token (requires Redis)
     */
    revokeToken(tokenId: string, expirySeconds?: number): Promise<void>;
    private extractServiceFromAuth;
    private getRedisUrl;
    private getRedisOptions;
    private maskCredentials;
}
export declare function createAuthMiddleware(config: AuthConfig | LegacyAuthConfig): PineappleAuth;
export {};
//# sourceMappingURL=auth.middleware.d.ts.map