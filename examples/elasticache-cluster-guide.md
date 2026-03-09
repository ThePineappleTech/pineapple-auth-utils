# AWS ElastiCache Cluster Support Guide

This guide shows how to configure `@ThePineappleTech/pineapple-auth-utils` to work with AWS ElastiCache Redis clusters, including cluster mode and replication groups.

## Quick Start

### 1. Auto-Detect ElastiCache Type (Recommended)

```javascript
const { ConfigHelpers, PineappleAuth } = require('@ThePineappleTech/pineapple-auth-utils');

// Auto-detects cluster mode, serverless, or standard based on endpoint
const config = ConfigHelpers.forElastiCacheAuto(
  'my-cluster.abc123.clustercfg.cache.amazonaws.com', // Your cluster endpoint
  {
    authToken: process.env.ELASTICACHE_AUTH_TOKEN,
    region: 'us-east-1',
    tls: true, // Enable for encrypted clusters
    connectTimeout: 30000
  }
);

const auth = new PineappleAuth(config);
```

### 2. Explicit Cluster Mode Configuration

```javascript
// For ElastiCache with Cluster Mode enabled
const config = ConfigHelpers.forElastiCacheCluster(
  'my-cluster.abc123.clustercfg.cache.amazonaws.com',
  {
    authToken: process.env.ELASTICACHE_AUTH_TOKEN,
    region: 'us-east-1',
    tls: true,
    port: 6380, // TLS port
    connectTimeout: 30000
  }
);
```

### 3. Replication Group Configuration

```javascript
// For ElastiCache Replication Group (multiple read replicas)
const config = ConfigHelpers.forElastiCacheReplicationGroup(
  'primary.abc123.cache.amazonaws.com', // Primary endpoint
  'reader.abc123.cache.amazonaws.com',  // Reader endpoint (optional)
  {
    authToken: process.env.ELASTICACHE_AUTH_TOKEN,
    region: 'us-east-1',
    tls: true,
    port: 6380
  }
);
```

## ElastiCache Cluster Types

### Cluster Mode Enabled

ElastiCache Cluster Mode distributes data across multiple shards for scalability:

```javascript
const config = ConfigHelpers.forElastiCacheCluster('my-cluster.clustercfg.cache.amazonaws.com', {
  authToken: process.env.ELASTICACHE_AUTH_TOKEN,
  region: 'us-east-1',
  tls: true,
  connectTimeout: 20000,
  // Optional: specify individual nodes
  nodes: [
    { host: 'shard-001.abc123.cache.amazonaws.com', port: 6380 },
    { host: 'shard-002.abc123.cache.amazonaws.com', port: 6380 },
    { host: 'shard-003.abc123.cache.amazonaws.com', port: 6380 }
  ]
});
```

**Cluster Mode Features:**
- ✅ Auto-pipelining enabled for performance
- ✅ Uses replicas for read operations  
- ✅ Automatic failover and resharding
- ✅ Handles up to 16 redirections

### Replication Groups

Traditional ElastiCache setup with a primary and read replicas:

```javascript
const config = ConfigHelpers.forElastiCacheReplicationGroup(
  'primary.abc123.cache.amazonaws.com',
  'replica.abc123.cache.amazonaws.com',
  {
    authToken: process.env.ELASTICACHE_AUTH_TOKEN,
    tls: true,
    region: 'us-east-1'
  }
);
```

**Replication Group Features:**
- ✅ Prefers replica nodes for read operations
- ✅ Lower latency than cluster mode
- ✅ Simpler configuration
- ✅ Automatic failover to replica

## Manual Cluster Configuration

For maximum control, configure Redis cluster options directly:

```javascript
const { createAuthConfig } = require('@ThePineappleTech/pineapple-auth-utils');

const config = createAuthConfig({
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: 'my-app'
  },
  aws: {
    region: 'us-east-1',
    service: 'pineapple'
  },
  redis: {
    cluster: {
      // Define cluster nodes
      rootNodes: [
        { host: 'node1.cache.amazonaws.com', port: 6380 },
        { host: 'node2.cache.amazonaws.com', port: 6380 },
        { host: 'node3.cache.amazonaws.com', port: 6380 }
      ],
      
      // Cluster behavior settings
      useReplicas: true,                    // Use replica nodes for reads
      enableAutoPipelining: true,           // Pipeline commands automatically
      maxCommandRedirections: 16,           // Max redirections before failing
      retryDelayOnClusterDown: 300,         // Wait time when cluster is down
      retryDelayOnFailover: 100,            // Wait time during failover
      maxRetriesPerRequest: 3,              // Max retries per command
      scaleReads: 'all'                     // 'master', 'slave', or 'all'
    },
    
    // Global Redis settings
    password: process.env.ELASTICACHE_AUTH_TOKEN,
    tls: {
      servername: 'node1.cache.amazonaws.com',
      rejectUnauthorized: true
    },
    connectTimeout: 20000,
    commandTimeout: 5000
  }
});
```

