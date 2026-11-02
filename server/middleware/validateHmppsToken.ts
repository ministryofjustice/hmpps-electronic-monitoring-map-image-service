import type { NextFunction, Request, RequestHandler, Response } from 'express'
import createError from 'http-errors'
import jwt from 'jsonwebtoken'
import type { JwksClient } from 'jwks-rsa'
import logger from '../../logger'

const unauthorised = (message: string) => createError(401, message, { headers: { 'WWW-Authenticate': 'Bearer' } })

// Authenticates service-to-service callers using an HMPPS Auth client credentials token.
// Most APIs do this in Kotlin/Spring so found a similar use-case in a TypeScript/Node UI repo:
// https://github.com/ministryofjustice/hmpps-pin-phone-medusa-service-api/blob/main/backend/src/api/middlewares/validateHmppsToken.ts
export default function validateHmppsToken(requiredRole: string, issuer: string, client: JwksClient): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      logger.error('Missing authorization token')
      return next(unauthorised('Missing authorization token'))
    }

    const token = authHeader.split(' ')[1]

    const decoded = jwt.decode(token, { complete: true })
    if (!decoded?.header?.kid) {
      return next(unauthorised('Malformed token'))
    }

    try {
      const key = await client.getSigningKey(decoded.header.kid)

      const verified = jwt.verify(token, key.getPublicKey(), {
        algorithms: ['RS256'],
        issuer,
      }) as {
        client_id?: string
        authorities?: string[]
      }

      const authorities = verified.authorities ?? []
      if (!authorities.includes(requiredRole)) {
        return next(createError(403, 'Insufficient roles'))
      }

      return next()
    } catch (err) {
      const message = err instanceof jwt.TokenExpiredError ? 'Token expired' : 'Invalid token'

      logger.error('Auth failure:', message, err)
      return next(unauthorised(message))
    }
  }
}
