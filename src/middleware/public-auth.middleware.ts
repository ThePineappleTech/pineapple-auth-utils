import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { createClient, createCluster, RedisClientType, RedisClusterType } from 'redis'
import type { RedisConfig } from '../index'
import { validateRedisConfig } from '../utils/config-helpers'
import { ElastiCacheConnectionManager, type RedisConnectionManager } from '../utils/redis-connection-manager'

interface PublicAuthConfig {
  jwt: {
    secret: string
    issuer: string
  }
  redis?: RedisConfig | { url: string }
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

/**
 * JWT-only authentication middleware for PUBLIC-FACING services
 * (pineapple-api, pineapple-motor-service, pineapple-building-and-contents-service)
 */
export class PublicAuthMiddleware {
  private redisClient?: RedisClientType | RedisClusterType
  private redisManager?: RedisConnectionManager
  private config: PublicAuthConfig
  
  constructor(config: PublicAuthConfig) {
    this.config = config
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.log('🍍 [PUBLIC-AUTH] Initializing public authentication middleware');
      console.log('🍍 [PUBLIC-AUTH] JWT Issuer:', config.jwt.issuer);
      console.log('🍍 [PUBLIC-AUTH] JWT Secret configured:', config.jwt.secret ? 'YES' : 'NO');
      console.log('🍍 [PUBLIC-AUTH] Redis configured:', config.redis ? 'YES' : 'NO');
    }
    
