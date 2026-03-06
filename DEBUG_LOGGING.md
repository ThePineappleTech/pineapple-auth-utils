# JWT Authentication Debug Logging

## 📝 What You'll See in Logs

The JWT authentication middleware now includes comprehensive debug logging to help you troubleshoot authentication issues.

## 🔍 Log Categories

### **Initialization Logs**
```
🍍 [PINEAPPLE-AUTH] Initializing authentication middleware
🍍 [PINEAPPLE-AUTH] JWT Issuer: pineapple-auth
🍍 [PINEAPPLE-AUTH] JWT Secret configured: YES
🍍 [PINEAPPLE-AUTH] Redis configured: YES
🍍 [PINEAPPLE-AUTH] Connecting to Redis: redis://localhost:6379
🍍 [PINEAPPLE-AUTH] ✅ Redis connected successfully
🍍 [PINEAPPLE-AUTH] ✅ Authentication middleware initialized
```

### **JWT Authentication Logs**
Each request gets a unique ID for tracking:

```
[JWT-AUTH-abc123def] 🔐 Starting JWT validation for GET /api/vehicles
[JWT-AUTH-abc123def] 📝 Auth header present: YES
[JWT-AUTH-abc123def] 🎫 Token extracted (length: 245)
[JWT-AUTH-abc123def] 🎫 Token preview: eyJhbGciOiJIUzI1NiIs...
[JWT-AUTH-abc123def] 🔍 Verifying JWT with secret: jnhYLeP9Se...
[JWT-AUTH-abc123def] 🔍 Expected issuer: pineapple-auth
[JWT-AUTH-abc123def] ✅ JWT decoded successfully
[JWT-AUTH-abc123def] 👤 User: john@example.com (ID: 12345)
[JWT-AUTH-abc123def] 🎭 Role: user
[JWT-AUTH-abc123def] 🎯 Token ID: uuid-token-id
[JWT-AUTH-abc123def] ⏰ Expires: 2024-01-01T15:30:00.000Z
[JWT-AUTH-abc123def] 🔄 Checking token revocation in Redis
[JWT-AUTH-abc123def] ✅ Token not revoked
[JWT-AUTH-abc123def] ⏰ Current time: 1640966400, Token exp: 1640970000
[JWT-AUTH-abc123def] ✅ Authentication successful - proceeding to next middleware
```

### **Error Logs**
Authentication failures are clearly logged:

```
[JWT-AUTH-xyz789abc] ❌ Invalid auth header format: Basic dXNlcjpwYXNz
[JWT-AUTH-xyz789abc] ❌ JWT verification failed: TokenExpiredError
[JWT-AUTH-xyz789abc] ❌ JWT error details: jwt expired
[JWT-AUTH-xyz789abc] ⏰ Token expired at: 2024-01-01T14:30:00.000Z
```

### **Service Authentication Logs**
For internal service-to-service calls:

```
[SERVICE-AUTH-def456ghi] 🔧 Starting service auth validation for POST /internal/users
[SERVICE-AUTH-def456ghi] 📝 Auth header: Present (AWS4)
[SERVICE-AUTH-def456ghi] ⏰ Timestamp: 1640966400 (2024-01-01T14:00:00.000Z)
[SERVICE-AUTH-def456ghi] 🎲 Nonce: uuid-nonce-123
[SERVICE-AUTH-def456ghi] ⏰ Time difference: 5s (max 300s)
[SERVICE-AUTH-def456ghi] 🔄 Checking nonce replay in Redis
[SERVICE-AUTH-def456ghi] ✅ Nonce stored for replay protection
[SERVICE-AUTH-def456ghi] 🏷️  Extracted service name: motor-service
[SERVICE-AUTH-def456ghi] ✅ Service authentication successful - proceeding to next middleware
```

## 🚨 Common Error Patterns

### **1. Missing Authorization Header**
```
[JWT-AUTH-abc123def] ❌ Invalid auth header format: missing
```
**Solution:** Frontend must send `Authorization: Bearer <token>` header

### **2. Wrong JWT Secret**
```
[JWT-AUTH-abc123def] ❌ JWT verification failed: JsonWebTokenError
[JWT-AUTH-abc123def] ❌ JWT error details: invalid signature
```
**Solution:** Check JWT_ACCESS_SECRET matches across auth service and application

### **3. Wrong Issuer**
```
[JWT-AUTH-abc123def] ❌ JWT verification failed: JsonWebTokenError
[JWT-AUTH-abc123def] ❌ JWT error details: jwt issuer invalid
```
**Solution:** Check JWT_ISSUER environment variable matches

### **4. Redis Connection Issues**
```
🍍 [PINEAPPLE-AUTH] ❌ Redis connection failed: Error: ECONNREFUSED 127.0.0.1:6379
[JWT-AUTH-abc123def] ⚠️  Redis not configured - skipping revocation check
```
**Solution:** Start Redis server: `redis-server`

### **5. Token Expired**
```
[JWT-AUTH-abc123def] ❌ JWT verification failed: TokenExpiredError
[JWT-AUTH-abc123def] ⏰ Token expired at: 2024-01-01T14:30:00.000Z
```
**Solution:** Frontend should automatically refresh token or redirect to login

## 🔧 Debug Tips

1. **Look for the request ID** - Each auth attempt has a unique ID like `[JWT-AUTH-abc123def]`
2. **Check initialization logs** - Make sure middleware starts correctly
3. **Verify token format** - Token preview shows first 20 characters
4. **Check timing** - Token expiry vs current time
5. **Redis connectivity** - Make sure Redis connection succeeds

## 🎛️ Environment Variables to Verify

```bash
JWT_ACCESS_SECRET=your-secret-here   # Must match auth service
JWT_ISSUER=pineapple-auth           # Must match token issuer
REDIS_URL=redis://localhost:6379    # For token revocation
```

The logs will tell you exactly what's configured and what's failing!