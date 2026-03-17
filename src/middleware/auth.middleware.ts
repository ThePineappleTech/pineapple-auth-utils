import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import aws4 from 'aws4'
import * as Redis from 'redis'
import type { AuthConfig, RedisConfig } from '../index'
import { validateRedisConfig } from '../utils/config-helpers'
import { ElastiCacheConnectionManager, type RedisConnectionManager } from '../utils/redis-connection-manager'

interface LegacyAuthConfig {
  jwt: {
    secret: string
    issuer: string
  }
  aws: {
    region: string
    service: string
  }
  redis?: {
    url: string
  }
}

interface AuthContext {
  userId: string
  email: string
  role?: string
  permissions?: string[]
  tokenId: string
  type: 'jwt' | 'service'
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

export class PineappleAuth {
  private redisClient?: Redis.RedisClientType | Redis.RedisClusterType
  private redisManager?: RedisConnectionManager
  private config: AuthConfig | LegacyAuthConfig
  
  constructor(config: AuthConfig | LegacyAuthConfig) {
    this.config = config
    console.log('🍍 [PINEAPPLE-AUTH] Initializing authentication middleware');
    console.log('🍍 [PINEAPPLE-AUTH] JWT Issuer:', config.jwt.issuer);
    console.log('🍍 [PINEAPPLE-AUTH] JWT Secret configured:', config.jwt.secret ? 'YES' : 'NO');
    console.log('🍍 [PINEAPPLE-AUTH] Redis configured:', config.redis ? 'YES' : 'NO');
    
    if (config.redis) {
      try {
        const redisConfig = config.redis as RedisConfig
        
        console.log('🍍 [PINEAPPLE-AUTH] Initializing resilient Redis/ElastiCache connection');
        
        // Use the connection manager for resilient connections
        this.redisManager = new ElastiCacheConnectionManager(redisConfig)
        
        // Initialize connection in the background
        this.redisManager.connect()
          .then(() => {
            console.log('🍍 [PINEAPPLE-AUTH] ✅ Redis/ElastiCache connected successfully with automatic reconnection')
          })
          .catch((error: any) => {
            console.error('🍍 [PINEAPPLE-AUTH] ❌ Initial Redis/ElastiCache connection failed:', error);
            console.log('🍍 [PINEAPPLE-AUTH] ⚠️  Connection will be retried automatically when needed');
          })
      } catch (error) {
        console.error('🍍 [PINEAPPLE-AUTH] ❌ Redis configuration error:', (error as Error).message);
      }
    }
    
    console.log('🍍 [PINEAPPLE-AUTH] ✅ Authentication middleware initialized');
  }

