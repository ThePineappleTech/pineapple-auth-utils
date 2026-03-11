"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElastiCacheConnectionManager = void 0;
const redis_1 = require("redis");
class ElastiCacheConnectionManager {
    constructor(config) {
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.lastConnectionCheck = 0;
        this.connectionCheckInterval = 30000; // 30 seconds
        this.retryOptions = {
            maxRetries: 3,
            baseDelay: 100,
            maxDelay: 5000,
            backoffMultiplier: 2
        };
        this.config = config;
        this.isCluster = !!config.cluster;
        this.client = this.createClient();
        this.setupEventHandlers();
    }
    createClient() {
        if (this.isCluster) {
            const clusterOptions = this.buildClusterOptions();
            console.log('🍍 [REDIS-MANAGER] Creating Redis Cluster client');
            return (0, redis_1.createCluster)(clusterOptions);
        }
        else {
            const clientOptions = this.buildClientOptions();
            console.log('🍍 [REDIS-MANAGER] Creating Redis client');
            return (0, redis_1.createClient)(clientOptions);
        }
    }
    buildClientOptions() {
        const options = {};
        if (this.config.url) {
            options.url = this.config.url;
        }
        else {
            options.socket = {
                host: this.config.host || 'localhost',
                port: this.config.port || 6379
            };
        }
        if (this.config.password)
            options.password = this.config.password;
        if (this.config.username)
            options.username = this.config.username;
        if (this.config.db)
            options.database = this.config.db;
        // Connection resilience settings
        options.socket = {
            ...options.socket,
            connectTimeout: this.config.connectTimeout || 20000,
            keepAlive: true,
            noDelay: true
        };
        if (this.config.commandTimeout)
            options.commandTimeout = this.config.commandTimeout || 5000;
        // TLS configuration for ElastiCache
        if (this.config.tls) {
            if (typeof this.config.tls === 'boolean' && this.config.tls) {
                options.socket.tls = true;
            }
            else if (typeof this.config.tls === 'object') {
                options.socket.tls = true;
                if (this.config.tls.servername)
                    options.socket.servername = this.config.tls.servername;
                if (this.config.tls.rejectUnauthorized !== undefined) {
                    options.socket.rejectUnauthorized = this.config.tls.rejectUnauthorized;
                }
            }
        }
        return options;
    }
    buildClusterOptions() {
        const clusterConfig = this.config.cluster;
        const options = {
            rootNodes: clusterConfig.rootNodes || [],
            defaults: {
                socket: {
                    connectTimeout: this.config.connectTimeout || 20000,
                    keepAlive: true,
                    noDelay: true
                },
                commandTimeout: this.config.commandTimeout || 5000
            }
        };
        // Cluster-specific settings
        if (clusterConfig.enableAutoPipelining !== undefined) {
            options.enableAutoPipelining = clusterConfig.enableAutoPipelining;
        }
        if (clusterConfig.useReplicas !== undefined) {
            options.useReplicas = clusterConfig.useReplicas;
        }
        if (clusterConfig.maxCommandRedirections) {
            options.maxCommandRedirections = clusterConfig.maxCommandRedirections;
        }
        // Apply auth and TLS to defaults
        if (this.config.password)
            options.defaults.password = this.config.password;
        if (this.config.username)
            options.defaults.username = this.config.username;
        if (this.config.tls) {
            if (!options.defaults.socket)
                options.defaults.socket = {};
            if (typeof this.config.tls === 'boolean' && this.config.tls) {
                options.defaults.socket.tls = true;
            }
            else if (typeof this.config.tls === 'object') {
                options.defaults.socket.tls = true;
                if (this.config.tls.servername)
                    options.defaults.socket.servername = this.config.tls.servername;
                if (this.config.tls.rejectUnauthorized !== undefined) {
                    options.defaults.socket.rejectUnauthorized = this.config.tls.rejectUnauthorized;
                }
            }
        }
        return options;
    }
    setupEventHandlers() {
        this.client.on('connect', () => {
            console.log('🍍 [REDIS-MANAGER] ✅ Connected to Redis/ElastiCache');
            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000; // Reset delay
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = undefined;
            }
        });
        this.client.on('ready', () => {
            console.log('🍍 [REDIS-MANAGER] ✅ Redis/ElastiCache ready for commands');
            this.connectionState = 'connected';
        });
        this.client.on('error', (error) => {
            console.error('🍍 [REDIS-MANAGER] ❌ Redis/ElastiCache error:', error.message);
            this.connectionState = 'error';
            // Handle specific ElastiCache connection errors
            if (this.isElastiCacheConnectionError(error)) {
                console.log('🍍 [REDIS-MANAGER] 🔄 ElastiCache connection issue detected, attempting reconnection');
                this.scheduleReconnect();
            }
        });
        this.client.on('end', () => {
            console.log('🍍 [REDIS-MANAGER] 🔌 Redis/ElastiCache connection ended');
            this.connectionState = 'disconnected';
            this.scheduleReconnect();
        });
        this.client.on('reconnecting', () => {
            console.log('🍍 [REDIS-MANAGER] 🔄 Reconnecting to Redis/ElastiCache...');
            this.connectionState = 'connecting';
        });
    }
    isElastiCacheConnectionError(error) {
        const connectionErrorPatterns = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'EPIPE',
            'Connection lost',
            'Connection closed',
            'Socket closed unexpectedly',
            'connect ETIMEDOUT',
            'connect ECONNREFUSED'
        ];
        return connectionErrorPatterns.some(pattern => error.message.includes(pattern) || error.name.includes(pattern));
    }
    scheduleReconnect() {
        if (this.reconnectTimeout)
            return; // Already scheduled
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('🍍 [REDIS-MANAGER] ❌ Max reconnection attempts reached');
            return;
        }
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        console.log(`🍍 [REDIS-MANAGER] ⏱️  Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        this.reconnectTimeout = setTimeout(async () => {
            this.reconnectTimeout = undefined;
            await this.attemptReconnection();
        }, delay);
    }
    async attemptReconnection() {
        console.log(`🍍 [REDIS-MANAGER] 🔄 Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        try {
            this.connectionState = 'connecting';
            // Create a new client instance
            await this.client.disconnect().catch(() => { }); // Ignore errors on disconnect
            this.client = this.createClient();
            this.setupEventHandlers();
            await this.client.connect();
            // Test the connection (handle both client types)
            if ('ping' in this.client) {
                await this.client.ping();
            }
            else {
                // For cluster, we can test with a simple get operation
                await this.client.get('__test_connection__').catch(() => { }); // Ignore if key doesn't exist
            }
            console.log('🍍 [REDIS-MANAGER] ✅ Reconnection successful');
        }
        catch (error) {
            console.error(`🍍 [REDIS-MANAGER] ❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
            this.connectionState = 'error';
            this.scheduleReconnect();
        }
    }
    async ensureConnection() {
        const now = Date.now();
        // Check connection health periodically
        if (now - this.lastConnectionCheck > this.connectionCheckInterval) {
            this.lastConnectionCheck = now;
            if (this.connectionState === 'connected') {
                try {
                    // Health check (handle both client types)
                    if ('ping' in this.client) {
                        await this.client.ping();
                    }
                    else {
                        await this.client.get('__health_check__').catch(() => { }); // Ignore if key doesn't exist
                    }
                }
                catch (error) {
                    console.error('🍍 [REDIS-MANAGER] ❌ Health check failed:', error);
                    this.connectionState = 'error';
                    await this.attemptReconnection();
                }
            }
        }
        // Wait for connection if currently connecting
        if (this.connectionState === 'connecting') {
            let attempts = 0;
            while (this.connectionState === 'connecting' && attempts < 50) { // Max 5 seconds
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
        }
        // Try to reconnect if disconnected
        if (this.connectionState !== 'connected') {
            await this.attemptReconnection();
        }
    }
    async executeWithRetry(operation, operationName) {
        let lastError;
        for (let attempt = 1; attempt <= this.retryOptions.maxRetries; attempt++) {
            try {
                // Ensure we have a connection before the operation
                await this.ensureConnection();
                if (this.connectionState !== 'connected') {
                    throw new Error('Redis connection not available after reconnection attempts');
                }
                return await operation();
            }
            catch (error) {
                lastError = error;
                console.error(`🍍 [REDIS-MANAGER] ❌ ${operationName} attempt ${attempt}/${this.retryOptions.maxRetries} failed:`, error);
                // If this is a connection error and we have more attempts, try to reconnect
                if (attempt < this.retryOptions.maxRetries && this.isElastiCacheConnectionError(lastError)) {
                    const delay = Math.min(this.retryOptions.baseDelay * Math.pow(this.retryOptions.backoffMultiplier, attempt - 1), this.retryOptions.maxDelay);
                    console.log(`🍍 [REDIS-MANAGER] ⏱️  Retrying ${operationName} in ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    // Force reconnection
                    this.connectionState = 'disconnected';
                    continue;
                }
                // If it's not a connection error or we're out of retries, throw
                if (attempt === this.retryOptions.maxRetries) {
                    throw lastError;
                }
            }
        }
        throw lastError || new Error(`${operationName} failed after ${this.retryOptions.maxRetries} attempts`);
    }
    async get(key) {
        return this.executeWithRetry(() => this.client.get(key), `GET ${key}`);
    }
    async setEx(key, seconds, value) {
        await this.executeWithRetry(() => this.client.setEx(key, seconds, value), `SETEX ${key}`);
    }
    async del(key) {
        return this.executeWithRetry(() => this.client.del(key), `DEL ${key}`);
    }
    isConnected() {
        return this.connectionState === 'connected';
    }
    async disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = undefined;
        }
        try {
            await this.client.disconnect();
        }
        catch (error) {
            console.error('🍍 [REDIS-MANAGER] ❌ Error during disconnect:', error);
        }
        this.connectionState = 'disconnected';
    }
    // Method to initially connect
    async connect() {
        if (this.connectionState === 'connected') {
            return;
        }
        console.log('🍍 [REDIS-MANAGER] 🔌 Connecting to Redis/ElastiCache...');
        this.connectionState = 'connecting';
        try {
            await this.client.connect();
        }
        catch (error) {
            console.error('🍍 [REDIS-MANAGER] ❌ Initial connection failed:', error);
            this.connectionState = 'error';
            throw error;
        }
    }
}
exports.ElastiCacheConnectionManager = ElastiCacheConnectionManager;
//# sourceMappingURL=redis-connection-manager.js.map