## Environment Variables

Set up your environment for different deployment stages:

### Development

```bash
export NODE_ENV=development
export REDIS_URL=redis://localhost:6379  # Local Redis for development
```

### Staging

```bash
export NODE_ENV=staging
export ELASTICACHE_CLUSTER_ENDPOINT=staging-cluster.clustercfg.cache.amazonaws.com
export ELASTICACHE_AUTH_TOKEN=your-staging-token
export AWS_REGION=us-east-1
```

### Production

```bash
export NODE_ENV=production
export ELASTICACHE_CLUSTER_ENDPOINT=prod-cluster.clustercfg.cache.amazonaws.com
export ELASTICACHE_AUTH_TOKEN=your-production-token
export AWS_REGION=us-west-2
```

## Configuration Patterns

### Environment-Based Configuration

```javascript
const { ConfigHelpers } = require('@ThePineappleTech/pineapple-auth-utils');

function createEnvironmentConfig() {
  const environment = process.env.NODE_ENV || 'development';
  const clusterEndpoint = process.env.ELASTICACHE_CLUSTER_ENDPOINT;
  
  if (environment === 'production' && clusterEndpoint) {
    return ConfigHelpers.forElastiCacheAuto(clusterEndpoint, {
      authToken: process.env.ELASTICACHE_AUTH_TOKEN,
      region: process.env.AWS_REGION || 'us-east-1',
      tls: true,
      connectTimeout: 30000
    });
  }
  
  if (environment === 'staging' && clusterEndpoint) {
    return ConfigHelpers.forElastiCacheCluster(clusterEndpoint, {
      authToken: process.env.ELASTICACHE_AUTH_TOKEN,
      region: process.env.AWS_REGION || 'us-east-1',
      tls: false, // Staging might not use TLS
      connectTimeout: 20000
    });
  }
  
  // Development - use local Redis
  return ConfigHelpers.forDocker();
}

const auth = new PineappleAuth(createEnvironmentConfig());
```

### Multi-Region Failover

```javascript
const { createAuthConfig } = require('@ThePineappleTech/pineapple-auth-utils');

const config = createAuthConfig({
  redis: {
    cluster: {
      rootNodes: [
        // Primary region
        { host: 'primary.us-east-1.cache.amazonaws.com', port: 6380 },
        { host: 'replica1.us-east-1.cache.amazonaws.com', port: 6380 },
        
        // Fallback region  
        { host: 'fallback.us-west-2.cache.amazonaws.com', port: 6380 }
      ],
      useReplicas: true,
      maxRetriesPerRequest: 5,
      retryDelayOnFailover: 200
    },
    password: process.env.ELASTICACHE_AUTH_TOKEN,
    tls: true
  }
});
```

## Endpoint Detection

The library automatically detects your ElastiCache configuration type:

| Endpoint Pattern | Detected Type | Configuration Used |
|------------------|---------------|-------------------|
| `*.clustercfg.*` | Cluster Mode | `forElastiCacheCluster()` |
| `*.serverless.*` | Serverless | `forElastiCacheServerless()` |
| `*.cache.amazonaws.com` | Standard/Replication | `forElastiCache()` |

```javascript
// All of these are auto-detected:
ConfigHelpers.forElastiCacheAuto('my-cluster.clustercfg.cache.amazonaws.com');  // → Cluster Mode
ConfigHelpers.forElastiCacheAuto('my-cache.serverless.cache.amazonaws.com');    // → Serverless  
ConfigHelpers.forElastiCacheAuto('my-cache.abc123.cache.amazonaws.com');        // → Standard
```

## Testing Your Cluster Connection

Use the included test script:

```bash
# Test with your cluster endpoint
ELASTICACHE_CLUSTER_ENDPOINT=your-cluster.clustercfg.cache.amazonaws.com \
ELASTICACHE_AUTH_TOKEN=your-token \
AWS_REGION=us-east-1 \
node test-cluster-connection.js
```