  /**
   * Middleware for JWT authentication (frontend -> service)
   */
  validateJWT = async (req: Request, res: Response, next: NextFunction) => {
    const requestId = Date.now().toString() + Math.floor(Math.random() * 1000);
    console.log(`[JWT-AUTH-${requestId}] 🔐 Starting JWT validation for ${req.method} ${req.path}`);
    
    try {
      // Allow OPTIONS requests
      if (req.method === 'OPTIONS') {
        console.log(`[JWT-AUTH-${requestId}] ✅ OPTIONS request - bypassing auth`);
        return next()
      }

      const authHeader = req.headers.authorization
      console.log(`[JWT-AUTH-${requestId}] 📝 Auth header present: ${authHeader ? 'YES' : 'NO'}`);
      
      if (!authHeader?.startsWith('Bearer ')) {
        console.log(`[JWT-AUTH-${requestId}] ❌ Invalid auth header format: ${authHeader || 'missing'}`);
        return res.status(403).json({ 
          success: false, 
          error: { message: 'Missing or invalid Authorization header' }
        })
      }

      const token = authHeader.substring(7)
      console.log(`[JWT-AUTH-${requestId}] 🎫 Token extracted (length: ${token.length})`);
      console.log(`[JWT-AUTH-${requestId}] 🎫 Token preview: ${token.substring(0, 20)}...`);
      
      try {
        if (!this.config.jwt.secret) {
          console.log(`[JWT-AUTH-${requestId}] ❌ JWT secret not configured`);
          return res.status(500).json({ 
            error: 'Authentication configuration error' 
          });
        }

        console.log(`[JWT-AUTH-${requestId}] 🔍 Verifying JWT with secret: ${this.config.jwt.secret.substring(0, 10)}...`);
        console.log(`[JWT-AUTH-${requestId}] 🔍 Expected issuer: ${this.config.jwt.issuer}`);
        
        const decoded = jwt.verify(token, this.config.jwt.secret, {
          issuer: this.config.jwt.issuer,
          audience: 'pineapple-services'
        }) as any

        console.log(`[JWT-AUTH-${requestId}] ✅ JWT decoded successfully`);
        console.log(`[JWT-AUTH-${requestId}] 👤 User: ${decoded.email} (ID: ${decoded.userId})`);
        console.log(`[JWT-AUTH-${requestId}] 🎭 Role: ${decoded.role || 'none'}`);
        console.log(`[JWT-AUTH-${requestId}] 🎯 Token ID: ${decoded.jti}`);
        console.log(`[JWT-AUTH-${requestId}] ⏰ Expires: ${decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'never'}`);

        // Check if token is revoked (if Redis is available)
        if (this.redisManager) {
          console.log(`[JWT-AUTH-${requestId}] 🔄 Checking token revocation in Redis/ElastiCache`);
          
          try {
            const isRevoked = await this.redisManager.get(`revoked:${decoded.jti}`)
            if (isRevoked) {
              console.log(`[JWT-AUTH-${requestId}] ❌ Token is revoked`);
              return res.status(403).json({
                success: false,
                error: { message: 'Token has been revoked' }
              })
            }
            console.log(`[JWT-AUTH-${requestId}] ✅ Token not revoked`);
          } catch (redisError) {
            // Log the error but don't block authentication - degraded mode
            console.error(`[JWT-AUTH-${requestId}] ⚠️  Redis/ElastiCache error during revocation check:`, redisError);
            console.log(`[JWT-AUTH-${requestId}] 🔄 Continuing in degraded mode without revocation check`);
          }
        } else {
          console.log(`[JWT-AUTH-${requestId}] ⚠️  Redis not configured - skipping revocation check`);
        }

        req.auth = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          permissions: decoded.permissions || [],
          tokenId: decoded.jti,
          type: 'jwt'
        }

        console.log(`[JWT-AUTH-${requestId}] ✅ Authentication successful - proceeding to next middleware`);
        next()
      } catch (jwtError: any) {
        console.log(`[JWT-AUTH-${requestId}] ❌ JWT verification failed: ${jwtError.name}`);
        console.log(`[JWT-AUTH-${requestId}] ❌ JWT error details: ${jwtError.message}`);
        
        if (jwtError.name === 'TokenExpiredError') {
          console.log(`[JWT-AUTH-${requestId}] ⏰ Token expired at: ${new Date(jwtError.expiredAt).toISOString()}`);
          return res.status(403).json({
            success: false,
            error: { message: 'Token expired' }
          })
        }
        return res.status(403).json({
          success: false,
          error: { message: 'Invalid token' }
        })
      }
    } catch (error) {
      console.log(`[JWT-AUTH-${requestId}] 💥 Unexpected error during JWT validation:`, error);
      return res.status(500).json({
        success: false,
        error: { message: 'Authentication error' }
      })
    }
  }

