import { agencyHandlers } from './agencies.js'
import { routeHandlers } from './routes.js'
import { stopHandlers } from './stops.js'
import { departureHandlers } from './departures.js'
import { feedHandlers } from './feeds.js'

export const handlers = [
  ...agencyHandlers,
  ...routeHandlers,
  ...stopHandlers,
  ...departureHandlers,
  ...feedHandlers,
]
