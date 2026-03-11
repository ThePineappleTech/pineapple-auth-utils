import type { RedisConfig } from '../index';
export interface RedisConnectionManager {
    get(key: string): Promise<string | null>;
    setEx(key: string, seconds: number, value: string): Promise<void>;
    del(key: string): Promise<number>;
    isConnected(): boolean;
    disconnect(): Promise<void>;
    connect(): Promise<void>;
}
export declare class ElastiCacheConnectionManager implements RedisConnectionManager {
    private client;
    private config;
    private isCluster;
    private connectionState;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private maxReconnectDelay;
    private reconnectTimeout?;
    private lastConnectionCheck;
    private connectionCheckInterval;
    private retryOptions;
    constructor(config: RedisConfig);
    private createClient;
    private buildClientOptions;
    private buildClusterOptions;
    private setupEventHandlers;
    private isElastiCacheConnectionError;
    private scheduleReconnect;
    private attemptReconnection;
    ensureConnection(): Promise<void>;
    private executeWithRetry;
    get(key: string): Promise<string | null>;
    setEx(key: string, seconds: number, value: string): Promise<void>;
    del(key: string): Promise<number>;
    isConnected(): boolean;
    disconnect(): Promise<void>;
    connect(): Promise<void>;
}
//# sourceMappingURL=redis-connection-manager.d.ts.map