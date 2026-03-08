import express, { Request, Response } from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { PineappleAuth } from '../../src/middleware/auth.middleware'
import { PineappleAuthClient } from '../../src/client/auth.client'
import { PublicAuthMiddleware } from '../../src/middleware/public-auth.middleware'
import { InternalServiceClient } from '../../src/client/internal-service.client'

// Mock Redis for integration tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK'),
  })),
}))

describe('Auth Flow Integration Tests', () => {
  let app: express.Application
  let authClient: PineappleAuthClient
  let authMiddleware: PineappleAuth
  let publicAuthMiddleware: PublicAuthMiddleware
  let internalServiceClient: InternalServiceClient

  const testConfig = {
    jwt: {
      secret: 'test-jwt-secret',
      issuer: 'test-issuer'
    },
    aws: {
      region: 'us-east-1',
      service: 'pineapple'
    }
  }

  const clientConfig = {
    jwt: {
      accessSecret: testConfig.jwt.secret,
      refreshSecret: 'test-refresh-secret',
      issuer: testConfig.jwt.issuer
    }
  }

  beforeAll(() => {
    authClient = new PineappleAuthClient(clientConfig)
    authMiddleware = new PineappleAuth(testConfig)
    publicAuthMiddleware = new PublicAuthMiddleware(testConfig)
    internalServiceClient = new InternalServiceClient('test-service')

    // Setup Express app
    app = express()
    app.use(express.json())

    // Protected route using full auth (JWT + Service)
    app.get('/protected', authMiddleware.validateAnyAuth, (req: Request, res: Response) => {
      res.json({ 
        success: true, 
        user: req.auth,
        message: 'Access granted to protected resource'
      })
    })

    // JWT-only protected route (public service)
    app.get('/public-protected', publicAuthMiddleware.validateJWT, (req: Request, res: Response) => {
      res.json({ 
        success: true, 
        user: req.auth,
        message: 'Access granted to public protected resource'
      })
    })

    // Service-only protected route
    app.get('/service-only', authMiddleware.validateServiceAuth, (req: Request, res: Response) => {
      res.json({ 
        success: true, 
        user: req.auth,
        message: 'Access granted to service-only resource'
      })
    })

    // JWT-only protected route
    app.get('/jwt-only', authMiddleware.validateJWT, (req: Request, res: Response) => {
      res.json({ 
        success: true, 
        user: req.auth,
        message: 'Access granted to JWT-only resource'
      })
    })

    // Unprotected route
    app.get('/public', (req: Request, res: Response) => {
      res.json({ success: true, message: 'Public access' })
    })
  })

  describe('JWT Authentication Flow', () => {
    let validTokens: any

    beforeAll(() => {
      validTokens = authClient.generateUserTokens(
        'user123',
        'test@example.com',
        'admin',
        ['read', 'write']
      )
    })

    it('should allow access with valid JWT token', async () => {
      const response = await request(app)
        .get('/jwt-only')
        .set('Authorization', `Bearer ${validTokens.accessToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        user: {
          userId: 'user123',
          email: 'test@example.com',
          role: 'admin',
          permissions: ['read', 'write'],
          tokenId: validTokens.tokenId,
          type: 'jwt'
        },
        message: 'Access granted to JWT-only resource'
      })
    })

    it('should allow access to public protected route with valid JWT', async () => {
      const response = await request(app)
        .get('/public-protected')
        .set('Authorization', `Bearer ${validTokens.accessToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.user.userId).toBe('user123')
    })

    it('should reject access with invalid JWT token', async () => {
      const response = await request(app)
        .get('/jwt-only')
        .set('Authorization', 'Bearer invalid.jwt.token')

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'Invalid token' }
      })
    })

    it('should reject access without JWT token', async () => {
      const response = await request(app)
        .get('/jwt-only')

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'Missing or invalid Authorization header' }
      })
    })

    it('should reject expired JWT token', async () => {
      const expiredToken = jwt.sign(
        {
          userId: 'user123',
          email: 'test@example.com',
          jti: 'expired-token'
        },
        testConfig.jwt.secret,
        {
          expiresIn: '-1h', // Expired 1 hour ago
          issuer: testConfig.jwt.issuer,
          audience: 'pineapple-services'
        }
      )

      const response = await request(app)
        .get('/jwt-only')
        .set('Authorization', `Bearer ${expiredToken}`)

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'Token expired' }
      })
    })
  })

  describe('Service Authentication Flow', () => {
    it('should allow access with valid service auth headers', async () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const nonce = 'test-nonce-' + Date.now()

      const response = await request(app)
        .get('/service-only')
        .set('Authorization', 'AWS4-HMAC-SHA256 Credential=test-service/20241201/us-east-1/pineapple/aws4_request, SignedHeaders=host;x-amz-date, Signature=abc123')
        .set('X-Pineapple-Timestamp', timestamp.toString())
        .set('X-Pineapple-Nonce', nonce)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        user: {
          userId: 'test-service',
          email: 'test-service@service.pineapple.internal',
          role: 'service',
          permissions: ['service:*'],
          tokenId: nonce,
          type: 'service'
        },
        message: 'Access granted to service-only resource'
      })
    })

    it('should reject service auth with old timestamp', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400 // 400 seconds ago
      const nonce = 'test-nonce-' + Date.now()

      const response = await request(app)
        .get('/service-only')
        .set('Authorization', 'AWS4-HMAC-SHA256 Credential=test-service/20241201/us-east-1/pineapple/aws4_request')
        .set('X-Pineapple-Timestamp', oldTimestamp.toString())
        .set('X-Pineapple-Nonce', nonce)

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'Request timestamp outside valid window' }
      })
    })

    it('should reject service auth without nonce', async () => {
      const timestamp = Math.floor(Date.now() / 1000)

      const response = await request(app)
        .get('/service-only')
        .set('Authorization', 'AWS4-HMAC-SHA256 Credential=test-service/20241201/us-east-1/pineapple/aws4_request')
        .set('X-Pineapple-Timestamp', timestamp.toString())

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'Missing request nonce' }
      })
    })

    it('should reject invalid service auth format', async () => {
      const response = await request(app)
        .get('/service-only')
        .set('Authorization', 'Bearer some-jwt-token')

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'Missing or invalid service authorization' }
      })
    })
  })

  describe('Mixed Authentication Flow', () => {
    let validTokens: any

    beforeAll(() => {
      validTokens = authClient.generateUserTokens('user123', 'test@example.com')
    })

    it('should allow JWT access to mixed auth endpoint', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validTokens.accessToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.user.type).toBe('jwt')
    })

    it('should allow service access to mixed auth endpoint', async () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const nonce = 'test-nonce-mixed-' + Date.now()

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'AWS4-HMAC-SHA256 Credential=test-service/20241201/us-east-1/pineapple/aws4_request')
        .set('X-Pineapple-Timestamp', timestamp.toString())
        .set('X-Pineapple-Nonce', nonce)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.user.type).toBe('service')
    })

    it('should reject invalid auth type to mixed auth endpoint', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Basic dXNlcjpwYXNz')

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'No valid authentication provided' }
      })
    })
  })

  describe('OPTIONS Request Handling', () => {
    it('should allow OPTIONS requests to JWT protected routes', async () => {
      const response = await request(app)
        .options('/jwt-only')

      expect(response.status).toBe(200)
    })

    it('should allow OPTIONS requests to service protected routes', async () => {
      const response = await request(app)
        .options('/service-only')

      expect(response.status).toBe(200)
    })

    it('should allow OPTIONS requests to mixed auth routes', async () => {
      const response = await request(app)
        .options('/protected')

      expect(response.status).toBe(200)
    })
  })

  describe('Public Access', () => {
    it('should allow access to unprotected routes', async () => {
      const response = await request(app)
        .get('/public')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        message: 'Public access'
      })
    })
  })

  describe('Token Generation Integration', () => {
    it('should generate valid tokens that work with middleware', async () => {
      const tokens = authClient.generateUserTokens(
        'integration-user',
        'integration@test.com',
        'user',
        ['integration-test']
      )

      expect(tokens.accessToken).toBeTruthy()
      expect(tokens.refreshToken).toBeTruthy()
      expect(tokens.tokenId).toBeTruthy()

      // Verify the token works with middleware
      const response = await request(app)
        .get('/jwt-only')
        .set('Authorization', `Bearer ${tokens.accessToken}`)

      expect(response.status).toBe(200)
      expect(response.body.user).toEqual({
        userId: 'integration-user',
        email: 'integration@test.com',
        role: 'user',
        permissions: ['integration-test'],
        tokenId: tokens.tokenId,
        type: 'jwt'
      })
    })

    it('should generate tokens with minimal user data', async () => {
      const tokens = authClient.generateUserTokens('minimal-user', 'minimal@test.com')

      const response = await request(app)
        .get('/jwt-only')
        .set('Authorization', `Bearer ${tokens.accessToken}`)

      expect(response.status).toBe(200)
      expect(response.body.user).toEqual({
        userId: 'minimal-user',
        email: 'minimal@test.com',
        role: undefined,
        permissions: [],
        tokenId: tokens.tokenId,
        type: 'jwt'
      })
    })
  })

  describe('Error Handling Integration', () => {
    it('should handle malformed JWT gracefully', async () => {
      const response = await request(app)
        .get('/jwt-only')
        .set('Authorization', 'Bearer not.a.valid.jwt.token.format')

      expect(response.status).toBe(403)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toBeTruthy()
    })

    it('should handle missing auth header gracefully', async () => {
      const response = await request(app)
        .get('/protected')

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'No valid authentication provided' }
      })
    })

    it('should handle JWT with wrong issuer', async () => {
      const wrongIssuerToken = jwt.sign(
        {
          userId: 'user123',
          email: 'test@example.com',
          jti: 'wrong-issuer-token'
        },
        testConfig.jwt.secret,
        {
          expiresIn: '1h',
          issuer: 'wrong-issuer',
          audience: 'pineapple-services'
        }
      )

      const response = await request(app)
        .get('/jwt-only')
        .set('Authorization', `Bearer ${wrongIssuerToken}`)

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        success: false,
        error: { message: 'Invalid token' }
      })
    })
  })
})