The test script will:
1. ✅ Auto-detect your ElastiCache configuration type
2. ✅ Create appropriate cluster configuration
3. ✅ Initialize PineappleAuth with cluster support
4. ✅ Test Redis cluster connectivity
5. ✅ Verify token revocation functionality

## Performance Considerations

### Cluster Mode Optimization

```javascript
const config = ConfigHelpers.forElastiCacheCluster(endpoint, {
  authToken: process.env.ELASTICACHE_AUTH_TOKEN,
  // Performance tuning
  connectTimeout: 10000,        // Faster connection timeout
  commandTimeout: 3000,         // Faster command timeout
  nodes: [
    // Specify closest nodes for lower latency
    { host: 'shard-001.cache.amazonaws.com', port: 6380 },
    { host: 'shard-002.cache.amazonaws.com', port: 6380 }
  ]
});
```

### Read Scaling Options

```javascript
redis: {
  cluster: {
    scaleReads: 'slave',    // Use replicas for all reads (recommended)
    // scaleReads: 'master', // Use master for all operations
    // scaleReads: 'all',    // Distribute reads across all nodes
    useReplicas: true
  }
}
```

## Troubleshooting

### Common Issues

**1. Connection Timeouts**
```javascript
// Increase timeouts for distant regions
const config = ConfigHelpers.forElastiCacheCluster(endpoint, {
  connectTimeout: 30000,  // 30 seconds
  commandTimeout: 10000   // 10 seconds  
});
```

**2. TLS Certificate Issues**
```javascript
redis: {
  tls: {
    servername: 'your-cluster.cache.amazonaws.com',
    rejectUnauthorized: false  // Only for testing!
  }
}
```

**3. Cluster Slot Errors**
```javascript
redis: {
  cluster: {
    maxCommandRedirections: 32,  // Increase redirections
    retryDelayOnClusterDown: 500 // Wait longer during resharding
  }
}
```

### Debug Logging

Enable detailed logging to troubleshoot issues:

```javascript
process.env.NODE_ENV = 'development'; // Enables debug logs

const auth = new PineappleAuth(config);
// Logs will show cluster connection attempts and redirections
```

### Health Check

```javascript
async function checkClusterHealth() {
  const auth = new PineappleAuth(clusterConfig);
  
  try {
    // Test basic Redis operation
    await auth.revokeToken('health-check', 1);
    console.log('✅ Cluster is healthy');
  } catch (error) {
    console.error('❌ Cluster health check failed:', error.message);
  }
}
```

## Migration Guide

### From Single Redis to Cluster

**Before (Single Redis):**
```javascript
const config = {
  redis: {
    url: 'redis://my-cache.cache.amazonaws.com:6379'
  }
};
```

**After (Cluster Mode):**
```javascript
const config = ConfigHelpers.forElastiCacheCluster(
  'my-cluster.clustercfg.cache.amazonaws.com',
  {
    authToken: process.env.ELASTICACHE_AUTH_TOKEN,
    tls: true,
    region: 'us-east-1'
  }
);
```

### Backward Compatibility

The package maintains full backward compatibility:

```javascript
// ✅ Still works - single Redis
const oldConfig = { redis: { url: 'redis://localhost:6379' } };

// ✅ New cluster support  
const newConfig = { redis: { cluster: { rootNodes: [...] } } };

// Both work with the same middleware
const auth = new PineappleAuth(oldConfig); // or newConfig
```

## Best Practices

1. **Use Auto-Detection**: Let the library detect your ElastiCache type
2. **Enable TLS in Production**: Always use encrypted connections
3. **Configure Timeouts**: Set appropriate timeouts for your network
4. **Use Environment Variables**: Keep credentials in environment variables
5. **Test Connectivity**: Use the test script to verify your configuration
6. **Monitor Performance**: Watch for Redis redirections and latency
7. **Plan for Failover**: Configure appropriate retry settings

## Next Steps

1. **Configure your ElastiCache cluster** with the appropriate security groups
2. **Set up environment variables** for your deployment environment  
3. **Test the connection** using the provided test script
4. **Monitor your application** for Redis cluster performance
5. **Scale your cluster** as your application grows

For more advanced configurations and troubleshooting, see the [ElastiCache Troubleshooting Guide](./elasticache-troubleshooting.md).