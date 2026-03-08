import axios from 'axios'
import { InternalServiceClient } from '../../src/client/internal-service.client'

// Mock dependencies
jest.mock('axios')
const mockAxios = axios as jest.MockedFunction<typeof axios>

describe('InternalServiceClient', () => {
  let client: InternalServiceClient
  const serviceName = 'test-service'
  
  beforeEach(() => {
    // Reset environment variables before creating client
    process.env.INTERNAL_API_KEY = 'test-api-key'
    process.env.INTERNAL_API_SECRET = 'test-api-secret'
    process.env.PINEAPPLE_API_URL = 'https://api.test.com'
    
    client = new InternalServiceClient(serviceName)
    jest.clearAllMocks()
  })

  afterEach(() => {
    // Clean up environment variables
    delete process.env.INTERNAL_API_KEY
    delete process.env.INTERNAL_API_SECRET
    delete process.env.PINEAPPLE_API_URL
  })

  describe('constructor', () => {
    it('should initialize with provided service name', () => {
      const testClient = new InternalServiceClient('my-service')
      expect(testClient).toBeInstanceOf(InternalServiceClient)
    })

    it('should use environment variables for API credentials', () => {
      const testClient = new InternalServiceClient('my-service')
      expect(testClient).toBeInstanceOf(InternalServiceClient)
    })

    it('should use default credentials when environment variables not set', () => {
      delete process.env.INTERNAL_API_KEY
      delete process.env.INTERNAL_API_SECRET
      
      const testClient = new InternalServiceClient('my-service')
      expect(testClient).toBeInstanceOf(InternalServiceClient)
    })
  })

  describe('callInternalService', () => {
    const endpoint = '/test-endpoint'
    const testData = { test: 'data' }
    const mockResponse = { data: { success: true } }

    beforeEach(() => {
      mockAxios.mockResolvedValue(mockResponse)
      
      // Mock Date.now and crypto for consistent timestamps and nonces
      jest.spyOn(Date, 'now').mockReturnValue(1640995200000) // 2022-01-01T00:00:00.000Z
      jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('test-uuid-123')
      jest.spyOn(require('crypto'), 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('mocked-hash-signature')
      })
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should make GET request with proper authentication headers', async () => {
      const result = await client.callInternalService(endpoint, 'GET')

      expect(mockAxios).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.test.com/test-endpoint',
        headers: {
          'Authorization': 'PINEAPPLE-INTERNAL key=test-api-key timestamp=1640995200 nonce=test-uuid-123 signature=MOCKED-HASH-SIGNATURE',
          'Content-Type': 'application/json',
          'X-Service-Name': serviceName
        },
        data: undefined
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('should make POST request with data', async () => {
      const result = await client.callInternalService(endpoint, 'POST', testData)

      expect(mockAxios).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://api.test.com/test-endpoint',
        headers: {
          'Authorization': 'PINEAPPLE-INTERNAL key=test-api-key timestamp=1640995200 nonce=test-uuid-123 signature=MOCKED-HASH-SIGNATURE',
          'Content-Type': 'application/json',
          'X-Service-Name': serviceName
        },
        data: JSON.stringify(testData)
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('should use default GET method when not specified', async () => {
      await client.callInternalService(endpoint)

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET'
        })
      )
    })

    it('should use default base URL when environment variable not set', async () => {
      delete process.env.PINEAPPLE_API_URL
      
      await client.callInternalService(endpoint)

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:3000/test-endpoint'
        })
      )
    })

    it('should generate correct signature', async () => {
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('computed-signature')
      }
      jest.spyOn(require('crypto'), 'createHash').mockReturnValue(mockHash)

      await client.callInternalService(endpoint)

      expect(mockHash.update).toHaveBeenCalledWith('test-api-key:1640995200:test-uuid-123:test-api-secret')
      expect(mockHash.digest).toHaveBeenCalledWith('hex')
    })

    it('should handle axios errors', async () => {
      const error = new Error('Network error')
      mockAxios.mockRejectedValue(error)
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await expect(client.callInternalService(endpoint)).rejects.toThrow('Network error')
      
      consoleSpy.mockRestore()
    })

    it('should support all HTTP methods', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const
      
      for (const method of methods) {
        await client.callInternalService(endpoint, method, testData)
        
        expect(mockAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            method
          })
        )
      }
    })

    it('should handle requests without data', async () => {
      await client.callInternalService(endpoint, 'GET')

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: undefined
        })
      )
    })

    it('should stringify data when provided', async () => {
      const complexData = {
        nested: {
          object: true,
          array: [1, 2, 3]
        }
      }

      await client.callInternalService(endpoint, 'POST', complexData)

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: JSON.stringify(complexData)
        })
      )
    })

    it('should generate unique nonce for each request', async () => {
      const mockUUIDs = ['uuid-1', 'uuid-2', 'uuid-3']
      let callCount = 0
      
      jest.spyOn(require('crypto'), 'randomUUID').mockImplementation(() => {
        return mockUUIDs[callCount++]
      })

      await client.callInternalService(endpoint)
      await client.callInternalService(endpoint)
      await client.callInternalService(endpoint)

      expect(mockAxios).toHaveBeenNthCalledWith(1, 
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('nonce=uuid-1')
          })
        })
      )
      expect(mockAxios).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('nonce=uuid-2')
          })
        })
      )
      expect(mockAxios).toHaveBeenNthCalledWith(3,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('nonce=uuid-3')
          })
        })
      )
    })
  })

  describe('callAuthService', () => {
    it('should call internal service with auth prefix', async () => {
      const mockResponse = { data: { user: 'test' } }
      mockAxios.mockResolvedValue(mockResponse)
      
      const spy = jest.spyOn(client, 'callInternalService')
      
      const result = await client.callAuthService('/validate', { userId: '123' })

      expect(spy).toHaveBeenCalledWith('/internal/auth/validate', 'POST', { userId: '123' })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('validateUserSession', () => {
    it('should call auth service with validate-session endpoint', async () => {
      const mockResponse = { data: { valid: true } }
      mockAxios.mockResolvedValue(mockResponse)
      
      const spy = jest.spyOn(client, 'callAuthService')
      
      const result = await client.validateUserSession('user123')

      expect(spy).toHaveBeenCalledWith('/validate-session', { userId: 'user123' })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('getUserProfile', () => {
    it('should call auth service with user-profile endpoint', async () => {
      const mockResponse = { data: { profile: { name: 'Test User' } } }
      mockAxios.mockResolvedValue(mockResponse)
      
      const spy = jest.spyOn(client, 'callAuthService')
      
      const result = await client.getUserProfile('user123')

      expect(spy).toHaveBeenCalledWith('/user-profile', { userId: 'user123' })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('error handling', () => {
    it('should log and rethrow axios errors', async () => {
      const error = new Error('Request failed with status code 500')
      
      mockAxios.mockRejectedValue(error)
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await expect(client.callInternalService('/test')).rejects.toThrow('Request failed with status code 500')
      
      expect(consoleSpy).toHaveBeenCalledWith('Internal service call failed: Request failed with status code 500')
      
      consoleSpy.mockRestore()
    })

    it('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED')
      mockAxios.mockRejectedValue(networkError)
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await expect(client.callInternalService('/test')).rejects.toThrow('ECONNREFUSED')
      
      expect(consoleSpy).toHaveBeenCalledWith('Internal service call failed: ECONNREFUSED')
      
      consoleSpy.mockRestore()
    })
  })

  describe('authentication signature', () => {
    it('should create consistent signatures for same inputs', async () => {
      mockAxios.mockResolvedValue({ data: { success: true } })
      
      // Fix timestamp and UUID for consistency
      jest.spyOn(Date, 'now').mockReturnValue(1640995200000)
      jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('consistent-uuid')
      
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('consistent-signature')
      }
      jest.spyOn(require('crypto'), 'createHash').mockReturnValue(mockHash)
      
      await client.callInternalService('/test')
      await client.callInternalService('/test')
      
      expect(mockHash.update).toHaveBeenCalledTimes(2)
      expect(mockHash.update).toHaveBeenCalledWith('test-api-key:1640995200:consistent-uuid:test-api-secret')
      expect(mockHash.digest).toHaveBeenCalledTimes(2)
      expect(mockHash.digest).toHaveBeenCalledWith('hex')
    })

    it('should use uppercase signature in authorization header', async () => {
      mockAxios.mockResolvedValue({ data: { success: true } })
      
      jest.spyOn(require('crypto'), 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('abcd1234')
      })

      await client.callInternalService('/test')

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('signature=ABCD1234')
          })
        })
      )
    })
  })
})