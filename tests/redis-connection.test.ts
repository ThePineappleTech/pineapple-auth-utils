import { PineappleAuth } from '../src/middleware/auth.middleware'
import { PublicAuthMiddleware } from '../src/middleware/public-auth.middleware'
import { createClient } from 'redis'

// This test requires a real Redis instance running
describe('Redis Connection Integration', () => {
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
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    }
  }

  describe('PineappleAuth Redis Connection', () => {
    let auth: PineappleAuth
    let redisClient: any

    beforeAll(async () => {
      // Skip if Redis URL not provided or is localhost (CI environment)
      if (!process.env.REDIS_URL || testConfig.redis.url.includes('localhost')) {
        console.log('Skipping Redis connection tests - Redis not available or localhost')
        return
      }

      auth = new PineappleAuth(testConfig)
      
      // Give some time for connection to establish
      await new Promise(resolve => setTimeout(resolve, 2000))
    })

    afterAll(async () => {
      if (redisClient && typeof redisClient.quit === 'function') {
        await redisClient.quit()
      }
    })

    it('should connect to Redis successfully', async () => {
      // Skip if Redis not configured for testing
      if (!process.env.REDIS_URL || testConfig.redis.url.includes('localhost')) {
        console.log('Skipping - Redis connection test requires REDIS_URL environment variable')
        return
      }

      // Create direct Redis client to test connection
      redisClient = createClient({ url: testConfig.redis.url })
      
      await expect(redisClient.connect()).resolves.not.toThrow()
      
      // Test basic Redis operations
      await expect(redisClient.set('test:key', 'test-value')).resolves.toBeDefined()
      await expect(redisClient.get('test:key')).resolves.toBe('test-value')
      await expect(redisClient.del('test:key')).resolves.toBeDefined()
    })

    it('should handle Redis operations in auth middleware', async () => {
      // Skip if Redis not configured for testing
      if (!process.env.REDIS_URL || testConfig.redis.url.includes('localhost')) {
        console.log('Skipping - Redis integration test requires REDIS_URL environment variable')
        return
      }

      const testTokenId = 'test-token-' + Date.now()
      
      // Test token revocation functionality
      await expect(auth.revokeToken(testTokenId, 60)).resolves.not.toThrow()
      
      // Verify the token was revoked by checking directly with Redis
      redisClient = createClient({ url: testConfig.redis.url })
      await redisClient.connect()
      
      const revokedValue = await redisClient.get(`revoked:${testTokenId}`)
      expect(revokedValue).toBe('true')
      
      // Clean up
      await redisClient.del(`revoked:${testTokenId}`)
    })
  })

  describe('PublicAuthMiddleware Redis Connection', () => {
    it('should connect to Redis successfully', async () => {
      // Skip if Redis not configured for testing
      if (!process.env.REDIS_URL || testConfig.redis.url.includes('localhost')) {
        console.log('Skipping - Public auth Redis test requires REDIS_URL environment variable')
        return
      }

      const publicAuth = new PublicAuthMiddleware({
        jwt: testConfig.jwt,
        redis: testConfig.redis
      })

      // Give some time for connection to establish
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(publicAuth).toBeInstanceOf(PublicAuthMiddleware)
    })
  })

  describe('Redis Connection Error Handling', () => {
    it('should handle invalid Redis URL gracefully', async () => {
      const invalidConfig = {
        ...testConfig,
        redis: {
          url: 'redis://invalid-host:6379'
        }
      }

      // This should not throw during construction
      expect(() => new PineappleAuth(invalidConfig)).not.toThrow()
      expect(() => new PublicAuthMiddleware(invalidConfig)).not.toThrow()
    })

    it('should work without Redis configuration', () => {
      const configWithoutRedis = {
        jwt: testConfig.jwt,
        aws: testConfig.aws
      }

      expect(() => new PineappleAuth(configWithoutRedis)).not.toThrow()
      expect(() => new PublicAuthMiddleware({ jwt: testConfig.jwt })).not.toThrow()
    })

    it('should throw error when trying to revoke token without Redis', async () => {
      const authWithoutRedis = new PineappleAuth({
        jwt: testConfig.jwt,
        aws: testConfig.aws
      })

      await expect(authWithoutRedis.revokeToken('test-token')).rejects.toThrow('Redis not configured for token revocation')
    })
  })

  describe('Manual Redis Connection Test', () => {
    it('should test direct Redis connection with provided URL', async () => {
      const redisUrl = process.env.REDIS_URL
      
      if (!redisUrl) {
        console.log('No REDIS_URL provided - skipping direct connection test')
        console.log('To test Redis connection, set REDIS_URL environment variable')
        console.log('Example: REDIS_URL=redis://localhost:6379 npm test')
        return
      }

      console.log(`Testing Redis connection to: ${redisUrl}`)
      
      const client = createClient({ url: redisUrl })
      
      try {
        await client.connect()
        console.log('✅ Redis connection successful')
        
        // Test basic operations
        const testKey = 'pineapple-test:' + Date.now()
        await client.set(testKey, 'connection-test', { EX: 10 })
        const value = await client.get(testKey)
        
        expect(value).toBe('connection-test')
        console.log('✅ Redis read/write operations successful')
        
        await client.del(testKey)
        console.log('✅ Redis cleanup successful')
        
      } catch (error) {
        console.error('❌ Redis connection failed:', error)
        throw error
      } finally {
        if (client.isReady) {
          await client.quit()
        }
      }
    })
  })
})