// Usage Examples for Pineapple Auth Utils with Flexible Redis Configuration

const { 
  PineappleAuth, 
  PublicAuthMiddleware,
  createAuthConfig,
  createPublicAuthConfig,
  ConfigHelpers,
  CONFIG_PRESETS
} = require('@ThePineappleTech/pineapple-auth-utils');

console.log('🍍 Pineapple Auth Utils - Usage Examples\n');

// ============================================================================
// EXAMPLE 1: Simple Environment Variable Configuration
// ============================================================================

console.log('1️⃣ Environment Variable Configuration');

// Just set REDIS_URL=redis://localhost:6379 in your environment
const simpleConfig = createAuthConfig({
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret',
    issuer: 'my-app'
  }
  // Redis automatically picked up from REDIS_URL env var
});

console.log('Simple config created:', { 
  hasRedis: !!simpleConfig.redis,
  issuer: simpleConfig.jwt.issuer 
});

// ============================================================================
// EXAMPLE 2: Direct Redis URL Configuration  
// ============================================================================

console.log('\n2️⃣ Direct Redis URL Configuration');

const directConfig = {
  jwt: {
    secret: 'my-secret',
    issuer: 'my-app'
  },
  redis: {
    url: 'redis://localhost:6379'
  }
};

const auth1 = new PineappleAuth(directConfig);
console.log('Direct URL config initialized');

// ============================================================================
// EXAMPLE 3: Individual Redis Parameters
// ============================================================================

console.log('\n3️⃣ Individual Redis Parameters');

const individualConfig = {
  jwt: {
    secret: 'my-secret', 
    issuer: 'my-app'
  },
  redis: {
    host: 'redis-server',
    port: 6379,
    password: 'redis-password',
    username: 'redis-user',
    db: 1
  }
};

const auth2 = new PineappleAuth(individualConfig);
console.log('Individual parameters config initialized');

// ============================================================================
// EXAMPLE 4: Configuration Helpers
// ============================================================================

console.log('\n4️⃣ Configuration Helper Examples');

// Quick Redis URL setup
const quickConfig = ConfigHelpers.withRedisUrl(
  'redis://localhost:6379', 
  'jwt-secret',
  'my-app'
);
console.log('Quick config:', { hasRedis: !!quickConfig.redis });

// Docker configuration
const dockerConfig = ConfigHelpers.forDocker();
console.log('Docker config:', { hasRedis: !!dockerConfig.redis });

// AWS configuration  
const awsConfig = ConfigHelpers.forAWS('my-cluster.cache.amazonaws.com');
console.log('AWS config:', { hasRedis: !!awsConfig.redis });

// Without Redis
const noRedisConfig = ConfigHelpers.withoutRedis();
console.log('No Redis config:', { hasRedis: !!noRedisConfig.redis });

// ============================================================================
// EXAMPLE 5: Environment-Specific Presets
// ============================================================================

console.log('\n5️⃣ Environment-Specific Presets');

// Set NODE_ENV to see different behaviors
const originalEnv = process.env.NODE_ENV;

process.env.NODE_ENV = 'development';
const devConfig = CONFIG_PRESETS.development();
console.log('Development preset:', { env: 'development', hasRedis: !!devConfig.redis });

process.env.NODE_ENV = 'production';
const prodConfig = CONFIG_PRESETS.production();
console.log('Production preset:', { env: 'production', hasRedis: !!prodConfig.redis });

process.env.NODE_ENV = originalEnv; // Restore

// ============================================================================
// EXAMPLE 6: PublicAuthMiddleware Configuration
// ============================================================================

console.log('\n6️⃣ PublicAuthMiddleware Examples');

const publicConfig1 = createPublicAuthConfig({
  jwt: {
    secret: 'public-secret',
    issuer: 'public-app'
  },
  redis: 'redis://localhost:6379'
});

const publicAuth = new PublicAuthMiddleware(publicConfig1);
console.log('PublicAuth initialized with Redis');

// Without Redis
const publicConfig2 = createPublicAuthConfig({
  jwt: {
    secret: 'public-secret',
    issuer: 'public-app'
  }
  // No Redis
});

const publicAuthNoRedis = new PublicAuthMiddleware(publicConfig2);
console.log('PublicAuth initialized without Redis');

// ============================================================================
// EXAMPLE 7: Express.js Integration
// ============================================================================

console.log('\n7️⃣ Express.js Integration Example');

