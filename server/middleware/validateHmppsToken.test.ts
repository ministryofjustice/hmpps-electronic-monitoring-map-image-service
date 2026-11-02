import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { JwksClient } from 'jwks-rsa'
import validateHmppsToken from './validateHmppsToken'

jest.mock('../../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}))

jest.mock('jsonwebtoken', () => {
  const MockTokenExpiredError = class extends Error {
    name = 'TokenExpiredError'
  }
  return {
    decode: jest.fn(),
    verify: jest.fn(),
    TokenExpiredError: MockTokenExpiredError,
  }
})

const ISSUER = 'http://auth/issuer'
const REQUIRED_ROLE = 'ROLE_EM_MAP_IMAGE__RENDERS__RO'

const mockGetSigningKey = jest.fn()
const middleware = validateHmppsToken(REQUIRED_ROLE, ISSUER, {
  getSigningKey: mockGetSigningKey,
} as unknown as JwksClient)

const buildReq = (authHeader?: string) => ({ headers: { authorization: authHeader } }) as Request

const jwtDecode = jwt.decode as jest.Mock
const jwtVerify = jwt.verify as jest.Mock

const run = async (authHeader?: string) => {
  const next = jest.fn()
  await middleware(buildReq(authHeader), {} as Response, next)
  return next
}

beforeEach(() => jest.clearAllMocks())

describe('validateHmppsToken', () => {
  it('rejects when there is no Authorization header', async () => {
    const next = await run(undefined)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, message: 'Missing authorization token' }))
    expect(next.mock.calls[0][0].headers).toEqual({ 'WWW-Authenticate': 'Bearer' })
  })

  it('rejects when the header is not a Bearer token', async () => {
    const next = await run('Basic abc')

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }))
  })

  it('rejects when the token is malformed', async () => {
    jwtDecode.mockReturnValue(null)

    const next = await run('Bearer token')

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, message: 'Malformed token' }))
  })

  it('next when the token is valid and has the required role', async () => {
    jwtDecode.mockReturnValue({ header: { kid: 'key' } })
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'public-key' })
    jwtVerify.mockReturnValue({ client_id: 'crime-matching-api', authorities: [REQUIRED_ROLE] })

    const next = await run('Bearer token')

    expect(next).toHaveBeenCalledWith()
    expect(jwt.verify).toHaveBeenCalledWith('token', 'public-key', { algorithms: ['RS256'], issuer: ISSUER })
  })

  it('returns 403 when the token does not have the required role', async () => {
    jwtDecode.mockReturnValue({ header: { kid: 'key' } })
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'public-key' })
    jwtVerify.mockReturnValue({ authorities: ['ROLE_OTHER'] })

    const next = await run('Bearer token')

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, message: 'Insufficient roles' }))
  })

  it('returns 403 when the token has no authorities', async () => {
    jwtDecode.mockReturnValue({ header: { kid: 'key' } })
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'public-key' })
    jwtVerify.mockReturnValue({})

    const next = await run('Bearer token')

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }))
  })

  it('returns 401 with "Token expired" for expired tokens', async () => {
    jwtDecode.mockReturnValue({ header: { kid: 'key' } })
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'public-key' })
    jwtVerify.mockImplementation(() => {
      throw new (jwt.TokenExpiredError as unknown as new (message: string) => Error)('jwt expired')
    })

    const next = await run('Bearer token')

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, message: 'Token expired' }))
  })

  it('returns 401 with "Invalid token" when verification fails', async () => {
    jwtDecode.mockReturnValue({ header: { kid: 'key' } })
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'public-key' })
    jwtVerify.mockImplementation(() => {
      throw new Error('invalid signature')
    })

    const next = await run('Bearer token')

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, message: 'Invalid token' }))
  })

  it('returns 401 when the signing key cannot be found', async () => {
    jwtDecode.mockReturnValue({ header: { kid: 'unknown' } })
    mockGetSigningKey.mockRejectedValue(new Error('Unable to find a signing key'))

    const next = await run('Bearer token')

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, message: 'Invalid token' }))
  })
})
