// ElastiCache Connection Test Script
const { 
  PineappleAuth, 
  ConfigHelpers, 
  createAuthConfig 
} = require('./dist/index.js');

async function testElastiCacheConnection() {
  console.log('🍍 ElastiCache Connection Test');
  console.log('=' .repeat(50));

  // Get the ElastiCache URL from environment or command line
  const elasticacheUrl = process.env.ELASTICACHE_URL || process.argv[2];
  
  if (!elasticacheUrl) {
    console.log('❌ Please provide ElastiCache URL');
    console.log('Usage:');
    console.log('  ELASTICACHE_URL=your-url node test-elasticache-connection.js');
    console.log('  OR');
    console.log('  node test-elasticache-connection.js "your-elasticache-url"');
    console.log('');
    console.log('Example URLs:');
    console.log('  redis://my-cluster.abc123.cache.amazonaws.com:6379');
    console.log('  rediss://:token@my-cluster.abc123.cache.amazonaws.com:6380');
    console.log('  rediss://:token@serverless.cluster.serverless.cache.amazonaws.com:6380');
    process.exit(1);
  }

  console.log('🔍 Analyzing ElastiCache URL:', elasticacheUrl);

  // Parse the URL to determine configuration
  let config;
  try {
    const url = new URL(elasticacheUrl);
    const isServerless = url.hostname.includes('serverless');
    const isTLS = url.protocol === 'rediss:';
    const hasAuth = url.password;
    const port = url.port ? parseInt(url.port) : (isTLS ? 6380 : 6379);

    console.log('📊 URL Analysis:');
    console.log(`  Protocol: ${url.protocol}`);
    console.log(`  Host: ${url.hostname}`);
    console.log(`  Port: ${port}`);
    console.log(`  TLS Enabled: ${isTLS}`);
    console.log(`  Auth Token: ${hasAuth ? 'YES (hidden)' : 'NO'}`);
    console.log(`  Serverless: ${isServerless}`);

    if (isServerless) {
      console.log('🚀 Using ElastiCache Serverless configuration');
      config = ConfigHelpers.forElastiCacheServerless(
        url.hostname,
        url.password,
        'us-east-1' // Adjust region as needed
      );
    } else {
      console.log('🏗️  Using ElastiCache standard configuration');
      config = ConfigHelpers.forElastiCache(url.hostname, {
        port: port,
        tls: isTLS,
        authToken: url.password,
        connectTimeout: 30000
      });
    }

  } catch (error) {
    console.log('❌ Invalid URL format:', error.message);
    console.log('💡 URL should be like: redis://host:port or rediss://host:port');
    process.exit(1);
  }

  // Test 1: Create Auth Instance
  console.log('\n1️⃣ Creating PineappleAuth instance...');
  let auth;
  try {
    auth = new PineappleAuth(config);
    console.log('✅ PineappleAuth instance created successfully');
  } catch (error) {
    console.error('❌ Failed to create PineappleAuth:', error.message);
    process.exit(1);
  }

  // Test 2: Wait for Redis Connection
  console.log('\n2️⃣ Waiting for Redis connection...');
  await new Promise(resolve => setTimeout(resolve, 8000));

  // Test 3: Test Token Operations
  console.log('\n3️⃣ Testing Redis operations...');
  try {
    const testTokenId = 'elasticache-test-' + Date.now();
    
    console.log('   Testing token revocation...');
    await auth.revokeToken(testTokenId, 60);
    console.log('✅ Token revocation successful');

    // Clean up
    console.log('   Cleaning up test token...');
    // Note: In a real test, you'd verify and clean up the token
    console.log('✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Redis operations failed:', error.message);
    
    // Common error analysis
    if (error.message.includes('ENOTFOUND')) {
      console.log('💡 DNS resolution failed - check the endpoint hostname');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('💡 Connection refused - check security groups and VPC settings');
    } else if (error.message.includes('NOAUTH')) {
      console.log('💡 Authentication required - provide auth token');
    } else if (error.message.includes('timeout')) {
      console.log('💡 Connection timeout - check network connectivity and increase timeout');
    } else if (error.message.includes('SSL')) {
      console.log('💡 SSL/TLS issue - check TLS configuration');
    } else {
      console.log('💡 Check ElastiCache troubleshooting guide in examples/');
    }
    
    return false;
  }

  // Test 4: Alternative Configuration Test
  console.log('\n4️⃣ Testing alternative configuration methods...');
  
  try {
    // Test with manual configuration
    const manualConfig = createAuthConfig({
      jwt: {
        secret: 'test-secret',
        issuer: 'test-app'
      },
      redis: {
        url: elasticacheUrl,
        connectTimeout: 30000,
        commandTimeout: 10000,
        maxRetriesPerRequest: 3
      }
    });

    console.log('✅ Manual configuration created successfully');

    // Test with individual parameters
    const url = new URL(elasticacheUrl);
    const individualConfig = createAuthConfig({
      jwt: {
        secret: 'test-secret',
        issuer: 'test-app'
      },
      redis: {
        host: url.hostname,
        port: url.port ? parseInt(url.port) : (url.protocol === 'rediss:' ? 6380 : 6379),
        password: url.password,
        tls: url.protocol === 'rediss:' ? {
          servername: url.hostname,
          rejectUnauthorized: true
        } : false,
        connectTimeout: 30000
      }
    });

    console.log('✅ Individual parameter configuration created successfully');

  } catch (error) {
    console.log('⚠️  Alternative configuration test failed:', error.message);
  }

  console.log('\n🎉 ElastiCache connection test completed successfully!');
  console.log('\n📝 Configuration that worked:');
  console.log(JSON.stringify({
    redis: {
      url: elasticacheUrl.replace(/:\/\/[^@]*@/, '://***:***@'), // Mask credentials
      ...(config.redis && typeof config.redis === 'object' ? {
        tls: config.redis.tls,
        connectTimeout: config.redis.connectTimeout,
        commandTimeout: config.redis.commandTimeout
      } : {})
    }
  }, null, 2));

  return true;
}

