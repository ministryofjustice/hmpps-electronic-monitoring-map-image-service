import express from 'express'
import createError from 'http-errors'
import request from 'supertest'
import mapImageRoutes from './map-image'
import type MapRendererService from '../services/mapRendererService'

jest.mock('../../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}))

describe('POST /map-image', () => {
  const render = jest.fn()
  const validRequest = {
    layers: [{ type: 'locations', id: 'l', points: [{ latitude: 51.5, longitude: -0.1 }] }],
  }

  const app = express().use(mapImageRoutes({ render } as unknown as MapRendererService))

  afterEach(() => {
    jest.resetAllMocks()
  })

  it.each([
    ['image/jpeg', Buffer.from('jpeg-image')],
    ['image/png', Buffer.from('png-image')],
  ])('returns the rendered %s image', async (contentType, image) => {
    render.mockResolvedValue({ image, contentType })

    const response = await request(app).post('/map-image').send(validRequest)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe(contentType)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body).toEqual(image)
  })

  it('passes the parsed request, with defaults applied, to the renderer', async () => {
    render.mockResolvedValue({ image: Buffer.from('x'), contentType: 'image/jpeg' })

    await request(app).post('/map-image').send(validRequest)

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ layers: [expect.objectContaining({ type: 'locations', id: 'l' })] }),
    )
  })

  it('returns 400 with the validation errors for an invalid request', async () => {
    const response = await request(app)
      .post('/map-image')
      .send({ output: { width: 1 }, layers: [] })

    expect(response.status).toBe(400)
    expect(response.type).toBe('application/json')
    expect(response.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Invalid map render request',
    })
    expect(response.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'output.width' })]))
    expect(render).not.toHaveBeenCalled()
  })

  it('returns 400 when there is no body', async () => {
    const response = await request(app).post('/map-image').set('Content-Type', 'application/json')

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('VALIDATION_FAILED')
    expect(render).not.toHaveBeenCalled()
  })

  it('returns 415 when the request is not JSON', async () => {
    const response = await request(app).post('/map-image').type('text/plain').send('This should be JSON')

    expect(response.status).toBe(415)
    expect(response.body).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' })
    expect(render).not.toHaveBeenCalled()
  })

  it('returns 415 when there is no content type', async () => {
    const response = await request(app).post('/map-image')

    expect(response.status).toBe(415)
  })

  it('returns 400 for malformed JSON', async () => {
    const response = await request(app).post('/map-image').set('Content-Type', 'application/json').send('{ malformed')

    expect(response.status).toBe(400)
    expect(response.type).toBe('application/json')
    expect(response.body.code).toBe('VALIDATION_FAILED')
    expect(render).not.toHaveBeenCalled()
  })

  it('returns 413 when the body is too large', async () => {
    const response = await request(app)
      .post('/map-image')
      // Send a body over the 2mb JSON limit.
      .send({ padding: 'x'.repeat(3 * 1024 * 1024) })

    expect(response.status).toBe(413)
    expect(response.type).toBe('application/json')
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('returns 504 when the render times out', async () => {
    render.mockRejectedValue(createError(504, 'Map render did not complete within 30000ms'))

    const response = await request(app).post('/map-image').send(validRequest)

    expect(response.status).toBe(504)
    expect(response.body).toEqual({ status: 504, code: 'RENDER_TIMEOUT', message: 'Map render timed out' })
  })

  it('returns 500 with a generic message when rendering fails', async () => {
    render.mockRejectedValue(new Error('Chromium crashed at /secret/path'))

    const response = await request(app).post('/map-image').send(validRequest)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ status: 500, code: 'RENDER_FAILED', message: 'Failed to render map image' })
  })
})
