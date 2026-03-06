import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import aws4 from 'aws4'
import { STS } from '@aws-sdk/client-sts'

interface JWTTokens {
  accessToken: string
  refreshToken: string
  tokenId: string
}

interface ServiceCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
}

interface SignedRequestOptions {
  method: string
  url: string
  body?: string
  headers?: Record<string, string>
}

export class PineappleAuthClient {
  private sts?: STS
  private credentialsCache: Map<string, { credentials: ServiceCredentials; expiry: Date }> = new Map()

  constructor(
    private config: {
      jwt?: {
        accessSecret: string
        refreshSecret: string
        issuer: string
      }
      aws?: {
        region: string
        roleArn: string
      }
    }
  ) {
    if (config.aws) {
      this.sts = new STS({ region: config.aws.region })
    }
  }

  /**
   * Generate JWT tokens for user authentication
   */
  generateUserTokens(
    userId: string, 
    email: string, 
    role?: string, 
    permissions?: string[]
  ): JWTTokens {
    if (!this.config.jwt) {
      throw new Error('JWT config not provided')
    }

    const tokenId = crypto.randomUUID()

    const payload = {
      userId,
      email,
      role,
      permissions,
      jti: tokenId
    }

    const accessToken = jwt.sign(
      payload,
      this.config.jwt.accessSecret,
      {
        expiresIn: '15m',
        issuer: this.config.jwt.issuer,
        audience: 'pineapple-services',
        subject: userId
      }
    )

    const refreshToken = jwt.sign(
      { userId, jti: tokenId },
      this.config.jwt.refreshSecret,
      {
        expiresIn: '30d',
        issuer: this.config.jwt.issuer,
        audience: 'pineapple-refresh',
        subject: userId
      }
    )

    return { accessToken, refreshToken, tokenId }
  }

  /**
   * Sign service-to-service request with AWS SigV4
   */
  async signServiceRequest(
    serviceName: string,
    options: SignedRequestOptions
  ): Promise<{ headers: Record<string, string>; body?: string }> {
    if (!this.config.aws || !this.sts) {
      throw new Error('AWS config not provided')
    }

    const credentials = await this.getServiceCredentials(serviceName)
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = crypto.randomUUID()

    // Parse URL
    const urlObj = new URL(options.url)

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'X-Pineapple-Timestamp': timestamp.toString(),
      'X-Pineapple-Nonce': nonce,
      ...options.headers
    }

    // AWS4 signing
    const signOptions = {
      service: 'pineapple',
      region: credentials.region,
      method: options.method.toUpperCase(),
      path: urlObj.pathname + urlObj.search,
      headers,
      body: options.body || '',
      host: urlObj.host
    }

    const signed = aws4.sign(signOptions, {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    })

    return {
      headers: Object.entries(signed.headers || {}).reduce((acc, [key, value]) => {
        if (typeof value === 'string') {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>),
      body: options.body
    }
  }

  /**
   * Get rotating AWS credentials for service
   */
  private async getServiceCredentials(serviceName: string): Promise<ServiceCredentials> {
    const cacheKey = `service-${serviceName}`
    const cached = this.credentialsCache.get(cacheKey)

    // Return cached if valid for 5+ more minutes
    if (cached && cached.expiry.getTime() - Date.now() > 300000) {
      return cached.credentials
    }

    if (!this.sts || !this.config.aws) {
      throw new Error('AWS not configured')
    }

    try {
      const roleArn = `${this.config.aws.roleArn}-${serviceName}`
      const result = await this.sts.assumeRole({
        RoleArn: roleArn,
        RoleSessionName: `${serviceName}-${Date.now()}`,
        DurationSeconds: 3600 // 1 hour
      })

      if (!result.Credentials) {
        throw new Error('Failed to assume role')
      }

      const credentials: ServiceCredentials = {
        accessKeyId: result.Credentials.AccessKeyId!,
        secretAccessKey: result.Credentials.SecretAccessKey!,
        sessionToken: result.Credentials.SessionToken,
        region: this.config.aws.region
      }

      // Cache credentials
      this.credentialsCache.set(cacheKey, {
        credentials,
        expiry: result.Credentials.Expiration!
      })

      return credentials
    } catch (error) {
      throw new Error(`Failed to get service credentials: ${error}`)
    }
  }
}