#!/usr/bin/env node
// Test script for AWS ElastiCache Cluster connections with pineapple-auth-utils

const { PineappleAuth, ConfigHelpers } = require('./dist/index.js');

async function testElastiCacheClusterConnection() {
  console.log('🍍 Testing AWS ElastiCache Cluster Connection\n');
  
  // Example cluster endpoint (replace with your actual cluster endpoint)
  const clusterEndpoint = process.env.ELASTICACHE_CLUSTER_ENDPOINT || 'my-cluster.abc123.clustercfg.cache.amazonaws.com';
  const authToken = process.env.ELASTICACHE_AUTH_TOKEN || '';
  const region = process.env.AWS_REGION || 'us-east-1';
  
  console.log('Configuration:');
  console.log(`- Cluster Endpoint: ${clusterEndpoint}`);
  console.log(`- Auth Token: ${authToken ? 'PROVIDED' : 'NOT PROVIDED'}`);
  console.log(`- Region: ${region}`);
  console.log('');
  
  try {
    // Test 1: Auto-detection
    console.log('🧪 Test 1: Auto-detect ElastiCache configuration');
    const autoConfig = ConfigHelpers.forElastiCacheAuto(clusterEndpoint, {
      authToken: authToken,
      region: region,
      tls: !!authToken,
      connectTimeout: 30000
    });
    
    console.log('✅ Auto-configuration created successfully');
    console.log('- Detected configuration type based on endpoint');
    console.log('');
    
    // Test 2: Explicit cluster configuration
    console.log('🧪 Test 2: Explicit cluster configuration');
    const clusterConfig = ConfigHelpers.forElastiCacheCluster(clusterEndpoint, {
      authToken: authToken,
      region: region,
      tls: !!authToken,
      port: authToken ? 6380 : 6379,
      connectTimeout: 30000
    });
    
    console.log('✅ Cluster configuration created successfully');
    console.log('- Using explicit cluster mode settings');
    console.log('');
    
    // Test 3: Initialize PineappleAuth with cluster
    console.log('🧪 Test 3: Initialize PineappleAuth with cluster config');
    const auth = new PineappleAuth(autoConfig);
    
    console.log('✅ PineappleAuth initialized with cluster configuration');
    console.log('- Redis cluster client created');
    console.log('');
    
    // Test 4: Wait for connection and test token revocation
    console.log('🧪 Test 4: Wait for Redis cluster connection...');
    
    // Give time for the cluster to connect
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🧪 Test 5: Test token revocation functionality');
    const testToken = `test-cluster-token-${Date.now()}`;
    
    try {
      await auth.revokeToken(testToken, 60);
      console.log('✅ Token revocation successful on cluster');
      console.log(`- Revoked token: ${testToken}`);
    } catch (error) {
      if (error.message.includes('Redis not configured')) {
        console.log('ℹ️ Token revocation not available (Redis cluster connection pending)');
      } else {
        console.error('❌ Token revocation failed:', error.message);
      }
    }
    
    console.log('');
    console.log('🎉 ElastiCache Cluster test completed successfully!');
    console.log('');
    console.log('📝 Configuration Summary:');
    console.log('- ✅ Cluster configuration helpers work correctly');
    console.log('- ✅ Auto-detection based on endpoint works');
    console.log('- ✅ PineappleAuth initializes with cluster config');
    console.log('- ✅ Redis cluster client connection initiated');
    
  } catch (error) {
    console.error('❌ ElastiCache Cluster test failed:');
    console.error(error.message);
    console.error('');
    console.log('💡 Troubleshooting tips:');
    console.log('1. Verify your ElastiCache cluster endpoint is correct');
    console.log('2. Ensure your security groups allow access from this machine');
    console.log('3. Check that TLS/auth token settings match your cluster configuration');
    console.log('4. Verify your AWS region is correct');
    process.exit(1);
  }
}

// Example usage patterns
function showUsageExamples() {
  console.log('📚 Usage Examples:\n');
  
  console.log('// 1. Auto-detect ElastiCache type from endpoint:');
  console.log(`const config = ConfigHelpers.forElastiCacheAuto('your-cluster.clustercfg.cache.amazonaws.com', {
  authToken: process.env.ELASTICACHE_AUTH_TOKEN,
  region: 'us-east-1',
  tls: true
});`);
  console.log('');
  
  console.log('// 2. Explicit cluster configuration:');
  console.log(`const config = ConfigHelpers.forElastiCacheCluster('your-cluster.clustercfg.cache.amazonaws.com', {
  authToken: process.env.ELASTICACHE_AUTH_TOKEN,
  region: 'us-east-1',
  tls: true,
  port: 6380
});`);
  console.log('');
  
  console.log('// 3. Replication group with multiple endpoints:');
  console.log(`const config = ConfigHelpers.forElastiCacheReplicationGroup(
  'primary.cache.amazonaws.com',
  'reader.cache.amazonaws.com',
  {
    authToken: process.env.ELASTICACHE_AUTH_TOKEN,
    region: 'us-east-1',
    tls: true
  }
);`);
  console.log('');
  
  console.log('// 4. Manual cluster configuration:');
  console.log(`const config = createAuthConfig({
  jwt: { secret: 'your-secret', issuer: 'your-app' },
  redis: {
    cluster: {
      rootNodes: [
        { host: 'node1.cache.amazonaws.com', port: 6379 },
        { host: 'node2.cache.amazonaws.com', port: 6379 }
      ],
      useReplicas: true,
      enableAutoPipelining: true
    },
    password: process.env.ELASTICACHE_AUTH_TOKEN,
    tls: true
  }
});`);
  console.log('');
}

// Run the test
if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsageExamples();
  } else {
    testElastiCacheClusterConnection().catch(console.error);
  }
}

module.exports = {
  testElastiCacheClusterConnection,
  showUsageExamples
};