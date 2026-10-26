import mapRenderSchema from '../schemas/mapRender'
import presentMapRender from './mapRender'

const parse = (request: unknown) => mapRenderSchema.parse(request)

const point = { latitude: 51.5, longitude: -0.1 }

describe('presentMapRender', () => {
  it('fills output and viewport defaults when output is omitted', () => {
    const model = presentMapRender(parse({ layers: [{ type: 'locations', id: 'l', points: [point] }] }))

    expect(model.output).toEqual({ width: 800, height: 600, format: 'jpeg', quality: 90, pixelRatio: 1 })
    expect(model.viewport).toEqual({ mode: 'fit', padding: 20, maxZoom: 18 })
  })

  it('keeps an explicit viewport', () => {
    const model = presentMapRender(
      parse({
        viewport: { mode: 'explicit', centre: { latitude: 51.5, longitude: -0.1 }, zoom: 12 },
        layers: [],
      }),
    )

    expect(model.viewport).toEqual({ mode: 'explicit', centre: { latitude: 51.5, longitude: -0.1 }, zoom: 12 })
    expect(model.layers).toEqual([])
  })

  it('fills missing fit options', () => {
    const model = presentMapRender(
      parse({ viewport: { mode: 'fit', padding: 50 }, layers: [{ type: 'locations', id: 'l', points: [point] }] }),
    )

    expect(model.viewport).toEqual({ mode: 'fit', padding: 50, maxZoom: 18 })
  })

  it('fills only the missing output fields', () => {
    const model = presentMapRender(
      parse({ output: { width: 1000 }, layers: [{ type: 'locations', id: 'l', points: [point] }] }),
    )

    expect(model.output).toMatchObject({ width: 1000, height: 600, format: 'jpeg' })
  })

  it('omits quality for png', () => {
    const model = presentMapRender(
      parse({
        output: { width: 800, height: 600, format: 'png' },
        layers: [{ type: 'locations', id: 'l', points: [point] }],
      }),
    )

    expect(model.output).not.toHaveProperty('quality')
  })

  it('orders layers by array index, makes them visible and keeps solid and dashed tracks distinct', () => {
    const model = presentMapRender(
      parse({
        output: { width: 800, height: 600, format: 'png' },
        layers: [
          { type: 'tracks', id: 'solid', points: [point, point], style: { stroke: { color: '#ff0000' } } },
          {
            type: 'tracks',
            id: 'dashed',
            points: [point, point],
            style: { stroke: { color: '#00ff00', lineDash: [8, 4] } },
          },
        ],
      }),
    )

    expect(model.layers.map(layer => [layer.options.id, layer.options.zIndex, layer.options.visible])).toEqual([
      ['solid', 0, true],
      ['dashed', 1, true],
    ])
    expect(model.layers[0].options).toMatchObject({ style: { stroke: { color: '#ff0000' } } })
    expect(model.layers[0].options.style?.stroke).not.toHaveProperty('lineDash')
    expect(model.layers[1].options).toMatchObject({ style: { stroke: { lineDash: [8, 4] } } })
  })

  it('keeps circle precision in metres and defaults it to zero for other layers', () => {
    const model = presentMapRender(
      parse({
        output: { width: 800, height: 600, format: 'png' },
        layers: [
          { type: 'circles', id: 'c', points: [{ ...point, precision: 250 }] },
          { type: 'locations', id: 'l', points: [point] },
        ],
      }),
    )

    expect(model.layers[0].options.positions?.[0].precision).toBe(250)
    expect(model.layers[1].options.positions?.[0].precision).toBe(0)
  })

  it('turns off accessible marker buttons on locations', () => {
    const model = presentMapRender(
      parse({
        output: { width: 800, height: 600, format: 'png' },
        layers: [{ type: 'locations', id: 'l', points: [point] }],
      }),
    )

    expect(model.layers[0].options).toMatchObject({ accessibleMarkers: false, renderer: 'auto' })
  })

  it('uses a transparent stroke for no text halo as the component always draws one', () => {
    const model = presentMapRender(
      parse({
        layers: [{ type: 'text', id: 't', points: [{ ...point, label: '1' }], style: { haloWidth: 0 } }],
      }),
    )

    expect(model.layers[0].options.style?.stroke).toEqual({ color: 'rgba(0, 0, 0, 0)', width: 1 })
  })

  it('maps text style to a font string, halo and label property, and lists fonts to preload', () => {
    const model = presentMapRender(
      parse({
        output: { width: 800, height: 600, format: 'png' },
        layers: [
          {
            type: 'text',
            id: 't',
            points: [{ ...point, label: '1' }],
            style: { color: '#000000', haloColor: '#ffffff', haloWidth: 4, size: 18 },
          },
        ],
      }),
    )

    expect(model.layers[0].options).toMatchObject({
      textProperty: 'label',
      style: {
        fill: '#000000',
        font: 'bold 18px "GDS Transport", system-ui, sans-serif',
        stroke: { color: '#ffffff', width: 4 },
      },
    })
    expect(model.layers[0].options.positions?.[0]).toMatchObject({ label: '1' })
    expect(model.fonts).toEqual(['bold 18px "GDS Transport", system-ui, sans-serif'])
  })

  it('has no attribution when it is omitted', () => {
    const model = presentMapRender(parse({ layers: [{ type: 'locations', id: 'l', points: [point] }] }))

    expect(model.attribution).toBeUndefined()
  })

  it('passes the attribution text through', () => {
    const model = presentMapRender(
      parse({ output: { attribution: 'Contains OS data' }, layers: [{ type: 'locations', id: 'l', points: [point] }] }),
    )

    expect(model.attribution).toBe('Contains OS data')
  })

  it('presents a line with a default colour and no dash', () => {
    const model = presentMapRender(parse({ layers: [{ type: 'lines', id: 'line', points: [point, point] }] }))

    expect(model.layers[0]).toMatchObject({
      type: 'lines',
      options: { id: 'line', visible: true, style: { stroke: { color: '#1d70b8' } } },
    })
    expect(model.fonts).toEqual([])
  })
})
