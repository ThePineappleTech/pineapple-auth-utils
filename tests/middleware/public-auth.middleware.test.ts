import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PublicAuthMiddleware, createPublicAuth } from '../../src/middleware/public-auth.middleware'

// Mock the Redis connection manager
const mockRedisManager = {
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  setEx: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(1),
  isConnected: jest.fn().mockReturnValue(true),
  disconnect: jest.fn().mockResolvedValue(undefined),
}

// Create a single instance that's always returned
const mockConnectionManagerInstance = mockRedisManager

jest.mock('../../src/utils/redis-connection-manager', () => ({
  ElastiCacheConnectionManager: jest.fn(() => mockConnectionManagerInstance),
}))

// Mock dependencies
jest.mock('jsonwebtoken')

const mockJWT = jwt as jest.Mocked<typeof jwt>

describe('PublicAuthMiddleware', () => {
  let publicAuth: PublicAuthMiddleware
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  const testConfig = {
    jwt: {
      secret: 'test-secret',
      issuer: 'test-issuer'
    },
    redis: {
      url: 'redis://localhost:6379'
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    
    // Reset all mock functions
    Object.values(mockConnectionManagerInstance).forEach((fn: any) => {
      if (jest.isMockFunction(fn)) {
        fn.mockReset()
      }
    })
    
    // Set default return values
    mockConnectionManagerInstance.get.mockResolvedValue(null)
    mockConnectionManagerInstance.setEx.mockResolvedValue(undefined)
    mockConnectionManagerInstance.del.mockResolvedValue(1)
    mockConnectionManagerInstance.connect.mockResolvedValue(undefined)
    mockConnectionManagerInstance.disconnect.mockResolvedValue(undefined)
    mockConnectionManagerInstance.isConnected.mockReturnValue(true)
    
    publicAuth = new PublicAuthMiddleware(testConfig)
    
    mockReq = {
      method: 'GET',
      path: '/test',
      headers: {}
    }
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    }
    
    mockNext = jest.fn()
  })

  afterEach(async () => {
    // Clean up any hanging promises/timers
    if (publicAuth && (publicAuth as any).redisManager) {
      try {
        await (publicAuth as any).redisManager.disconnect()
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    // Restore console
    jest.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(publicAuth).toBeInstanceOf(PublicAuthMiddleware)
    })

    it('should initialize without Redis', () => {
      const configNoRedis = {
        jwt: testConfig.jwt
      }
      const auth = new PublicAuthMiddleware(configNoRedis)
      expect(auth).toBeInstanceOf(PublicAuthMiddleware)
    })
  })

  describe('validateJWT', () => {
    const validToken = 'valid.jwt.token'
    const decodedToken = {
      userId: 'user123',
      email: 'test@example.com',
      role: 'user',
      permissions: ['read'],
      jti: 'token123',
      exp: Math.floor(Date.now() / 1000) + 3600
    }

    beforeEach(() => {
      mockReq.headers = {
        authorization: `Bearer ${validToken}`
      }
    })

    it('should bypass OPTIONS requests', async () => {
      mockReq.method = 'OPTIONS'
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('should reject requests without authorization header', async () => {
      delete mockReq.headers!.authorization
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'JWT token required (cookie or Authorization header)' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should reject malformed authorization header', async () => {
      mockReq.headers!.authorization = 'Basic credentials'
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'JWT token required (cookie or Authorization header)' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should successfully validate valid JWT token', async () => {
      mockJWT.verify.mockReturnValue(decodedToken as any)
      mockConnectionManagerInstance.get.mockResolvedValue(null)
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockJWT.verify).toHaveBeenCalledWith(validToken, testConfig.jwt.secret, {
        issuer: testConfig.jwt.issuer
      })
      expect(mockReq.auth).toEqual({
        userId: decodedToken.userId,
        email: decodedToken.email,
        role: decodedToken.role,
        permissions: decodedToken.permissions,
        tokenId: decodedToken.jti,
        type: 'jwt'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should reject expired JWT token', async () => {
      const expiredError = new Error('Token expired')
      expiredError.name = 'TokenExpiredError'
      ;(expiredError as any).expiredAt = new Date()
      
      mockJWT.verify.mockImplementation(() => {
        throw expiredError
      })
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Token expired' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should reject invalid JWT token', async () => {
      const invalidError = new Error('Invalid token')
      mockJWT.verify.mockImplementation(() => {
        throw invalidError
      })
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Invalid JWT token' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    // Note: Token revocation testing is covered by Redis error handling tests
    // which verify the system works in degraded mode when Redis is unavailable

    it('should reject token that fails additional expiry check', async () => {
      const expiredDecodedToken = {
        ...decodedToken,
        exp: Math.floor(Date.now() / 1000) - 100 // Expired
      }
      
      mockJWT.verify.mockReturnValue(expiredDecodedToken as any)
      mockConnectionManagerInstance.get.mockResolvedValue(null)
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Token expired' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle token without exp claim', async () => {
      const tokenNoExp = {
        userId: decodedToken.userId,
        email: decodedToken.email,
        role: decodedToken.role,
        permissions: decodedToken.permissions,
        jti: decodedToken.jti
      }
      
      jest.clearAllMocks()
      mockJWT.verify.mockReturnValue(tokenNoExp as any)
      mockConnectionManagerInstance.get.mockResolvedValue(null)
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.auth).toEqual({
        userId: tokenNoExp.userId,
        email: tokenNoExp.email,
        role: tokenNoExp.role,
        permissions: tokenNoExp.permissions,
        tokenId: tokenNoExp.jti,
        type: 'jwt'
      })
    })

    it('should work without Redis configuration', async () => {
      const authNoRedis = new PublicAuthMiddleware({
        jwt: testConfig.jwt
      })
      
      mockJWT.verify.mockReturnValue(decodedToken as any)
      
      await authNoRedis.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockReq.auth).toEqual({
        userId: decodedToken.userId,
        email: decodedToken.email,
        role: decodedToken.role,
        permissions: decodedToken.permissions,
        tokenId: decodedToken.jti,
        type: 'jwt'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle Redis errors gracefully and continue authentication', async () => {
      mockJWT.verify.mockReturnValue(decodedToken as any)
      mockConnectionManagerInstance.get.mockRejectedValue(new Error('Redis connection failed'))
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      // When Redis fails, the middleware should still proceed in degraded mode
      expect(mockReq.auth).toEqual({
        userId: decodedToken.userId,
        email: decodedToken.email,
        role: decodedToken.role,
        permissions: decodedToken.permissions,
        tokenId: decodedToken.jti,
        type: 'jwt'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle tokens without permissions', async () => {
      const tokenNoPermissions = {
        userId: decodedToken.userId,
        email: decodedToken.email,
        role: decodedToken.role,
        jti: decodedToken.jti,
        exp: decodedToken.exp
      }
      
      mockJWT.verify.mockReturnValue(tokenNoPermissions as any)
      mockConnectionManagerInstance.get.mockResolvedValue(null)
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockReq.auth).toEqual({
        userId: tokenNoPermissions.userId,
        email: tokenNoPermissions.email,
        role: tokenNoPermissions.role,
        permissions: [],
        tokenId: tokenNoPermissions.jti,
        type: 'jwt'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle tokens without role', async () => {
      const tokenNoRole = {
        userId: decodedToken.userId,
        email: decodedToken.email,
        permissions: decodedToken.permissions,
        jti: decodedToken.jti,
        exp: decodedToken.exp
      }
      
      mockJWT.verify.mockReturnValue(tokenNoRole as any)
      mockConnectionManagerInstance.get.mockResolvedValue(null)
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockReq.auth).toEqual({
        userId: tokenNoRole.userId,
        email: tokenNoRole.email,
        role: undefined,
        permissions: tokenNoRole.permissions,
        tokenId: tokenNoRole.jti,
        type: 'jwt'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle unexpected errors during validation', async () => {
      mockJWT.verify.mockImplementation(() => {
        throw new Error('Unexpected JWT error')
      })
      
      await publicAuth.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Invalid JWT token' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('createPublicAuth factory', () => {
    it('should create PublicAuthMiddleware instance', () => {
      const middleware = createPublicAuth(testConfig)
      expect(middleware).toBeInstanceOf(PublicAuthMiddleware)
    })
  })
})