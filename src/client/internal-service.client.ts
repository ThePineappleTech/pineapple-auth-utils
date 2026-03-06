import crypto from 'crypto'
import axios from 'axios'

/**
 * Client for making authenticated calls from PUBLIC services to INTERNAL services
 * Uses simple signature-based authentication with rotating secrets
 */
export class InternalServiceClient {
  private serviceName: string
  private apiKey: string
  private apiSecret: string

  constructor(serviceName: string) {
    this.serviceName = serviceName
    this.apiKey = process.env.INTERNAL_API_KEY || 'default-key'
    this.apiSecret = process.env.INTERNAL_API_SECRET || 'default-secret'
  }

  /**
   * Make authenticated call to internal service via pineapple-api
   */
  async callInternalService(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
  ): Promise<any> {
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = crypto.randomUUID()
    
    // Create signature with nonce for one-time use
    const signatureData = `${this.apiKey}:${timestamp}:${nonce}:${this.apiSecret}`
    const signature = crypto.createHash('sha256').update(signatureData).digest('hex').toUpperCase()

    const headers = {
      'Authorization': `PINEAPPLE-INTERNAL key=${this.apiKey} timestamp=${timestamp} nonce=${nonce} signature=${signature}`,
      'Content-Type': 'application/json',
      'X-Service-Name': this.serviceName
    }

    const baseUrl = process.env.PINEAPPLE_API_URL || 'http://localhost:3000'
    const url = `${baseUrl}${endpoint}`

    try {
      const response = await axios({
        method,
        url,
        headers,
        data: data ? JSON.stringify(data) : undefined
      })

      return response.data
    } catch (error: any) {
      console.error(`Internal service call failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Call auth service for user operations
   */
  async callAuthService(endpoint: string, data?: any): Promise<any> {
    return this.callInternalService(`/internal/auth${endpoint}`, 'POST', data)
  }

  /**
   * Example: Validate user session
   */
  async validateUserSession(userId: string): Promise<any> {
    return this.callAuthService('/validate-session', { userId })
  }

  /**
   * Example: Get user profile
   */
  async getUserProfile(userId: string): Promise<any> {
    return this.callAuthService('/user-profile', { userId })
  }
}