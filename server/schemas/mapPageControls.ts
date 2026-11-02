import { z } from 'zod'
import { DEFAULT_CONTROLS } from './mapRender'
import type { MapRenderModel } from '../presenters/mapRender'

// The /map page is loaded with its controls in the query string, as the Nunjucks view is rendered before the
// request data reaches the page. This keeps the encoding and validation of that query in one place.
const mapPageControlsSchema = z.strictObject({
  compass: z
    .enum(['true', 'false'])
    .transform(value => value === 'true')
    .optional(),
  scaleBar: z
    .enum(['bar', 'line', 'none'])
    .transform(value => (value === 'none' ? (false as const) : value))
    .optional(),
})

export const parseMapPageControls = (query: unknown): MapRenderModel['controls'] | undefined => {
  const parsed = mapPageControlsSchema.safeParse(query)
  if (!parsed.success) return undefined

  return {
    compass: parsed.data.compass ?? DEFAULT_CONTROLS.compass,
    scaleBar: parsed.data.scaleBar ?? DEFAULT_CONTROLS.scaleBar,
  }
}

export const toMapPageQuery = (controls: MapRenderModel['controls']): string =>
  new URLSearchParams({ compass: String(controls.compass), scaleBar: controls.scaleBar || 'none' }).toString()
