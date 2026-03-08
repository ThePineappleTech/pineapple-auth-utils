# Redis Configuration Guide

This guide shows how to customize Redis connection settings when using `@ThePineappleTech/pineapple-auth-utils` in your project.

## Quick Start

### 1. Environment Variable (Recommended)

The simplest way to configure Redis is through environment variables:

```bash
# Set Redis URL
export REDIS_URL=redis://localhost:6379

# Or for production with authentication
export REDIS_URL=redis://username:password@prod-redis:6379

# For Redis with SSL
export REDIS_URL=rediss://secure-redis:6380
```

```javascript
const { createAuthConfig, PineappleAuth } = require('@ThePineappleTech/pineapple-auth-utils');

// Automatically picks up REDIS_URL
const auth = new PineappleAuth(createAuthConfig());
```

### 2. Direct Configuration

```javascript
const { PineappleAuth } = require('@ThePineappleTech/pineapple-auth-utils');

const config = {
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: 'my-app'
  },
  redis: {
    url: 'redis://localhost:6379'
  }
};

const auth = new PineappleAuth(config);
```

## Advanced Configuration Options

### Individual Redis Parameters

```javascript
const config = {
  jwt: { secret: 'secret', issuer: 'app' },
  redis: {
    host: 'redis-server',
    port: 6379,
    password: 'redis-password',
    username: 'redis-user',
    db: 0  // Database number (0-15)
  }
};
```

### Configuration Helper Functions

```javascript
const { 
  createAuthConfig, 
  ConfigHelpers 
} = require('@ThePineappleTech/pineapple-auth-utils');

// Quick Redis URL setup
const config1 = ConfigHelpers.withRedisUrl('redis://my-redis:6379');

// AWS ElastiCache
const config2 = ConfigHelpers.forAWS('my-cluster.cache.amazonaws.com');

// Docker Compose
const config3 = ConfigHelpers.forDocker(); // Uses 'redis:6379'

// Heroku with addon
const config4 = ConfigHelpers.forHeroku(); // Auto-detects Heroku Redis addons

// Without Redis (degraded mode)
const config5 = ConfigHelpers.withoutRedis();
```

## Environment-Specific Configuration

### Multiple Environment Variables

```bash
# Development
export NODE_ENV=development
export REDIS_URL=redis://localhost:6379

# Staging  
export NODE_ENV=staging
export REDIS_URL=redis://staging-redis:6379

# Production
export NODE_ENV=production
export REDIS_URL=rediss://prod-cluster.cache.amazonaws.com:6380
```

```javascript
const { CONFIG_PRESETS } = require('@ThePineappleTech/pineapple-auth-utils');

// Automatically uses appropriate config for NODE_ENV
const auth = new PineappleAuth(CONFIG_PRESETS.development());
// or CONFIG_PRESETS.staging(), CONFIG_PRESETS.production()
```

### Individual Environment Variables

```bash
export REDIS_HOST=my-redis-server
export REDIS_PORT=6379
export REDIS_PASSWORD=my-password
export REDIS_USERNAME=my-user
export REDIS_DB=1
```

```javascript
const { getRedisConfig, createAuthConfig } = require('@ThePineappleTech/pineapple-auth-utils');

const config = createAuthConfig({
  redis: getRedisConfig() // Auto-builds from individual env vars
});
```

## Cloud Provider Examples

### AWS ElastiCache

```javascript
const config = {
  jwt: { secret: process.env.JWT_SECRET, issuer: 'my-app' },
  redis: {
    url: 'redis://my-cluster.abc123.cache.amazonaws.com:6379'
  }
};
```

### Redis Cloud

```javascript
const config = {
  redis: {
    url: 'redis://default:password@redis-12345.c1.us-east-1.ec2.cloud.redislabs.com:12345'
  }
};
```

### Azure Cache for Redis

```javascript
const config = {
  redis: {
    url: 'rediss://my-cache.redis.cache.windows.net:6380'
  }
};
```

