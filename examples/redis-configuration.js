// Examples of how to configure Redis URL when using pineapple-auth-utils

const { PineappleAuth, createAuthMiddleware } = require('@ThePineappleTech/pineapple-auth-utils');
const { PublicAuthMiddleware, createPublicAuth } = require('@ThePineappleTech/pineapple-auth-utils');

// ================================
// Method 1: Direct Configuration
// ================================

console.log('1️⃣ Direct Redis URL Configuration');

const directConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret',
    issuer: 'your-app-name'
  },
  aws: {
    region: 'us-east-1',
    service: 'pineapple'
  },
  redis: {
    url: 'redis://your-redis-server:6379' // Direct URL
  }
};

const authDirect = new PineappleAuth(directConfig);

// ================================
// Method 2: Environment Variables
// ================================

console.log('\n2️⃣ Environment Variable Configuration');

const envConfig = {
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER || 'your-app'
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    service: 'pineapple'
  },
  redis: {
    url: process.env.REDIS_URL // From environment variable
  }
};

// Usage: REDIS_URL=redis://prod-redis:6379 node your-app.js
const authEnv = createAuthMiddleware(envConfig);

// ================================
// Method 3: Different Redis Configurations
// ================================

console.log('\n3️⃣ Various Redis URL Formats');

// Local Redis
const localConfig = {
  jwt: { secret: 'secret', issuer: 'app' },
  redis: { url: 'redis://localhost:6379' }
};

// Redis with password
const authConfig = {
  jwt: { secret: 'secret', issuer: 'app' },
  redis: { url: 'redis://username:password@redis-server:6379' }
};

// Redis with SSL
const sslConfig = {
  jwt: { secret: 'secret', issuer: 'app' },
  redis: { url: 'rediss://redis-server:6380' } // Note: rediss:// for SSL
};

// Redis Cluster or Cloud (e.g., AWS ElastiCache, Redis Cloud)
const cloudConfig = {
  jwt: { secret: 'secret', issuer: 'app' },
  redis: { 
    url: 'redis://your-cluster.cache.amazonaws.com:6379'
    // or: 'redis://redis-12345.c1.us-east-1.ec2.cloud.redislabs.com:12345'
  }
};

// ================================
// Method 4: Conditional Redis Configuration
// ================================

console.log('\n4️⃣ Conditional Redis Setup');

function createAuthConfig() {
  const baseConfig = {
    jwt: {
      secret: process.env.JWT_SECRET,
      issuer: process.env.JWT_ISSUER
    },
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      service: 'pineapple'
    }
  };

  // Only add Redis if URL is provided
  if (process.env.REDIS_URL) {
    baseConfig.redis = {
      url: process.env.REDIS_URL
    };
  }

  return baseConfig;
}

const conditionalAuth = new PineappleAuth(createAuthConfig());

// ================================
// Method 5: Multiple Environment Support
// ================================

console.log('\n5️⃣ Environment-Specific Configuration');

const environment = process.env.NODE_ENV || 'development';

const configs = {
  development: {
    jwt: { secret: 'dev-secret', issuer: 'dev-app' },
    redis: { url: 'redis://localhost:6379' }
  },
  
  staging: {
    jwt: { secret: process.env.JWT_SECRET, issuer: 'staging-app' },
    redis: { url: process.env.STAGING_REDIS_URL }
  },
  
  production: {
    jwt: { secret: process.env.JWT_SECRET, issuer: 'prod-app' },
    redis: { url: process.env.PRODUCTION_REDIS_URL }
  }
};

const envAuth = new PineappleAuth({
  ...configs[environment],
  aws: { region: 'us-east-1', service: 'pineapple' }
});

// ================================
// Method 6: Configuration from External Sources
// ================================

console.log('\n6️⃣ External Configuration Sources');

// From config file
const config = require('./config.json'); // Contains redis.url
const fileAuth = new PineappleAuth(config);

// From database or configuration service
async function createAuthFromDatabase() {
  // Simulate fetching config from database
  const dbConfig = {
    redisUrl: 'redis://db-configured-redis:6379',
    jwtSecret: 'db-secret'
  };
  
  return new PineappleAuth({
    jwt: { secret: dbConfig.jwtSecret, issuer: 'app' },
    redis: { url: dbConfig.redisUrl }
  });
}

// ================================
// Method 7: PublicAuthMiddleware Configuration
// ================================

console.log('\n7️⃣ PublicAuthMiddleware Redis Configuration');

const publicAuthConfig = {
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER
  },
  redis: {
    url: process.env.REDIS_URL // Same approaches apply
  }
};

const publicAuth = createPublicAuth(publicAuthConfig);

// ================================
// Method 8: Validation and Error Handling
// ================================

console.log('\n8️⃣ Configuration Validation');

function createValidatedAuthConfig() {
  const redisUrl = process.env.REDIS_URL;
  
  // Validate Redis URL format
  if (redisUrl && !redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    throw new Error('Invalid Redis URL format. Must start with redis:// or rediss://');
  }
  
  const config = {
    jwt: {
      secret: process.env.JWT_SECRET,
      issuer: process.env.JWT_ISSUER || 'default-app'
    },
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      service: 'pineapple'
    }
  };
  
  // Only add Redis if valid URL provided
  if (redisUrl) {
    config.redis = { url: redisUrl };
    console.log('✅ Redis configured:', redisUrl.replace(/:\/\/.*@/, '://***@')); // Hide credentials in logs
  } else {
    console.log('ℹ️ Redis not configured - token revocation disabled');
  }
  
  return config;
}

// ================================
// Example Usage in Express App
// ================================

console.log('\n9️⃣ Express App Integration');

const express = require('express');
const app = express();

// Configure auth with environment-based Redis
const authMiddleware = createAuthMiddleware({
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: 'my-express-app'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  }
});

// Use in routes
app.get('/protected', authMiddleware.validateJWT, (req, res) => {
  res.json({ message: 'Protected route', user: req.auth });
});

console.log('\n✅ Configuration examples completed!');

module.exports = {
  createAuthConfig,
  createValidatedAuthConfig,
  configs
};