import { generateKeyPairSync } from 'crypto'
import jwt from 'jsonwebtoken'
import { stubFor } from './wiremock'

export const TRUSTED_KEY_ID = 'integration-test-key'
const ISSUER = 'http://localhost:9091/auth/issuer'

// The service caches HMPPS Auth's keys, so the key must stay the same for the whole test run (Playwright uses one worker).
const newKeyPair = () => generateKeyPairSync('rsa', { modulusLength: 2048 })
const trustedKeyPair = newKeyPair()

// Serves the public key HMPPS Auth would publish, so the service can verify tokens signed here.
const stubJwks = () =>
  stubFor({
    request: { method: 'GET', urlPath: '/auth/.well-known/jwks.json' },
    response: {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: {
        keys: [
          { ...trustedKeyPair.publicKey.export({ format: 'jwk' }), kid: TRUSTED_KEY_ID, alg: 'RS256', use: 'sig' },
        ],
      },
    },
  })

type TokenOptions = { keyId?: string; untrustedKey?: boolean }

const signToken = (roles: string[], { keyId = TRUSTED_KEY_ID, untrustedKey = false }: TokenOptions = {}) =>
  jwt.sign(
    { authorities: roles, client_id: 'crime-matching-api' },
    (untrustedKey ? newKeyPair() : trustedKeyPair).privateKey,
    {
      algorithm: 'RS256',
      keyid: keyId,
      issuer: ISSUER,
      expiresIn: 600,
    },
  )

// Keeps the header and signature of a valid token but swaps in a payload that claims different roles.
const tamperWithRoles = (token: string, roles: string[]) => {
  const [header, encodedPayload, signature] = token.split('.')
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString())
  const tampered = Buffer.from(JSON.stringify({ ...payload, authorities: roles })).toString('base64url')
  return `${header}.${tampered}.${signature}`
}

const signUnsignedToken = (roles: string[]) =>
  jwt.sign({ authorities: roles, client_id: 'crime-matching-api' }, '', {
    algorithm: 'none',
    keyid: TRUSTED_KEY_ID,
    issuer: ISSUER,
    expiresIn: 600,
  })

export default { stubJwks, signToken, tamperWithRoles, signUnsignedToken }
