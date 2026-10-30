import { Request, Response, Router } from 'express'
import { parseMapPageControls } from '../schemas/mapPageControls'

export default function setUpMapPage(): Router {
  const router = Router()

  router.get('/map', (req: Request, res: Response) => {
    const controls = parseMapPageControls(req.query)
    if (!controls) {
      res.status(400).send('Invalid map controls')
      return
    }

    res.render('pages/map', { controls })
  })

  return router
}
