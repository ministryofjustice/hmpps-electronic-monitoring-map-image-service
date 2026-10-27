import { expect, test } from '@playwright/test'
import { imageSize } from 'image-size'
import ordnanceSurvey from '../mockApis/ordnanceSurvey'
import { resetStubs } from '../mockApis/wiremock'
import mapRenderSchema from '../../server/schemas/mapRender'
import MapRendererService from '../../server/services/mapRendererService'
import PlaywrightBrowserService from '../../server/services/playwrightBrowserService'

const browserService = new PlaywrightBrowserService()
const renderer = new MapRendererService(browserService, 'http://localhost:3007')

const render = (request: unknown) => renderer.render(mapRenderSchema.parse(request))

const points = [
  { latitude: 51.5, longitude: -0.12 },
  { latitude: 51.51, longitude: -0.1 },
  { latitude: 51.52, longitude: -0.09 },
]

test.describe('Map render', () => {
  test.beforeEach(async () => {
    await ordnanceSurvey.stubOSAll()
  })

  test.afterEach(async () => {
    await resetStubs()
  })

  test.afterAll(async () => {
    await browserService.close()
  })

  test('renders a jpeg of the default size', async () => {
    const { image, contentType } = await render({ layers: [{ type: 'locations', id: 'l', points }] })

    expect(contentType).toBe('image/jpeg')
    expect(imageSize(image)).toMatchObject({ type: 'jpg', width: 800, height: 600 })
  })

  test('renders a png at the requested size and pixel ratio', async () => {
    const { image, contentType } = await render({
      output: { width: 400, height: 300, format: 'png', pixelRatio: 2 },
      layers: [{ type: 'locations', id: 'l', points }],
    })

    expect(contentType).toBe('image/png')
    expect(imageSize(image)).toMatchObject({ type: 'png', width: 800, height: 600 })
  })

  test('draws each layer type', async () => {
    const base = { output: { format: 'png' }, viewport: { mode: 'explicit', centre: points[1], zoom: 13 } }
    const blank = (await render({ ...base, layers: [] })).image

    const layers = [
      { type: 'tracks', id: 't', points },
      { type: 'lines', id: 'l', points },
      { type: 'circles', id: 'c', points: points.map(point => ({ ...point, precision: 300 })) },
      { type: 'locations', id: 'p', points },
      { type: 'text', id: 'x', points: points.map((point, index) => ({ ...point, label: `P${index + 1}` })) },
    ]

    for (const layer of layers) {
      // eslint-disable-next-line no-await-in-loop
      const { image } = await render({ ...base, layers: [layer] })
      // eslint-disable-next-line no-await-in-loop
      await test.info().attach(layer.type, { body: image, contentType: 'image/png' })

      expect(image.equals(blank), `${layer.type} should draw something`).toBe(false)
    }
  })

  test('only renders the supplied layers', async () => {
    const base = { output: { format: 'png' } }
    const one = await render({ ...base, layers: [{ type: 'lines', id: 'a', points }] })
    const same = await render({ ...base, layers: [{ type: 'lines', id: 'a', points }] })
    const two = await render({
      ...base,
      layers: [
        { type: 'lines', id: 'a', points },
        { type: 'locations', id: 'b', points },
      ],
    })

    expect(same.image.equals(one.image)).toBe(true)
    expect(two.image.equals(one.image)).toBe(false)
  })

  test('draws solid and dashed tracks differently', async () => {
    const base = { output: { format: 'png' } }
    const solid = await render({ ...base, layers: [{ type: 'tracks', id: 't', points }] })
    const dashed = await render({
      ...base,
      layers: [{ type: 'tracks', id: 't', points, style: { stroke: { lineDash: [10, 10] } } }],
    })

    expect(dashed.image.equals(solid.image)).toBe(false)
  })

  test('fits to the data, so different data gives a different view', async () => {
    const base = { output: { format: 'png' } }
    const near = await render({ ...base, layers: [{ type: 'locations', id: 'p', points: points.slice(0, 2) }] })
    const far = await render({
      ...base,
      layers: [{ type: 'locations', id: 'p', points: [points[0], { latitude: 52.5, longitude: -1.9 }] }],
    })

    expect(far.image.equals(near.image)).toBe(false)
  })

  test('renders an explicit viewport with no layers', async () => {
    const { image } = await render({ viewport: { mode: 'explicit', centre: points[0], zoom: 12 } })

    expect(imageSize(image).type).toBe('jpg')
  })

  test('includes the attribution when supplied', async () => {
    const base = { output: { format: 'png' }, viewport: { mode: 'explicit', centre: points[0], zoom: 12 } }
    const without = await render(base)
    const withText = await render({ ...base, output: { ...base.output, attribution: 'Contains OS data' } })

    expect(withText.image.equals(without.image)).toBe(false)
  })
})
