/**
 * Client for making authenticated calls from PUBLIC services to INTERNAL services
 * Uses simple signature-based authentication with rotating secrets
 */
export declare class InternalServiceClient {
    private serviceName;
    private apiKey;
    private apiSecret;
    constructor(serviceName: string);
    /**
     * Make authenticated call to internal service via pineapple-api
     */
    callInternalService(endpoint: string, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', data?: any): Promise<any>;
    /**
     * Call auth service for user operations
     */
    callAuthService(endpoint: string, data?: any): Promise<any>;
    /**
     * Example: Validate user session
     */
    validateUserSession(userId: string): Promise<any>;
    /**
     * Example: Get user profile
     */
    getUserProfile(userId: string): Promise<any>;
}
//# sourceMappingURL=internal-service.client.d.ts.map