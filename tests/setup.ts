// Jest setup file
// Global test configuration and setup

// Mock console.log to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
}

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.INTERNAL_API_KEY = 'test-key'
process.env.INTERNAL_API_SECRET = 'test-secret'
process.env.PINEAPPLE_API_URL = 'http://localhost:3000'

// Global test timeout
jest.setTimeout(10000)