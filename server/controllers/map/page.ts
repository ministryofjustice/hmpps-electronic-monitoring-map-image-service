import { RequestHandler } from 'express'
import { parseMapPageControls } from '../../schemas/mapPageControls'

export default class MapPageController {
  view: RequestHandler = (req, res) => {
    const controls = parseMapPageControls(req.query)
    if (!controls) {
      res.status(400).send('Invalid map controls')
      return
    }

    res.render('pages/map', { controls })
  }
}
