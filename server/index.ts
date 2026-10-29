import createApp from './app'
import { services as createServices } from './services'

export const services = createServices()
export const app = createApp(services)