function createExpressApp() {
  const express = require('express');
  const app = express();

  // Determine configuration based on environment
  let authConfig;
  
  const environment = process.env.NODE_ENV || 'development';
  
  switch (environment) {
    case 'production':
      authConfig = createAuthConfig({
        environment: 'production',
        redis: process.env.REDIS_URL || process.env.REDISCLOUD_URL
      });
      break;
      
    case 'staging':
      authConfig = createAuthConfig({
        environment: 'staging', 
        redis: process.env.STAGING_REDIS_URL
      });
      break;
      
    case 'development':
      authConfig = ConfigHelpers.forDocker(); // or localhost
      break;
      
    default:
      authConfig = ConfigHelpers.withoutRedis(); // Test environment
  }

  const auth = new PineappleAuth(authConfig);
  const publicAuth = new PublicAuthMiddleware(createPublicAuthConfig({
    jwt: authConfig.jwt,
    redis: authConfig.redis
  }));

  // Middleware setup
  app.use(express.json());

  // Protected routes with full auth (JWT + Service)
  app.get('/api/admin/*', auth.validateAnyAuth, (req, res) => {
    res.json({ message: 'Admin access', user: req.auth });
  });

  // JWT-only routes (public services)
  app.get('/api/public/*', publicAuth.validateJWT, (req, res) => {
    res.json({ message: 'Public access', user: req.auth });
  });

  // Service-to-service routes
  app.get('/api/internal/*', auth.validateServiceAuth, (req, res) => {
    res.json({ message: 'Service access', user: req.auth });
  });

  console.log(`Express app configured for ${environment} environment`);
  
  return app;
}

// ============================================================================
// EXAMPLE 8: Cloud Provider Configurations
// ============================================================================

console.log('\n8️⃣ Cloud Provider Examples');

// AWS ElastiCache
const awsElastiCacheConfig = {
  jwt: { secret: process.env.JWT_SECRET, issuer: 'aws-app' },
  redis: {
    url: 'redis://my-cluster.abc123.cache.amazonaws.com:6379'
  }
};

// Redis Cloud
const redisCloudConfig = {
  jwt: { secret: process.env.JWT_SECRET, issuer: 'cloud-app' },
  redis: {
    url: 'redis://default:password@redis-12345.c1.us-east-1.ec2.cloud.redislabs.com:12345'
  }
};

// Azure Cache for Redis
const azureConfig = {
  jwt: { secret: process.env.JWT_SECRET, issuer: 'azure-app' },
  redis: {
    url: 'rediss://my-cache.redis.cache.windows.net:6380' // SSL
  }
};

// Google Cloud Memorystore  
const gcpConfig = {
  jwt: { secret: process.env.JWT_SECRET, issuer: 'gcp-app' },
  redis: {
    host: '10.0.0.3', // Internal IP
    port: 6379
  }
};

console.log('Cloud configurations created for AWS, Redis Cloud, Azure, and GCP');

// ============================================================================
// EXAMPLE 9: Error Handling and Validation
// ============================================================================

console.log('\n9️⃣ Error Handling Examples');

function safeCreateAuth(config) {
  try {
    const auth = new PineappleAuth(config);
    console.log('✅ Auth created successfully');
    return auth;
  } catch (error) {
    console.error('❌ Auth creation failed:', error.message);
    
    // Fallback to no-Redis configuration
    console.log('🔄 Falling back to no-Redis configuration');
    return new PineappleAuth(ConfigHelpers.withoutRedis());
  }
}

// Test with invalid config
const invalidConfig = {
  jwt: { secret: 'test', issuer: 'test' },
  redis: { url: 'invalid-url' }
};

const authWithFallback = safeCreateAuth(invalidConfig);

// ============================================================================
// EXAMPLE 10: Dynamic Configuration
// ============================================================================

console.log('\n🔟 Dynamic Configuration');

async function createDynamicAuth() {
  // Simulate fetching config from database or config service
  const dynamicConfig = {
    redisUrl: 'redis://dynamic-redis:6379',
    jwtSecret: 'dynamic-secret',
    environment: 'production'
  };
  
  const config = createAuthConfig({
    jwt: {
      secret: dynamicConfig.jwtSecret,
      issuer: 'dynamic-app'
    },
    redis: dynamicConfig.redisUrl,
    environment: dynamicConfig.environment
  });
  
  return new PineappleAuth(config);
}

console.log('Dynamic configuration example completed');

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n✅ All Examples Completed!\n');
console.log('Key Takeaways:');
console.log('• Use REDIS_URL environment variable for simplest setup');
console.log('• Use createAuthConfig() for environment-aware configuration');  
console.log('• Use ConfigHelpers for common deployment scenarios');
console.log('• Individual Redis parameters give maximum flexibility');
console.log('• Configuration is validated and errors are handled gracefully');
console.log('• Both PineappleAuth and PublicAuthMiddleware support flexible Redis config');

module.exports = {
  createExpressApp,
  safeCreateAuth,
  createDynamicAuth,
  // Export all the example configs for testing
  configs: {
    simple: simpleConfig,
    direct: directConfig,
    individual: individualConfig,
    aws: awsElastiCacheConfig,
    redisCloud: redisCloudConfig,
    azure: azureConfig,
    gcp: gcpConfig
  }
};