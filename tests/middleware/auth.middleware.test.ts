import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PineappleAuth, createAuthMiddleware } from '../../src/middleware/auth.middleware'
import { createClient } from 'redis'

// Mock dependencies
jest.mock('jsonwebtoken')
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    setEx: jest.fn(),
  })),
}))

const mockJWT = jwt as jest.Mocked<typeof jwt>
const mockRedis = createClient as jest.MockedFunction<typeof createClient>

describe('PineappleAuth', () => {
  let authMiddleware: PineappleAuth
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction
  let mockRedisClient: any

  const testConfig = {
    jwt: {
      secret: 'test-secret',
      issuer: 'test-issuer'
    },
    aws: {
      region: 'us-east-1',
      service: 'pineapple'
    },
    redis: {
      url: 'redis://localhost:6379'
    }
  }

  beforeEach(() => {
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      setEx: jest.fn(),
    }
    
    mockRedis.mockReturnValue(mockRedisClient)
    
    authMiddleware = new PineappleAuth(testConfig)
    
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
    
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(authMiddleware).toBeInstanceOf(PineappleAuth)
    })

    it('should initialize without Redis', () => {
      const configNoRedis = {
        jwt: testConfig.jwt,
        aws: testConfig.aws
      }
      const auth = new PineappleAuth(configNoRedis)
      expect(auth).toBeInstanceOf(PineappleAuth)
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
      
      await authMiddleware.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('should reject requests without authorization header', async () => {
      delete mockReq.headers!.authorization
      
      await authMiddleware.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Missing or invalid Authorization header' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should reject malformed authorization header', async () => {
      mockReq.headers!.authorization = 'Invalid format'
      
      await authMiddleware.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Missing or invalid Authorization header' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should successfully validate valid JWT token', async () => {
      mockJWT.verify.mockReturnValue(decodedToken as any)
      mockRedisClient.get.mockResolvedValue(null)
      
      await authMiddleware.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockJWT.verify).toHaveBeenCalledWith(validToken, testConfig.jwt.secret, {
        issuer: testConfig.jwt.issuer,
        audience: 'pineapple-services'
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
      
      await authMiddleware.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
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
      
      await authMiddleware.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Invalid token' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should reject revoked JWT token', async () => {
      mockJWT.verify.mockReturnValue(decodedToken as any)
      mockRedisClient.get.mockResolvedValue('revoked')
      
      await authMiddleware.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRedisClient.get).toHaveBeenCalledWith(`revoked:${decodedToken.jti}`)
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Token has been revoked' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle Redis errors and return appropriate error', async () => {
      mockJWT.verify.mockReturnValue(decodedToken as any)
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'))
      
      await authMiddleware.validateJWT(mockReq as Request, mockRes as Response, mockNext)
      
      // When Redis fails, the middleware returns an error status
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Invalid token' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('validateServiceAuth', () => {
    const validAuthHeader = 'AWS4-HMAC-SHA256 Credential=service1/20241201/us-east-1/pineapple/aws4_request, SignedHeaders=host;x-amz-date, Signature=abc123'
    
    beforeEach(() => {
      mockReq.headers = {
        authorization: validAuthHeader,
        'x-pineapple-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-pineapple-nonce': 'test-nonce'
      }
    })

    it('should bypass OPTIONS requests', async () => {
      mockReq.method = 'OPTIONS'
      
      await authMiddleware.validateServiceAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('should reject requests without service auth header', async () => {
      delete mockReq.headers!.authorization
      
      await authMiddleware.validateServiceAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Missing or invalid service authorization' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should reject requests with invalid timestamp', async () => {
      mockReq.headers!['x-pineapple-timestamp'] = (Math.floor(Date.now() / 1000) - 400).toString()
      
      await authMiddleware.validateServiceAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Request timestamp outside valid window' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should reject requests without nonce', async () => {
      delete mockReq.headers!['x-pineapple-nonce']
      
      await authMiddleware.validateServiceAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Missing request nonce' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should successfully validate service auth', async () => {
      mockRedisClient.get.mockResolvedValue(null)
      mockRedisClient.setEx.mockResolvedValue('OK')
      
      await authMiddleware.validateServiceAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockReq.auth).toEqual({
        userId: 'service1',
        email: 'service1@service.pineapple.internal',
        role: 'service',
        permissions: ['service:*'],
        tokenId: 'test-nonce',
        type: 'service'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should reject replay attacks', async () => {
      mockRedisClient.get.mockResolvedValue('used')
      
      await authMiddleware.validateServiceAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Request nonce already used' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('validateAnyAuth', () => {
    it('should route to JWT validation for Bearer tokens', async () => {
      mockReq.headers = { authorization: 'Bearer token123' }
      const spy = jest.spyOn(authMiddleware, 'validateJWT')
      
      await authMiddleware.validateAnyAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(spy).toHaveBeenCalled()
    })

    it('should route to service validation for AWS4 tokens', async () => {
      mockReq.headers = { authorization: 'AWS4-HMAC-SHA256 Credential=test' }
      const spy = jest.spyOn(authMiddleware, 'validateServiceAuth')
      
      await authMiddleware.validateAnyAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(spy).toHaveBeenCalled()
    })

    it('should reject invalid auth types', async () => {
      mockReq.headers = { authorization: 'Basic credentials' }
      
      await authMiddleware.validateAnyAuth(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'No valid authentication provided' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('revokeToken', () => {
    it('should revoke token with Redis', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK')
      
      await authMiddleware.revokeToken('token123', 3600)
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith('revoked:token123', 3600, 'true')
    })

    it('should throw error without Redis', async () => {
      const authNoRedis = new PineappleAuth({
        jwt: testConfig.jwt,
        aws: testConfig.aws
      })
      
      await expect(authNoRedis.revokeToken('token123')).rejects.toThrow('Redis not configured for token revocation')
    })
  })

  describe('createAuthMiddleware factory', () => {
    it('should create PineappleAuth instance', () => {
      const middleware = createAuthMiddleware(testConfig)
      expect(middleware).toBeInstanceOf(PineappleAuth)
    })
  })
})