import { RequestHandler } from 'express'
import createError from 'http-errors'
import mapRenderSchema from '../../schemas/mapRender'
import type MapRendererService from '../../services/mapRendererService'

export default class MapImageController {
  constructor(private readonly mapRendererService: MapRendererService) {}

  create: RequestHandler = async (req, res) => {
    const result = mapRenderSchema.safeParse(req.body)

    if (!result.success) {
      const errors = result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
      throw createError(400, 'Invalid map render request', { errors })
    }

    const { image, contentType } = await this.mapRendererService.render(result.data)
    res.set('Cache-Control', 'no-store').type(contentType).send(image)
  }
}
