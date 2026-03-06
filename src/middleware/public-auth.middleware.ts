import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { createClient, RedisClientType } from 'redis'

interface AuthConfig {
  jwt: {
    secret: string
    issuer: string
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

/**
 * JWT-only authentication middleware for PUBLIC-FACING services
 * (pineapple-api, pineapple-motor-service, pineapple-building-and-contents-service)
 */
export class PublicAuthMiddleware {
  private redisClient?: RedisClientType
  
  constructor(private config: AuthConfig) {
    console.log('🍍 [PUBLIC-AUTH] Initializing public authentication middleware');
    console.log('🍍 [PUBLIC-AUTH] JWT Issuer:', config.jwt.issuer);
    console.log('🍍 [PUBLIC-AUTH] JWT Secret configured:', config.jwt.secret ? 'YES' : 'NO');
    console.log('🍍 [PUBLIC-AUTH] Redis configured:', config.redis ? 'YES' : 'NO');
    
    if (config.redis) {
      console.log('🍍 [PUBLIC-AUTH] Connecting to Redis:', config.redis.url);
      this.redisClient = createClient({ url: config.redis.url })
      this.redisClient.connect()
        .then(() => console.log('🍍 [PUBLIC-AUTH] ✅ Redis connected successfully'))
        .catch((error) => {
          console.error('🍍 [PUBLIC-AUTH] ❌ Redis connection failed:', error);
        })
    }
    
    console.log('🍍 [PUBLIC-AUTH] ✅ Public authentication middleware initialized');
  }

  /**
   * Validate JWT tokens from frontend applications
   * This is the ONLY authentication method supported
   */
  validateJWT = async (req: Request, res: Response, next: NextFunction) => {
    const requestId = Math.random().toString(36).substr(2, 9);
    console.log(`[PUBLIC-AUTH-${requestId}] 🔐 Starting JWT validation for ${req.method} ${req.path}`);
    
    try {
      // Allow OPTIONS requests
      if (req.method === 'OPTIONS') {
        console.log(`[PUBLIC-AUTH-${requestId}] ✅ OPTIONS request - bypassing auth`);
        return next()
      }

      const authHeader = req.headers.authorization
      console.log(`[PUBLIC-AUTH-${requestId}] 📝 Auth header present: ${authHeader ? 'YES' : 'NO'}`);
      
      if (!authHeader?.startsWith('Bearer ')) {
        console.log(`[PUBLIC-AUTH-${requestId}] ❌ Invalid auth header format: ${authHeader || 'missing'}`);
        return res.status(403).json({ 
          success: false, 
          error: { message: 'JWT Bearer token required' }
        })
      }

      const token = authHeader.substring(7)
      console.log(`[PUBLIC-AUTH-${requestId}] 🎫 Token extracted (length: ${token.length})`);
      console.log(`[PUBLIC-AUTH-${requestId}] 🎫 Token preview: ${token.substring(0, 20)}...`);
      
      try {
        console.log(`[PUBLIC-AUTH-${requestId}] 🔍 Verifying JWT with secret: ${this.config.jwt.secret.substring(0, 10)}...`);
        console.log(`[PUBLIC-AUTH-${requestId}] 🔍 Expected issuer: ${this.config.jwt.issuer}`);
        
        const decoded = jwt.verify(token, this.config.jwt.secret, {
          issuer: this.config.jwt.issuer
        }) as any

        console.log(`[PUBLIC-AUTH-${requestId}] ✅ JWT decoded successfully`);
        console.log(`[PUBLIC-AUTH-${requestId}] 👤 User: ${decoded.email} (ID: ${decoded.userId})`);
        console.log(`[PUBLIC-AUTH-${requestId}] 🎭 Role: ${decoded.role || 'none'}`);
        console.log(`[PUBLIC-AUTH-${requestId}] 🎯 Token ID: ${decoded.jti}`);
        console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Expires: ${new Date(decoded.exp * 1000).toISOString()}`);

        // Check if token is revoked (if Redis is available)
        if (this.redisClient) {
          console.log(`[PUBLIC-AUTH-${requestId}] 🔄 Checking token revocation in Redis`);
          const isRevoked = await this.redisClient.get(`revoked:${decoded.jti}`)
          if (isRevoked) {
            console.log(`[PUBLIC-AUTH-${requestId}] ❌ Token is revoked`);
            return res.status(403).json({
              success: false,
              error: { message: 'Token has been revoked' }
            })
          }
          console.log(`[PUBLIC-AUTH-${requestId}] ✅ Token not revoked`);
        } else {
          console.log(`[PUBLIC-AUTH-${requestId}] ⚠️  Redis not configured - skipping revocation check`);
        }

        // Validate token hasn't expired (additional security)
        const now = Math.floor(Date.now() / 1000)
        console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Current time: ${now}, Token exp: ${decoded.exp}`);
        
        if (decoded.exp && decoded.exp < now) {
          console.log(`[PUBLIC-AUTH-${requestId}] ❌ Token expired (exp check)`);
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

        console.log(`[PUBLIC-AUTH-${requestId}] ✅ Authentication successful - proceeding to next middleware`);
        next()
      } catch (jwtError: any) {
        console.log(`[PUBLIC-AUTH-${requestId}] ❌ JWT verification failed: ${jwtError.name}`);
        console.log(`[PUBLIC-AUTH-${requestId}] ❌ JWT error details: ${jwtError.message}`);
        
        if (jwtError.name === 'TokenExpiredError') {
          console.log(`[PUBLIC-AUTH-${requestId}] ⏰ Token expired at: ${new Date(jwtError.expiredAt).toISOString()}`);
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
      console.log(`[PUBLIC-AUTH-${requestId}] 💥 Unexpected error during JWT validation:`, error);
      return res.status(500).json({
        success: false,
        error: { message: 'Authentication error' }
      })
    }
  }
}

// Factory function
export function createPublicAuth(config: AuthConfig): PublicAuthMiddleware {
  return new PublicAuthMiddleware(config)
}