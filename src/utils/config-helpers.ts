import type { AuthConfig, RedisConfig } from '../index'

/**
 * Creates a standardized auth configuration with flexible Redis options
 */
export function createAuthConfig(options: {
  jwt?: {
    secret?: string
    issuer?: string
  }
  aws?: {
    region?: string
    service?: string
  }
  redis?: RedisConfig | string
  environment?: 'development' | 'staging' | 'production'
}): AuthConfig {
  const env = options.environment || process.env.NODE_ENV || 'development'
  
  // Default configurations per environment
  const defaults = {
    development: {
      jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
        issuer: process.env.JWT_ISSUER || 'pineapple-dev'
      },
      aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'pineapple'
      }
    },
    staging: {
      jwt: {
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER || 'pineapple-staging'
      },
      aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'pineapple'
      }
    },
    production: {
      jwt: {
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER || 'pineapple'
      },
      aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'pineapple'
      }
    }
  }

  const config: AuthConfig = {
    jwt: {
      secret: options.jwt?.secret || defaults[env].jwt.secret,
      issuer: options.jwt?.issuer || defaults[env].jwt.issuer
    },
    aws: {
      region: options.aws?.region || defaults[env].aws.region,
      service: options.aws?.service || defaults[env].aws.service
    }
  }

  // Handle Redis configuration
  if (options.redis) {
    config.redis = normalizeRedisConfig(options.redis)
  } else if (process.env.REDIS_URL) {
    config.redis = normalizeRedisConfig(process.env.REDIS_URL)
  }

  // Validate required fields
  if (!config.jwt.secret) {
    throw new Error('JWT secret is required. Set JWT_SECRET environment variable or provide jwt.secret in config.')
  }

  return config
}

/**
 * Creates configuration specifically for PublicAuthMiddleware
 */
export function createPublicAuthConfig(options: {
  jwt?: {
    secret?: string
    issuer?: string
  }
  redis?: RedisConfig | string
  environment?: 'development' | 'staging' | 'production'
}): Pick<AuthConfig, 'jwt' | 'redis'> {
  const fullConfig = createAuthConfig(options)
  return {
    jwt: fullConfig.jwt,
    redis: fullConfig.redis
  }
}

/**
 * Normalizes Redis configuration from various input formats
 */
export function normalizeRedisConfig(redis: RedisConfig | string): RedisConfig {
  if (typeof redis === 'string') {
    return { url: redis }
  }
  
  return redis
}

/**
 * Validates and builds Redis connection URL from config
 */
export function validateRedisConfig(config: RedisConfig): string {
  if (config.url) {
    // Validate URL format
    if (!config.url.startsWith('redis://') && !config.url.startsWith('rediss://')) {
      throw new Error('Redis URL must start with redis:// or rediss://')
    }
    return config.url
  }

  // Build URL from individual components
  const {
    host = 'localhost',
    port = 6379,
    username,
    password,
    db = 0
  } = config

  let url = 'redis://'
  
  if (username || password) {
    if (username && password) {
      url += `${username}:${password}@`
    } else if (password) {
      url += `:${password}@`
    } else if (username) {
      url += `${username}@`
    }
  }
  
  url += `${host}:${port}`
  
  if (db > 0) {
    url += `/${db}`
  }

  return url
}

/**
 * Gets Redis configuration from various sources with fallbacks
 */
export function getRedisConfig(): RedisConfig | null {
  // Priority order:
  // 1. REDIS_URL environment variable
  // 2. Individual Redis environment variables
  // 3. Default localhost (only in development)
  
  if (process.env.REDIS_URL) {
    return normalizeRedisConfig(process.env.REDIS_URL)
  }

  if (process.env.REDIS_HOST || process.env.REDIS_PORT) {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME,
      db: parseInt(process.env.REDIS_DB || '0', 10)
    }
  }

  // Only default to localhost in development
  if (process.env.NODE_ENV === 'development') {
    return { url: 'redis://localhost:6379' }
  }

  return null
}

/**
 * Environment-specific configuration presets
 */
export const CONFIG_PRESETS = {
  development: () => createAuthConfig({
    environment: 'development',
    redis: getRedisConfig() || undefined
  }),

  staging: () => createAuthConfig({
    environment: 'staging',
    redis: getRedisConfig() || undefined
  }),

  production: () => createAuthConfig({
    environment: 'production',
    redis: getRedisConfig() || undefined
  }),

  testing: () => createAuthConfig({
    jwt: {
      secret: 'test-secret',
      issuer: 'test-issuer'
    },
    aws: {
      region: 'us-east-1',
      service: 'pineapple'
    }
    // No Redis in testing by default
  })
}

/**
 * Quick configuration helpers for common scenarios
 */
export const ConfigHelpers = {
  /**
   * Simple configuration with just Redis URL
   */
  withRedisUrl: (redisUrl: string, jwtSecret?: string, jwtIssuer?: string) => createAuthConfig({
    jwt: {
      secret: jwtSecret,
      issuer: jwtIssuer
    },
    redis: redisUrl
  }),

  /**
   * Configuration for AWS deployment with ElastiCache
   */
  forAWS: (redisClusterEndpoint: string, region = 'us-east-1') => createAuthConfig({
    aws: { region, service: 'pineapple' },
    redis: { url: `redis://${redisClusterEndpoint}:6379` }
  }),

  /**
   * Configuration for AWS ElastiCache with advanced options
   */
  forElastiCache: (endpoint: string, options?: {
    port?: number
    tls?: boolean
    authToken?: string
    region?: string
    connectTimeout?: number
  }) => {
    const port = options?.port || (options?.tls ? 6380 : 6379)
    const protocol = options?.tls ? 'rediss' : 'redis'
    
    let url = `${protocol}://`
    if (options?.authToken) {
      url += `:${options.authToken}@`
    }
    url += `${endpoint}:${port}`

    return createAuthConfig({
      aws: { region: options?.region || 'us-east-1', service: 'pineapple' },
      redis: {
        url,
        tls: options?.tls ? {
          servername: endpoint,
          rejectUnauthorized: true
        } : false,
        connectTimeout: options?.connectTimeout || 20000,
        commandTimeout: 5000,
        retryDelayOnFailover: 100,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        retryConnect: 3
      }
    })
  },

  /**
   * Configuration for AWS ElastiCache Serverless
   */
  forElastiCacheServerless: (endpoint: string, authToken: string, region = 'us-east-1') => {
    return createAuthConfig({
      aws: { region, service: 'pineapple' },
      redis: {
        url: `rediss://:${authToken}@${endpoint}:6380`,
        tls: {
          servername: endpoint,
          rejectUnauthorized: true
        },
        connectTimeout: 20000,
        commandTimeout: 5000,
        retryDelayOnFailover: 100,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        retryConnect: 3
      }
    })
  },

  /**
   * Configuration for Valkey (Redis alternative)
   */
  forValkey: (endpoint: string, port = 6379, authToken?: string) => createAuthConfig({
    redis: {
      host: endpoint,
      port,
      password: authToken,
      protocol: 'valkey',
      connectTimeout: 10000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 3
    }
  }),

  /**
   * Configuration for Docker Compose development
   */
  forDocker: () => createAuthConfig({
    redis: { host: 'redis', port: 6379 } // Assumes redis service name in docker-compose
  }),

  /**
   * Configuration for Heroku with Redis addon
   */
  forHeroku: () => createAuthConfig({
    redis: process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDISTOGO_URL
  }),

  /**
   * Configuration without Redis (degraded mode)
   */
  withoutRedis: () => createAuthConfig({
    // No redis configuration - will work but without token revocation
  })
}