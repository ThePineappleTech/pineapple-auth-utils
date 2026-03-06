import { Request, Response, NextFunction } from 'express';
interface AuthConfig {
    jwt: {
        secret: string;
        issuer: string;
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
/**
 * JWT-only authentication middleware for PUBLIC-FACING services
 * (pineapple-api, pineapple-motor-service, pineapple-building-and-contents-service)
 */
export declare class PublicAuthMiddleware {
    private config;
    private redisClient?;
    constructor(config: AuthConfig);
    /**
     * Validate JWT tokens from frontend applications
     * This is the ONLY authentication method supported
     */
    validateJWT: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
}
export declare function createPublicAuth(config: AuthConfig): PublicAuthMiddleware;
export {};
//# sourceMappingURL=public-auth.middleware.d.ts.map