import { expect, test } from '@playwright/test'

const body = { layers: [{ type: 'locations', id: 'l', points: [{ latitude: 51.5, longitude: -0.1 }] }] }

test.describe('Map image authentication', () => {
  test('rejects a request with no token', async ({ request }) => {
    const response = await request.post('/map-image', { data: body })

    expect(response.status()).toBe(401)
    expect(response.headers()['www-authenticate']).toBe('Bearer')
    expect(await response.json()).toMatchObject({ status: 401, code: 'AUTH_FAILURE' })
  })

  test('rejects a token that is not a valid JWT', async ({ request }) => {
    const response = await request.post('/map-image', {
      data: body,
      headers: { Authorization: 'Bearer not-a-jwt' },
    })

    expect(response.status()).toBe(401)
    expect(await response.json()).toMatchObject({ status: 401, code: 'AUTH_FAILURE' })
  })

  test('still serves the map page without a token', async ({ request }) => {
    const response = await request.get('/map')

    expect(response.status()).toBe(200)
  })
})