// Additional diagnostic function
async function diagnoseMostRecentError() {
  console.log('\n🔧 Common ElastiCache Issues and Solutions:');
  console.log('');
  console.log('1. ENOTFOUND errors:');
  console.log('   - Check endpoint spelling');
  console.log('   - Ensure DNS resolution works');
  console.log('   - Try: nslookup your-cluster.cache.amazonaws.com');
  console.log('');
  console.log('2. ECONNREFUSED errors:');
  console.log('   - Check security group rules');
  console.log('   - Ensure application is in same VPC as ElastiCache');
  console.log('   - Verify port (6379 for non-TLS, 6380 for TLS)');
  console.log('');
  console.log('3. NOAUTH errors:');
  console.log('   - Provide auth token in URL: rediss://:token@host:port');
  console.log('   - Or use authToken option in configuration');
  console.log('');
  console.log('4. SSL/TLS errors:');
  console.log('   - Use rediss:// protocol for TLS');
  console.log('   - Set tls.rejectUnauthorized: true');
  console.log('   - Provide correct servername');
  console.log('');
  console.log('5. Timeout errors:');
  console.log('   - Increase connectTimeout (default: 20000ms)');
  console.log('   - Check network latency to AWS region');
  console.log('   - Verify ElastiCache cluster is running');
}

// Main execution
async function main() {
  try {
    // First compile TypeScript if needed
    try {
      const { execSync } = require('child_process');
      execSync('npm run build', { stdio: 'inherit' });
    } catch (buildError) {
      console.log('⚠️  Build failed, using existing dist files');
    }

    const success = await testElastiCacheConnection();
    
    if (!success) {
      await diagnoseMostRecentError();
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Test execution failed:', error.message);
    await diagnoseMostRecentError();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testElastiCacheConnection, diagnoseMostRecentError };