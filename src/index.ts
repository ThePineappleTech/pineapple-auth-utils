export { PineappleAuth, createAuthMiddleware } from './middleware/auth.middleware'
export { PineappleAuthClient } from './client/auth.client'
export { createPublicAuth } from './middleware/public-auth.middleware'

// Type exports
export interface AuthConfig {
  jwt: {
    secret: string
    issuer: string
  }
  aws: {
    region: string
    service: string
  }
  redis?: {
    url: string
  }
}

export interface AuthContext {
  userId: string
  email: string
  role?: string
  permissions?: string[]
  tokenId: string
  type: 'jwt' | 'service'
}