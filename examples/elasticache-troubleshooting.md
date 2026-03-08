# AWS ElastiCache & Valkey Connection Guide

This guide helps you connect to AWS ElastiCache (Redis/Valkey) clusters with the pineapple-auth-utils package.

## Quick Configuration Examples

### 1. Standard ElastiCache Cluster (Non-TLS)

```javascript
const { ConfigHelpers } = require('@ThePineappleTech/pineapple-auth-utils');

// For a standard ElastiCache cluster endpoint
const config = ConfigHelpers.forElastiCache('my-cluster.abc123.cache.amazonaws.com', {
  port: 6379,
  tls: false,
  region: 'us-east-1',
  connectTimeout: 20000
});
```

### 2. ElastiCache with TLS/SSL (In-Transit Encryption)

```javascript
// For TLS-enabled ElastiCache
const config = ConfigHelpers.forElastiCache('my-cluster.abc123.cache.amazonaws.com', {
  port: 6380,
  tls: true,
  region: 'us-east-1',
  connectTimeout: 20000
});
```

### 3. ElastiCache with Auth Token (At-Rest Encryption)

```javascript
// With authentication token
const config = ConfigHelpers.forElastiCache('my-cluster.abc123.cache.amazonaws.com', {
  port: 6379,
  authToken: process.env.ELASTICACHE_AUTH_TOKEN,
  region: 'us-east-1'
});
```

### 4. ElastiCache Serverless

```javascript
// For ElastiCache Serverless (always uses TLS)
const config = ConfigHelpers.forElastiCacheServerless(
  'serverless.my-cluster.abc123.serverless.cache.amazonaws.com',
  process.env.ELASTICACHE_AUTH_TOKEN,
  'us-east-1'
);
```

### 5. Valkey Configuration

```javascript
// For AWS's Valkey clusters
const config = ConfigHelpers.forValkey(
  'my-valkey.abc123.cache.amazonaws.com',
  7379,
  process.env.VALKEY_AUTH_TOKEN
);
```

## Manual Configuration Examples

### Advanced ElastiCache Configuration

```javascript
const { createAuthConfig } = require('@ThePineappleTech/pineapple-auth-utils');

const config = createAuthConfig({
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: 'my-app'
  },
  redis: {
    url: 'rediss://:your-auth-token@my-cluster.cache.amazonaws.com:6380',
    tls: {
      servername: 'my-cluster.cache.amazonaws.com',
      rejectUnauthorized: true
    },
    connectTimeout: 20000,
    commandTimeout: 5000,
    retryDelayOnFailover: 100,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
    retryConnect: 3
  }
});
```

### Individual Parameter Configuration

```javascript
const config = createAuthConfig({
  redis: {
    host: 'my-cluster.abc123.cache.amazonaws.com',
    port: 6380,
    password: process.env.ELASTICACHE_AUTH_TOKEN,
    tls: {
      servername: 'my-cluster.abc123.cache.amazonaws.com',
      rejectUnauthorized: true
    },
    connectTimeout: 20000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 3
  }
});
```

## Common ElastiCache URL Formats

### Standard Formats

```bash
# Non-TLS ElastiCache
redis://my-cluster.abc123.cache.amazonaws.com:6379

# TLS-enabled ElastiCache
rediss://my-cluster.abc123.cache.amazonaws.com:6380

# With auth token (non-TLS)
redis://:your-auth-token@my-cluster.abc123.cache.amazonaws.com:6379

# With auth token and TLS
rediss://:your-auth-token@my-cluster.abc123.cache.amazonaws.com:6380

# ElastiCache Serverless
rediss://:your-auth-token@serverless.my-cluster.abc123.serverless.cache.amazonaws.com:6380
```

### Identifying Your ElastiCache Type

```javascript
function getElastiCacheConfig(endpoint, authToken) {
  if (endpoint.includes('serverless')) {
    // ElastiCache Serverless - always TLS on port 6380
    return ConfigHelpers.forElastiCacheServerless(endpoint, authToken);
  }
  
  if (endpoint.includes('clustercfg')) {
    // ElastiCache Cluster Mode
    return ConfigHelpers.forElastiCache(endpoint, {
      tls: true,
      port: 6380,
      authToken: authToken
    });
  }
  
  // Standard ElastiCache
  return ConfigHelpers.forElastiCache(endpoint, {
    tls: !!authToken, // Use TLS if auth token provided
    port: authToken ? 6380 : 6379,
    authToken: authToken
  });
}
```

## Troubleshooting Connection Issues

### 1. Check ElastiCache Security Groups

Ensure your application's security group has access to ElastiCache:

```bash
# Check security group rules
aws ec2 describe-security-groups --group-ids sg-your-app-sg

# ElastiCache security group should allow inbound on port 6379/6380 from your app
```

### 2. Verify VPC and Subnets

ElastiCache clusters are VPC-specific:

```bash
# Check your ElastiCache cluster details
aws elasticache describe-replication-groups --replication-group-id your-cluster-id

# Ensure your application is in the same VPC
```

### 3. Test Connection with Redis CLI

```bash
# Test non-TLS connection
redis-cli -h my-cluster.abc123.cache.amazonaws.com -p 6379 ping

# Test TLS connection
redis-cli -h my-cluster.abc123.cache.amazonaws.com -p 6380 --tls ping

# Test with auth token
redis-cli -h my-cluster.abc123.cache.amazonaws.com -p 6379 -a your-auth-token ping
```

### 4. Common Error Messages and Solutions

#### "ENOTFOUND" or "ECONNREFUSED"

```javascript
// Error: getaddrinfo ENOTFOUND my-cluster.cache.amazonaws.com
// Solution: Check endpoint spelling and ensure it's accessible from your network

const config = createAuthConfig({
  redis: {
    host: 'my-cluster.abc123.cache.amazonaws.com', // Verify this endpoint
    port: 6379,
    connectTimeout: 30000 // Increase timeout
  }
});
```