  /**
   * Middleware for AWS SigV4 authentication (service -> service)
   */
  validateServiceAuth = async (req: Request, res: Response, next: NextFunction) => {
    const requestId = Date.now().toString() + Math.floor(Math.random() * 1000);
    console.log(`[SERVICE-AUTH-${requestId}] 🔧 Starting service auth validation for ${req.method} ${req.path}`);
    
    try {
      // Allow OPTIONS requests
      if (req.method === 'OPTIONS') {
        console.log(`[SERVICE-AUTH-${requestId}] ✅ OPTIONS request - bypassing auth`);
        return next()
      }

      const authHeader = req.headers.authorization
      console.log(`[SERVICE-AUTH-${requestId}] 📝 Auth header: ${authHeader ? 'Present (AWS4)' : 'Missing'}`);
      
      if (!authHeader?.includes('AWS4-HMAC-SHA256')) {
        console.log(`[SERVICE-AUTH-${requestId}] ❌ Invalid service auth format: ${authHeader || 'missing'}`);
        return res.status(403).json({
          success: false,
          error: { message: 'Missing or invalid service authorization' }
        })
      }

      const timestamp = parseInt(req.headers['x-pineapple-timestamp'] as string || '0')
      const nonce = req.headers['x-pineapple-nonce'] as string
      
      console.log(`[SERVICE-AUTH-${requestId}] ⏰ Timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
      console.log(`[SERVICE-AUTH-${requestId}] 🎲 Nonce: ${nonce || 'missing'}`);

      // Validate timestamp (5 minute window)
      const now = Math.floor(Date.now() / 1000)
      const timeDiff = Math.abs(now - timestamp);
      console.log(`[SERVICE-AUTH-${requestId}] ⏰ Time difference: ${timeDiff}s (max 300s)`);
      
      if (timeDiff > 300) {
        console.log(`[SERVICE-AUTH-${requestId}] ❌ Request timestamp outside valid window`);
        return res.status(403).json({
          success: false,
          error: { message: 'Request timestamp outside valid window' }
        })
      }

      // Validate nonce
      if (!nonce) {
        console.log(`[SERVICE-AUTH-${requestId}] ❌ Missing request nonce`);
        return res.status(403).json({
          success: false,
          error: { message: 'Missing request nonce' }
        })
      }

      // Check nonce hasn't been used (if Redis available)
      if (this.redisManager) {
        console.log(`[SERVICE-AUTH-${requestId}] 🔄 Checking nonce replay in Redis/ElastiCache`);
        
        try {
          const nonceUsed = await this.redisManager.get(`nonce:${nonce}`)
          if (nonceUsed) {
            console.log(`[SERVICE-AUTH-${requestId}] ❌ Nonce already used - replay attack detected`);
            return res.status(403).json({
              success: false,
              error: { message: 'Request nonce already used' }
            })
          }
          // Store nonce for 5 minutes
          await this.redisManager.setEx(`nonce:${nonce}`, 300, 'used')
          console.log(`[SERVICE-AUTH-${requestId}] ✅ Nonce stored for replay protection`);
        } catch (redisError) {
          // Log the error but don't block authentication - degraded mode
          console.error(`[SERVICE-AUTH-${requestId}] ⚠️  Redis/ElastiCache error during nonce check:`, redisError);
          console.log(`[SERVICE-AUTH-${requestId}] 🔄 Continuing in degraded mode without nonce replay check`);
        }
      } else {
        console.log(`[SERVICE-AUTH-${requestId}] ⚠️  Redis not configured - skipping nonce replay check`);
      }

      // Extract service name from signature
      const serviceName = this.extractServiceFromAuth(authHeader)
      console.log(`[SERVICE-AUTH-${requestId}] 🏷️  Extracted service name: ${serviceName || 'none'}`);
      
      if (!serviceName) {
        console.log(`[SERVICE-AUTH-${requestId}] ❌ Could not extract service from signature`);
        return res.status(403).json({
          success: false,
          error: { message: 'Invalid service signature' }
        })
      }

      req.auth = {
        userId: serviceName,
        email: `${serviceName}@service.pineapple.internal`,
        role: 'service',
        permissions: ['service:*'],
        tokenId: nonce,
        type: 'service'
      }

      console.log(`[SERVICE-AUTH-${requestId}] ✅ Service authentication successful - proceeding to next middleware`);
      next()
    } catch (error) {
      console.log(`[SERVICE-AUTH-${requestId}] 💥 Unexpected error during service auth:`, error);
      return res.status(500).json({
        success: false,
        error: { message: 'Service authentication error' }
      })
    }
  }

  /**
   * Combined middleware that accepts both JWT and Service authentication
   */
  validateAnyAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization

    if (authHeader?.startsWith('Bearer ')) {
      return this.validateJWT(req, res, next)
    } else if (authHeader?.includes('AWS4-HMAC-SHA256')) {
      return this.validateServiceAuth(req, res, next)
    } else {
      return res.status(403).json({
        success: false,
        error: { message: 'No valid authentication provided' }
      })
    }
  }

  /**
   * Revoke JWT token (requires Redis)
   */
  async revokeToken(tokenId: string, expirySeconds: number = 86400): Promise<void> {
    if (!this.redisManager) {
      throw new Error('Redis not configured for token revocation')
    }
    await this.redisManager.setEx(`revoked:${tokenId}`, expirySeconds, 'true')
  }

  private extractServiceFromAuth(authHeader: string): string | null {
    // Extract service name from AWS4 signature format
    // This is a simplified version - you'd enhance this based on your needs
    const credentialMatch = authHeader.match(/Credential=([^\/]+)\//)
    return credentialMatch ? credentialMatch[1] : null
  }

  private getRedisUrl(redisConfig: RedisConfig | { url: string }): string {
    // Handle legacy format
    if ('url' in redisConfig && typeof redisConfig.url === 'string') {
      return redisConfig.url
    }
    
    // Handle new flexible format
    return validateRedisConfig(redisConfig as RedisConfig)
  }

  private getRedisOptions(redisConfig: RedisConfig | { url: string }): any {
    // Handle legacy format
    if ('url' in redisConfig && typeof redisConfig.url === 'string' && Object.keys(redisConfig).length === 1) {
      return { url: redisConfig.url }
    }

    const config = redisConfig as RedisConfig
    
    // If URL is provided with additional options, use URL but apply extra options
    if (config.url) {
      const options: any = { url: config.url }
      
      // Add TLS options if specified
      if (config.tls) {
        if (typeof config.tls === 'boolean' && config.tls) {
          options.socket = { tls: true }
        } else if (typeof config.tls === 'object') {
          options.socket = { 
            tls: true,
            servername: config.tls.servername,
            rejectUnauthorized: config.tls.rejectUnauthorized
          }
        }
      }

      // Add timeout options
      if (config.connectTimeout) options.socket = { ...options.socket, connectTimeout: config.connectTimeout }
      if (config.commandTimeout) options.commandTimeout = config.commandTimeout
      
      // Add retry options  
      if (config.retryDelayOnFailover) options.retryDelayOnFailover = config.retryDelayOnFailover
      if (config.enableOfflineQueue !== undefined) options.enableOfflineQueue = config.enableOfflineQueue
      if (config.maxRetriesPerRequest) options.maxRetriesPerRequest = config.maxRetriesPerRequest
      if (config.retryConnect) options.retryConnect = config.retryConnect

      return options
    }

    // Build from individual components
    const options: any = {
      socket: {
        host: config.host || 'localhost',
        port: config.port || 6379
      }
    }

    if (config.password) options.password = config.password
    if (config.username) options.username = config.username
    if (config.db) options.database = config.db
    if (config.family) options.socket.family = config.family

    // TLS configuration
    if (config.tls) {
      if (typeof config.tls === 'boolean' && config.tls) {
        options.socket.tls = true
      } else if (typeof config.tls === 'object') {
        options.socket.tls = true
        if (config.tls.servername) options.socket.servername = config.tls.servername
        if (config.tls.rejectUnauthorized !== undefined) options.socket.rejectUnauthorized = config.tls.rejectUnauthorized
      }
    }

    // Timeout options
    if (config.connectTimeout) options.socket.connectTimeout = config.connectTimeout
    if (config.commandTimeout) options.commandTimeout = config.commandTimeout
    
    // Retry options
    if (config.retryDelayOnFailover) options.retryDelayOnFailover = config.retryDelayOnFailover
    if (config.enableOfflineQueue !== undefined) options.enableOfflineQueue = config.enableOfflineQueue  
    if (config.maxRetriesPerRequest) options.maxRetriesPerRequest = config.maxRetriesPerRequest
    if (config.retryConnect) options.retryConnect = config.retryConnect

    return options
  }

  private getRedisClusterOptions(redisConfig: RedisConfig): any {
    const clusterConfig = redisConfig.cluster!
    
    const options: any = {
      rootNodes: clusterConfig.rootNodes || [],
      defaults: clusterConfig.defaults || {}
    }

    // Apply cluster-specific settings
    if (clusterConfig.enableAutoPipelining !== undefined) {
      options.enableAutoPipelining = clusterConfig.enableAutoPipelining
    }
    if (clusterConfig.useReplicas !== undefined) {
      options.useReplicas = clusterConfig.useReplicas
    }
    if (clusterConfig.maxCommandRedirections) {
      options.maxCommandRedirections = clusterConfig.maxCommandRedirections
    }
    if (clusterConfig.retryDelayOnClusterDown) {
      options.retryDelayOnClusterDown = clusterConfig.retryDelayOnClusterDown
    }
    if (clusterConfig.retryDelayOnFailover) {
      options.retryDelayOnFailover = clusterConfig.retryDelayOnFailover
    }
    if (clusterConfig.maxRetriesPerRequest) {
      options.maxRetriesPerRequest = clusterConfig.maxRetriesPerRequest
    }
    if (clusterConfig.scaleReads) {
      options.scaleReads = clusterConfig.scaleReads
    }

    // Apply global Redis settings to defaults
    if (redisConfig.password) options.defaults.password = redisConfig.password
    if (redisConfig.username) options.defaults.username = redisConfig.username
    if (redisConfig.db) options.defaults.database = redisConfig.db
    
    // Apply TLS settings to defaults
    if (redisConfig.tls) {
      if (!options.defaults.socket) options.defaults.socket = {}
      if (typeof redisConfig.tls === 'boolean' && redisConfig.tls) {
        options.defaults.socket.tls = true
      } else if (typeof redisConfig.tls === 'object') {
        options.defaults.socket.tls = true
        if (redisConfig.tls.servername) options.defaults.socket.servername = redisConfig.tls.servername
        if (redisConfig.tls.rejectUnauthorized !== undefined) {
          options.defaults.socket.rejectUnauthorized = redisConfig.tls.rejectUnauthorized
        }
      }
    }

    // Apply timeout settings to defaults
    if (redisConfig.connectTimeout) {
      if (!options.defaults.socket) options.defaults.socket = {}
      options.defaults.socket.connectTimeout = redisConfig.connectTimeout
    }
    if (redisConfig.commandTimeout) {
      options.defaults.commandTimeout = redisConfig.commandTimeout
    }

    return options
  }

  private maskCredentials(url: string): string {
    // Mask credentials in logs for security
    return url.replace(/:\/\/[^@]*@/, '://***:***@')
  }
}

// Export factory function for easy setup
export function createAuthMiddleware(config: AuthConfig | LegacyAuthConfig): PineappleAuth {
  return new PineappleAuth(config)
}