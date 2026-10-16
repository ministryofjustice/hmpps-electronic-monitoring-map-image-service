import { expect, test } from '@playwright/test'
import ordnanceSurvey from '../mockApis/ordnanceSurvey'
import { resetStubs } from '../mockApis/wiremock'

test.describe('OS map proxy', () => {
  test.beforeEach(async () => {
    await ordnanceSurvey.stubOSAll()
  })

  test.afterEach(async () => {
    await resetStubs()
  })

  test('serves the style', async ({ request }) => {
    const response = await request.get('/os-map/vector/style')

    expect(response.status()).toBe(200)
    expect(await response.json()).toHaveProperty('layers')
  })

  test('serves the vector source', async ({ request }) => {
    const response = await request.get('/os-map/vector/source')

    expect(response.status()).toBe(200)
    expect(await response.json()).toHaveProperty('tiles')
  })

  test('serves a tile', async ({ request }) => {
    const response = await request.get('/os-map/vector/tiles/5/10/16.pbf?srs=3857')

    expect(response.status()).toBe(200)
  })

  test('serves sprites', async ({ request }) => {
    const response = await request.get('/os-map/vector/assets/sprites/sprite.json?srs=3857')

    expect(response.status()).toBe(200)
    expect(await response.json()).toHaveProperty('stubIcon')
  })

  test('serves fonts', async ({ request }) => {
    const response = await request.get('/os-map/vector/assets/fonts/Source%20Sans/0-255.pbf?srs=3857')

    expect(response.status()).toBe(200)
    expect(await response.text()).toBe('stub-font')
  })

  test('does not require sign-in', async ({ request }) => {
    const response = await request.get('/os-map/vector/style', { maxRedirects: 0 })

    expect(response.status()).toBe(200)
  })
})