#### "NOAUTH Authentication required"

```javascript
// Error: NOAUTH Authentication required
// Solution: Provide auth token

const config = ConfigHelpers.forElastiCache('my-cluster.cache.amazonaws.com', {
  authToken: process.env.ELASTICACHE_AUTH_TOKEN
});
```

#### "SSL Connection Failed"

```javascript
// Error: SSL connection failed
// Solution: Configure TLS properly

const config = createAuthConfig({
  redis: {
    url: 'rediss://my-cluster.cache.amazonaws.com:6380',
    tls: {
      servername: 'my-cluster.cache.amazonaws.com',
      rejectUnauthorized: true
    }
  }
});
```

#### "Connection Timeout"

```javascript
// Error: Connection timeout
// Solution: Increase timeouts and check network

const config = createAuthConfig({
  redis: {
    host: 'my-cluster.cache.amazonaws.com',
    port: 6379,
    connectTimeout: 30000,
    commandTimeout: 10000,
    retryConnect: 5
  }
});
```

### 5. Debug Connection

```javascript
const { PineappleAuth } = require('@ThePineappleTech/pineapple-auth-utils');

// Enable debug logging
process.env.NODE_ENV = 'development'; // Enables debug logs

const config = createAuthConfig({
  redis: {
    url: 'your-elasticache-url',
    connectTimeout: 30000
  }
});

const auth = new PineappleAuth(config);

// Monitor connection events
console.log('Attempting ElastiCache connection...');
setTimeout(() => {
  console.log('Connection attempt completed');
}, 10000);
```

## Environment-Specific Examples

### Development (Local Redis)

```javascript
const config = ConfigHelpers.forDocker(); // Uses redis:6379
```

### Staging (ElastiCache without TLS)

```bash
export REDIS_URL=redis://staging-cluster.abc123.cache.amazonaws.com:6379
```

```javascript
const config = createAuthConfig(); // Picks up REDIS_URL
```

### Production (ElastiCache with TLS and Auth)

```bash
export REDIS_URL=rediss://:${ELASTICACHE_AUTH_TOKEN}@prod-cluster.abc123.cache.amazonaws.com:6380
```

```javascript
const config = ConfigHelpers.forElastiCacheServerless(
  'prod-cluster.abc123.serverless.cache.amazonaws.com',
  process.env.ELASTICACHE_AUTH_TOKEN,
  'us-east-1'
);
```

## Infrastructure as Code Examples

### Terraform

```hcl
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id         = "my-redis-cluster"
  description                  = "Redis cluster for pineapple-auth"
  port                        = 6379
  parameter_group_name        = "default.redis7"
  node_type                   = "cache.t3.micro"
  num_cache_clusters          = 1
  
  # For TLS
  transit_encryption_enabled  = true
  at_rest_encryption_enabled  = true
  auth_token                  = var.redis_auth_token
  
  # Security
  subnet_group_name           = aws_elasticache_subnet_group.redis.name
  security_group_ids          = [aws_security_group.redis.id]
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.configuration_endpoint_address
}
```

### CloudFormation

```yaml
Resources:
  ElastiCacheCluster:
    Type: AWS::ElastiCache::ReplicationGroup
    Properties:
      ReplicationGroupId: my-redis-cluster
      Description: Redis cluster for pineapple-auth
      Port: 6379
      CacheNodeType: cache.t3.micro
      NumCacheClusters: 1
      TransitEncryptionEnabled: true
      AtRestEncryptionEnabled: true
      AuthToken: !Ref RedisAuthToken
      
Outputs:
  RedisEndpoint:
    Value: !GetAtt ElastiCacheCluster.RedisEndpoint.Address
    Export:
      Name: !Sub "${AWS::StackName}-redis-endpoint"
```

## Testing Your Configuration

```javascript
// test-elasticache.js
const { PineappleAuth, ConfigHelpers } = require('@ThePineappleTech/pineapple-auth-utils');

async function testElastiCacheConnection() {
  console.log('🧪 Testing ElastiCache Connection');
  
  // Configure for your ElastiCache setup
  const config = ConfigHelpers.forElastiCache('your-cluster.cache.amazonaws.com', {
    tls: true,
    port: 6380,
    authToken: process.env.ELASTICACHE_AUTH_TOKEN,
    connectTimeout: 30000
  });
  
  try {
    const auth = new PineappleAuth(config);
    console.log('✅ Auth instance created');
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test token revocation (requires Redis)
    await auth.revokeToken('test-token', 60);
    console.log('✅ Token revocation test passed');
    
    console.log('🎉 ElastiCache connection successful!');
  } catch (error) {
    console.error('❌ ElastiCache connection failed:', error.message);
    console.error('💡 Check your configuration and network settings');
  }
}

testElastiCacheConnection();
```

Run the test:

```bash
ELASTICACHE_AUTH_TOKEN=your-token node test-elasticache.js
```

## Next Steps

1. **Start with the simplest configuration** that matches your ElastiCache setup
2. **Test locally** if possible before deploying
3. **Check AWS CloudWatch** for ElastiCache metrics and connection logs  
4. **Monitor application logs** for Redis connection status
5. **Use ElastiCache Parameter Groups** to optimize Redis settings for your use case

## Common ElastiCache Commands for Debugging

```bash
# List your ElastiCache clusters
aws elasticache describe-replication-groups

# Get cluster details
aws elasticache describe-replication-groups --replication-group-id your-cluster-id

# Check cluster status
aws elasticache describe-cache-clusters --cache-cluster-id your-cluster-001

# View CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix /aws/elasticache
```