    if (config.redis) {
      try {
        const redisConfig = config.redis as RedisConfig
        
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          console.log('🍍 [PUBLIC-AUTH] Initializing resilient Redis/ElastiCache connection');
        }
        
        // Use the connection manager for resilient connections
        this.redisManager = new ElastiCacheConnectionManager(redisConfig)
        
        // Initialize connection in the background
        this.redisManager.connect()
          .then(() => {
            if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
              console.log('🍍 [PUBLIC-AUTH] ✅ Redis/ElastiCache connected successfully with automatic reconnection')
            }
          })
          .catch((error: any) => {
            console.error('🍍 [PUBLIC-AUTH] ❌ Initial Redis/ElastiCache connection failed:', error);
            console.log('🍍 [PUBLIC-AUTH] ⚠️  Connection will be retried automatically when needed');
          })
      } catch (error) {
        console.error('🍍 [PUBLIC-AUTH] ❌ Redis configuration error:', (error as Error).message);
      }
    }
    
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.log('🍍 [PUBLIC-AUTH] ✅ Public authentication middleware initialized');
    }
  }

  /**
   * Validate JWT tokens from frontend applications
   * Supports both HttpOnly cookies and Authorization header
   */
  validateJWT = async (req: Request, res: Response, next: NextFunction) => {
    const requestId = Date.now().toString() + Math.floor(Math.random() * 1000);
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.log(`[PUBLIC-AUTH-${requestId}] 🔐 Starting JWT validation for ${req.method} ${req.path}`);
    }
    
    try {
      // Allow OPTIONS requests
      if (req.method === 'OPTIONS') {
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          console.log(`[PUBLIC-AUTH-${requestId}] ✅ OPTIONS request - bypassing auth`);
        }
        return next()
      }

      // Check for token in HttpOnly cookies first (preferred method)
      let token = req.cookies?.['pineapple-access-token']
      let tokenSource = 'cookie'
      
      if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        console.log(`[PUBLIC-AUTH-${requestId}] 🍪 Cookie token present: ${token ? 'YES' : 'NO'}`);
      }

      // Fallback to Authorization header if no cookie token
      if (!token) {
        const authHeader = req.headers.authorization
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          console.log(`[PUBLIC-AUTH-${requestId}] 📝 Auth header present: ${authHeader ? 'YES' : 'NO'}`);
        }
        
        if (!authHeader?.startsWith('Bearer ')) {
          if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            console.log(`[PUBLIC-AUTH-${requestId}] ❌ No token found in cookies or auth header`);
          }
          return res.status(403).json({ 
            success: false, 
            error: { message: 'JWT token required (cookie or Authorization header)' }
          })
        }

        token = authHeader.substring(7)
        tokenSource = 'header'
      }
      if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        console.log(`[PUBLIC-AUTH-${requestId}] 🎫 Token extracted from ${tokenSource} (length: ${token.length})`);
        console.log(`[PUBLIC-AUTH-${requestId}] 🎫 Token preview: ${token.substring(0, 20)}...`);
      }
      
      try {
        if (!this.config.jwt.secret) {
          console.log(`[PUBLIC-AUTH-${requestId}] ❌ JWT secret not configured`);
          return res.status(500).json({ 
            error: 'Authentication configuration error' 
          });
        }

        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          console.log(`[PUBLIC-AUTH-${requestId}] 🔍 Verifying JWT with secret: ${this.config.jwt.secret.substring(0, 10)}...`);
          console.log(`[PUBLIC-AUTH-${requestId}] 🔍 Expected issuer: ${this.config.jwt.issuer}`);
        }
        
        const decoded = jwt.verify(token, this.config.jwt.secret, {
          issuer: this.config.jwt.issuer
        }) as any

        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          console.log(`[PUBLIC-AUTH-${requestId}] ✅ JWT decoded successfully`);
          console.log(`[PUBLIC-AUTH-${requestId}] 👤 User: ${decoded.email} (ID: ${decoded.userId})`);
          console.log(`[PUBLIC-AUTH-${requestId}] 🎭 Role: ${decoded.role || 'none'}`);
          console.log(`[PUBLIC-AUTH-${requestId}] 🎯 Token ID: ${decoded.jti}`);
          console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Expires: ${decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'never'}`);
        }

        // Check if token is revoked (if Redis is available)
        if (this.redisManager) {
          if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            console.log(`[PUBLIC-AUTH-${requestId}] 🔄 Checking token revocation in Redis/ElastiCache`);
          }
          
          try {
            const isRevoked = await this.redisManager.get(`revoked:${decoded.jti}`)
            if (isRevoked) {
              if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
                console.log(`[PUBLIC-AUTH-${requestId}] ❌ Token is revoked`);
              }
              return res.status(403).json({
                success: false,
                error: { message: 'Token has been revoked' }
              })
            }
            if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
              console.log(`[PUBLIC-AUTH-${requestId}] ✅ Token not revoked`);
            }
          } catch (redisError) {
            // Log the error but don't block authentication - degraded mode
            console.error(`[PUBLIC-AUTH-${requestId}] ⚠️  Redis/ElastiCache error during revocation check:`, redisError);
            console.log(`[PUBLIC-AUTH-${requestId}] 🔄 Continuing in degraded mode without revocation check`);
          }
        } else {
          if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            console.log(`[PUBLIC-AUTH-${requestId}] ⚠️  Redis not configured - skipping revocation check`);
          }
        }

        // Validate token hasn't expired (additional security)
        const now = Math.floor(Date.now() / 1000)
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Current time: ${now}, Token exp: ${decoded.exp}`);
        }
        
        if (decoded.exp && decoded.exp < now) {
          if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            console.log(`[PUBLIC-AUTH-${requestId}] ❌ Token expired (exp check)`);
          }
          return res.status(403).json({
            success: false,
            error: { message: 'Token expired' }
          })
        }

        req.auth = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          permissions: decoded.permissions || [],
          tokenId: decoded.jti,
          type: 'jwt'
        }

        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          console.log(`[PUBLIC-AUTH-${requestId}] ✅ Authentication successful via ${tokenSource} - proceeding to next middleware`);
        }
        next()
      } catch (jwtError: any) {
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          console.log(`[PUBLIC-AUTH-${requestId}] ❌ JWT verification failed: ${jwtError.name}`);
          console.log(`[PUBLIC-AUTH-${requestId}] ❌ JWT error details: ${jwtError.message}`);
        }
        
        if (jwtError.name === 'TokenExpiredError') {
          if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Token expired at: ${new Date(jwtError.expiredAt).toISOString()}`);
          }
          return res.status(403).json({
            success: false,
            error: { message: 'Token expired' }
          })
        }
        return res.status(403).json({
          success: false,
          error: { message: 'Invalid JWT token' }
        })
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        console.log(`[PUBLIC-AUTH-${requestId}] 💥 Unexpected error during JWT validation:`, error);
      }
      return res.status(500).json({
        success: false,
        error: { message: 'Authentication error' }
      })
    }
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

// Factory function
export function createPublicAuth(config: PublicAuthConfig): PublicAuthMiddleware {
  return new PublicAuthMiddleware(config)
}