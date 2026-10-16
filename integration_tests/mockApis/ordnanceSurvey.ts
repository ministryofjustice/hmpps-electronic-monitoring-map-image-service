import { stubFor } from './wiremock'

const baseUrl = '/os'

const stubOSGetToken = () =>
  stubFor({
    request: {
      method: 'POST',
      urlPath: `${baseUrl}/oauth2/token/v1`,
    },
    response: {
      status: 200,
      jsonBody: {},
    },
  })

const stubOSGetVectorStyle = () =>
  stubFor({
    request: {
      method: 'GET',
      urlPath: `${baseUrl}/vts/resources/styles`,
    },
    response: {
      status: 200,
      jsonBody: {
        version: 8,
        sources: {
          'os-source': { type: 'vector', url: 'http://localhost:9091/os/original-source' },
        },
        layers: [
          { id: 'background', type: 'background', paint: {} },
          { id: 'stub-layer', type: 'fill', source: 'os-source', paint: {} },
        ],
      },
    },
  })

const stubOSGetVectorSource = () =>
  stubFor({
    request: {
      method: 'GET',
      urlPath: `${baseUrl}/original-source`,
    },
    response: {
      status: 200,
      jsonBody: {
        type: 'vector',
        tiles: ['/os-map/vector/tiles/{z}/{x}/{y}.pbf'],
      },
    },
  })

const stubOSGetTile = () =>
  stubFor({
    request: {
      method: 'GET',
      urlPathPattern: `${baseUrl}/vts/tile/[0-9]+/[0-9]+/[0-9]+\\.pbf`,
    },
    response: {
      status: 200,
      base64Body: Buffer.from('').toString('base64'),
    },
  })

const stubOSGetSprite = () =>
  stubFor({
    request: {
      method: 'GET',
      urlPath: `${baseUrl}/vts/resources/sprites/sprite.json`,
    },
    response: {
      status: 200,
      jsonBody: { stubIcon: { x: 0, y: 0, width: 1, height: 1, pixelRatio: 1 } },
    },
  })

const stubOSGetFont = () =>
  stubFor({
    request: {
      method: 'GET',
      urlPathPattern: `${baseUrl}/vts/resources/fonts/.+\\.pbf`,
    },
    response: {
      status: 200,
      headers: { 'Content-Type': 'application/x-protobuf' },
      base64Body: Buffer.from('stub-font').toString('base64'),
    },
  })

const stubOSAll = () =>
  Promise.all([
    stubOSGetToken(),
    stubOSGetVectorStyle(),
    stubOSGetVectorSource(),
    stubOSGetTile(),
    stubOSGetSprite(),
    stubOSGetFont(),
  ])

export default {
  stubOSAll,
  stubOSGetFont,
  stubOSGetSprite,
  stubOSGetTile,
  stubOSGetToken,
  stubOSGetVectorSource,
  stubOSGetVectorStyle,
}
