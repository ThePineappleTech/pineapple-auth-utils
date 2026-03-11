interface JWTTokens {
    accessToken: string;
    refreshToken: string;
    tokenId: string;
}
interface SignedRequestOptions {
    method: string;
    url: string;
    body?: string;
    headers?: Record<string, string>;
}
export declare class PineappleAuthClient {
    private config;
    private sts?;
    private credentialsCache;
    constructor(config: {
        jwt?: {
            accessSecret: string;
            refreshSecret: string;
            issuer: string;
            accessExpiresIn?: string;
            refreshExpiresIn?: string;
        };
        aws?: {
            region: string;
            roleArn: string;
        };
    });
    /**
     * Generate JWT tokens for user authentication
     */
    generateUserTokens(userId: string, email: string, role?: string, permissions?: string[]): JWTTokens;
    /**
     * Sign service-to-service request with AWS SigV4
     */
    signServiceRequest(serviceName: string, options: SignedRequestOptions): Promise<{
        headers: Record<string, string>;
        body?: string;
    }>;
    /**
     * Get rotating AWS credentials for service
     */
    private getServiceCredentials;
}
export {};
//# sourceMappingURL=auth.client.d.ts.map