### Google Cloud Memorystore

```javascript
const config = {
  redis: {
    host: '10.0.0.3', // Internal IP
    port: 6379
  }
};
```

## Docker & Container Examples

### Docker Compose

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
      
  app:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
```

```javascript
// In your app
const { ConfigHelpers } = require('@ThePineappleTech/pineapple-auth-utils');
const auth = new PineappleAuth(ConfigHelpers.forDocker());
```

### Kubernetes

```yaml
# k8s-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  REDIS_URL: "redis://redis-service:6379"
```

## Security Best Practices

### 1. Use SSL/TLS in Production

```javascript
const config = {
  redis: {
    url: 'rediss://secure-redis:6380' // Note: rediss:// not redis://
  }
};
```

### 2. Environment-Specific Secrets

```javascript
// Don't hardcode credentials
const config = {
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD // From secrets manager
  }
};
```

### 3. Credential Masking

The library automatically masks credentials in logs:

```
🍍 [PINEAPPLE-AUTH] Connecting to Redis: redis://***:***@prod-redis:6379
```

## Testing Configuration

### Test Environment

```javascript
const { CONFIG_PRESETS } = require('@ThePineappleTech/pineapple-auth-utils');

// For tests - no Redis by default
const testConfig = CONFIG_PRESETS.testing();

// Or with test Redis
const testWithRedis = createAuthConfig({
  environment: 'testing',
  redis: 'redis://localhost:6379'
});
```

### Mocking Redis

```javascript
// In tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    get: jest.fn(),
    set: jest.fn()
  }))
}));
```

## Error Handling

### Invalid Configuration

```javascript
const { validateRedisConfig } = require('@ThePineappleTech/pineapple-auth-utils');

try {
  const url = validateRedisConfig({ host: 'invalid' });
} catch (error) {
  console.error('Redis config error:', error.message);
}
```

### Connection Failures

The library handles connection failures gracefully:
- Invalid URLs don't crash the application
- Connection errors are logged but don't stop initialization
- Token revocation features are disabled when Redis is unavailable

## Migration from Legacy Format

### Old Format (Still Supported)

```javascript
const config = {
  redis: {
    url: 'redis://localhost:6379'
  }
};
```

### New Flexible Format

```javascript
const config = {
  redis: {
    host: 'localhost',
    port: 6379,
    password: 'secret'
  }
};

// Or use helper functions
const config = createAuthConfig({
  redis: 'redis://localhost:6379'
});
```

## Complete Example

```javascript
const express = require('express');
const { 
  createAuthConfig, 
  PineappleAuth,
  ConfigHelpers 
} = require('@ThePineappleTech/pineapple-auth-utils');

const app = express();

// Environment-aware configuration
let authConfig;

if (process.env.NODE_ENV === 'production') {
  authConfig = createAuthConfig({
    environment: 'production',
    redis: process.env.REDIS_URL
  });
} else if (process.env.NODE_ENV === 'development') {
  authConfig = ConfigHelpers.forDocker(); // or localhost
} else {
  authConfig = ConfigHelpers.withoutRedis(); // Test environment
}

const auth = new PineappleAuth(authConfig);

// Use middleware
app.use('/api', auth.validateJWT);

app.listen(3000, () => {
  console.log('Server running with Redis configuration');
});
```

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check if Redis server is running
2. **Authentication Failed**: Verify username/password
3. **SSL Errors**: Use `rediss://` for SSL connections
4. **Timeout**: Check network connectivity and firewall rules

### Debug Logging

The library provides detailed logging for Redis connections:

```
🍍 [PINEAPPLE-AUTH] Redis configured: YES
🍍 [PINEAPPLE-AUTH] Connecting to Redis: redis://***:***@server:6379
🍍 [PINEAPPLE-AUTH] ✅ Redis connected successfully
```

For more debugging, enable Redis client logging in your environment.