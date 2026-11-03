import { expect, test, type APIRequestContext } from '@playwright/test'
import clientCredentials from '../mockApis/clientCredentials'
import { resetStubs } from '../mockApis/wiremock'

const requiredRole = 'ROLE_EM_MAP_IMAGE__RENDERS__RO'

const body = { layers: [{ type: 'locations', id: 'l', points: [{ latitude: 51.5, longitude: -0.1 }] }] }

test.describe('Map image authentication', () => {
  test.beforeEach(async () => {
    await clientCredentials.stubJwks()
  })

  test.afterEach(async () => {
    await resetStubs()
  })

  const postWith = (request: APIRequestContext, token?: string) =>
    request.post('/map-image', { data: body, headers: token ? { Authorization: `Bearer ${token}` } : {} })

  test('rejects a request with no token', async ({ request }) => {
    const response = await postWith(request)

    expect(response.status()).toBe(401)
    expect(response.headers()['www-authenticate']).toBe('Bearer')
    expect(await response.json()).toMatchObject({ status: 401, code: 'AUTH_FAILURE' })
  })

  test('rejects a token that is not a valid JWT', async ({ request }) => {
    const response = await postWith(request, 'not-a-jwt')

    expect(response.status()).toBe(401)
  })

  test.describe('rejects a token that claims the required role but is not genuine', () => {
    test('signed with a different key and the trusted key id', async ({ request }) => {
      const token = clientCredentials.signToken([requiredRole], { untrustedKey: true })

      expect((await postWith(request, token)).status()).toBe(401)
    })

    test('signed with a different key and an unknown key id', async ({ request }) => {
      const token = clientCredentials.signToken([requiredRole], { untrustedKey: true, keyId: 'unknown-key' })

      expect((await postWith(request, token)).status()).toBe(401)
    })

    test('with the roles changed after it was signed', async ({ request }) => {
      const token = clientCredentials.tamperWithRoles(clientCredentials.signToken([]), [requiredRole])

      expect((await postWith(request, token)).status()).toBe(401)
    })

    test('with no signature', async ({ request }) => {
      const token = clientCredentials.signUnsignedToken([requiredRole])

      expect((await postWith(request, token)).status()).toBe(401)
    })
  })

  test('still serves the map page without a token', async ({ request }) => {
    const response = await request.get('/map')

    expect(response.status()).toBe(200)
  })
})
