import jwt from 'jsonwebtoken'
import { STS } from '@aws-sdk/client-sts'
import aws4 from 'aws4'
import { PineappleAuthClient } from '../../src/client/auth.client'

// Mock dependencies
jest.mock('jsonwebtoken')
jest.mock('@aws-sdk/client-sts')
jest.mock('aws4')

const mockJWT = jwt as jest.Mocked<typeof jwt>
const mockAWS4 = aws4 as jest.Mocked<typeof aws4>
const mockSTS = STS as jest.MockedClass<typeof STS>

describe('PineappleAuthClient', () => {
  let authClient: PineappleAuthClient
  let mockSTSInstance: jest.Mocked<STS>

  const testConfig = {
    jwt: {
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
      issuer: 'test-issuer'
    },
    aws: {
      region: 'us-east-1',
      roleArn: 'arn:aws:iam::123456789012:role/test-role'
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockSTSInstance = {
      assumeRole: jest.fn()
    } as any

    mockSTS.mockImplementation(() => mockSTSInstance)
    authClient = new PineappleAuthClient(testConfig)
  })

  describe('constructor', () => {
    it('should initialize with JWT config only', () => {
      const clientJWTOnly = new PineappleAuthClient({ jwt: testConfig.jwt })
      expect(clientJWTOnly).toBeInstanceOf(PineappleAuthClient)
    })

    it('should initialize with AWS config only', () => {
      const clientAWSOnly = new PineappleAuthClient({ aws: testConfig.aws })
      expect(clientAWSOnly).toBeInstanceOf(PineappleAuthClient)
    })

    it('should initialize STS client when AWS config provided', () => {
      expect(mockSTS).toHaveBeenCalledWith({ region: testConfig.aws.region })
    })
  })

  describe('generateUserTokens', () => {
    const testUser = {
      userId: 'user123',
      email: 'test@example.com',
      role: 'user',
      permissions: ['read', 'write']
    }

    beforeEach(() => {
      ;(mockJWT.sign as jest.Mock)
        .mockReturnValueOnce('mock.access.token')
        .mockReturnValueOnce('mock.refresh.token')
    })

    it('should generate JWT tokens for user', () => {
      const tokens = authClient.generateUserTokens(
        testUser.userId,
        testUser.email,
        testUser.role,
        testUser.permissions
      )

      expect(tokens.accessToken).toBe('mock.access.token')
      expect(tokens.refreshToken).toBe('mock.refresh.token')
      expect(tokens.tokenId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it('should call jwt.sign with correct parameters for access token', () => {
      authClient.generateUserTokens(testUser.userId, testUser.email, testUser.role, testUser.permissions)

      expect(mockJWT.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: testUser.userId,
          email: testUser.email,
          role: testUser.role,
          permissions: testUser.permissions,
          jti: expect.any(String)
        }),
        testConfig.jwt.accessSecret,
        {
          expiresIn: '15m',
          issuer: testConfig.jwt.issuer,
          audience: 'pineapple-services',
          subject: testUser.userId
        }
      )
    })

    it('should call jwt.sign with correct parameters for refresh token', () => {
      authClient.generateUserTokens(testUser.userId, testUser.email, testUser.role, testUser.permissions)

      expect(mockJWT.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: testUser.userId,
          jti: expect.any(String)
        }),
        testConfig.jwt.refreshSecret,
        {
          expiresIn: '30d',
          issuer: testConfig.jwt.issuer,
          audience: 'pineapple-refresh',
          subject: testUser.userId
        }
      )
    })

    it('should generate tokens without optional parameters', () => {
      const tokens = authClient.generateUserTokens(testUser.userId, testUser.email)

      expect(tokens.accessToken).toBe('mock.access.token')
      expect(tokens.refreshToken).toBe('mock.refresh.token')
      expect(tokens.tokenId).toBeDefined()
    })

    it('should throw error when JWT config not provided', () => {
      const clientNoJWT = new PineappleAuthClient({ aws: testConfig.aws })
      
      expect(() => {
        clientNoJWT.generateUserTokens(testUser.userId, testUser.email)
      }).toThrow('JWT config not provided')
    })
  })

  describe('signServiceRequest', () => {
    const mockCredentials = {
      AccessKeyId: 'AKIATEST',
      SecretAccessKey: 'test-secret',
      SessionToken: 'test-session-token',
      Expiration: new Date(Date.now() + 3600000)
    }

    const requestOptions = {
      method: 'POST',
      url: 'https://api.example.com/test',
      body: '{"data":"test"}',
      headers: { 'Custom-Header': 'value' }
    }

    beforeEach(() => {
      ;(mockSTSInstance.assumeRole as jest.Mock).mockResolvedValue({
        Credentials: mockCredentials
      })

      mockAWS4.sign.mockReturnValue({
        headers: {
          authorization: 'AWS4-HMAC-SHA256 test-signature',
          'x-amz-date': '20241201T120000Z',
          host: 'api.example.com'
        }
      })
    })

    it('should sign service request successfully', async () => {
      const result = await authClient.signServiceRequest('test-service', requestOptions)

      expect(result.headers).toEqual({
        authorization: 'AWS4-HMAC-SHA256 test-signature',
        'x-amz-date': '20241201T120000Z',
        host: 'api.example.com'
      })
      expect(result.body).toBe(requestOptions.body)
    })

    it('should call STS assumeRole with correct parameters', async () => {
      await authClient.signServiceRequest('test-service', requestOptions)

      expect(mockSTSInstance.assumeRole).toHaveBeenCalledWith({
        RoleArn: `${testConfig.aws.roleArn}-test-service`,
        RoleSessionName: expect.stringMatching(/^test-service-\d+$/),
        DurationSeconds: 3600
      })
    })

    it('should call aws4.sign with correct parameters', async () => {
      await authClient.signServiceRequest('test-service', requestOptions)

      expect(mockAWS4.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'pineapple',
          region: testConfig.aws.region,
          method: 'POST',
          path: '/test',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Pineapple-Timestamp': expect.any(String),
            'X-Pineapple-Nonce': expect.any(String),
            'Custom-Header': 'value'
          }),
          body: requestOptions.body,
          host: 'api.example.com'
        }),
        {
          accessKeyId: mockCredentials.AccessKeyId,
          secretAccessKey: mockCredentials.SecretAccessKey,
          sessionToken: mockCredentials.SessionToken
        }
      )
    })

    it('should handle URL with query parameters', async () => {
      const requestWithQuery = {
        ...requestOptions,
        url: 'https://api.example.com/test?param=value&other=123'
      }

      await authClient.signServiceRequest('test-service', requestWithQuery)

      expect(mockAWS4.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test?param=value&other=123'
        }),
        expect.any(Object)
      )
    })

    it('should cache credentials and reuse them', async () => {
      // First call
      await authClient.signServiceRequest('test-service', requestOptions)
      
      // Second call within cache window
      await authClient.signServiceRequest('test-service', requestOptions)

      expect(mockSTSInstance.assumeRole).toHaveBeenCalledTimes(1)
    })

    it('should refresh expired credentials', async () => {
      // Mock expired credentials
      const expiredCredentials = {
        ...mockCredentials,
        Expiration: new Date(Date.now() - 1000) // Expired 1 second ago
      }

      ;(mockSTSInstance.assumeRole as jest.Mock)
        .mockResolvedValueOnce({ Credentials: expiredCredentials })
        .mockResolvedValueOnce({ Credentials: mockCredentials })

      // First call with expired credentials
      await authClient.signServiceRequest('test-service', requestOptions)
      
      // Second call should refresh credentials
      await authClient.signServiceRequest('test-service', requestOptions)

      expect(mockSTSInstance.assumeRole).toHaveBeenCalledTimes(2)
    })

    it('should throw error when AWS config not provided', async () => {
      const clientNoAWS = new PineappleAuthClient({ jwt: testConfig.jwt })

      await expect(
        clientNoAWS.signServiceRequest('test-service', requestOptions)
      ).rejects.toThrow('AWS config not provided')
    })

    it('should throw error when STS assumeRole fails', async () => {
      ;(mockSTSInstance.assumeRole as jest.Mock).mockRejectedValue(new Error('STS error'))

      await expect(
        authClient.signServiceRequest('test-service', requestOptions)
      ).rejects.toThrow('Failed to get service credentials: Error: STS error')
    })

    it('should throw error when STS returns no credentials', async () => {
      ;(mockSTSInstance.assumeRole as jest.Mock).mockResolvedValue({})

      await expect(
        authClient.signServiceRequest('test-service', requestOptions)
      ).rejects.toThrow('Failed to assume role')
    })

    it('should handle requests without body', async () => {
      const getRequest = {
        method: 'GET',
        url: 'https://api.example.com/test'
      }

      await authClient.signServiceRequest('test-service', getRequest)

      expect(mockAWS4.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          body: ''
        }),
        expect.any(Object)
      )
    })

    it('should handle non-string header values in aws4 response', async () => {
      mockAWS4.sign.mockReturnValue({
        headers: {
          authorization: 'AWS4-HMAC-SHA256 test-signature',
          'x-amz-date': '20241201T120000Z',
          'content-length': 123, // Non-string value
          host: 'api.example.com'
        }
      })

      const result = await authClient.signServiceRequest('test-service', requestOptions)

      expect(result.headers).toEqual({
        authorization: 'AWS4-HMAC-SHA256 test-signature',
        'x-amz-date': '20241201T120000Z',
        host: 'api.example.com'
        // content-length should be filtered out as it's not a string
      })
    })
  })
})