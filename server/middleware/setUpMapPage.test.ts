import express from 'express'
import request from 'supertest'
import setUpMapPage from './setUpMapPage'

describe('GET /map', () => {
  const render = jest.fn()
  const app = express()
  app.use((_req, res, next) => {
    res.render = ((view: string, locals: unknown) => {
      render(view, locals)
      res.send('<html></html>')
    }) as typeof res.render
    next()
  })
  app.use(setUpMapPage())

  beforeEach(() => render.mockClear())

  it('defaults to compass and scale bar', async () => {
    await request(app).get('/map').expect(200)

    expect(render.mock.calls[0][1]).toEqual({ controls: { compass: true, scaleBar: 'bar' } })
  })

  it('passes validated controls to the view', async () => {
    await request(app).get('/map?compass=false&scaleBar=none').expect(200)

    expect(render.mock.calls[0][1]).toEqual({ controls: { compass: false, scaleBar: false } })
  })

  it.each(['compass=maybe', 'scaleBar=huge', 'other=1'])('rejects %s', async query => {
    await request(app).get(`/map?${query}`).expect(400)
    expect(render).not.toHaveBeenCalled()
  })
})
