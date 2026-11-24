import promClient from 'prom-client'

// A dedicated registry avoids duplicate-metric errors if this module is loaded twice
const register = new promClient.Registry()

promClient.collectDefaultMetrics({ register })

export default register
