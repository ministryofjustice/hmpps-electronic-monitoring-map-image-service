import { Request, Response, Router } from 'express'

export default function setUpMapPage(): Router {
  const router = Router()

  router.get('/map', (_req: Request, res: Response) => {
    res.render('pages/map')
  })

  return router
}
