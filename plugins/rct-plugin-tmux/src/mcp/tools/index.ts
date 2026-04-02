import { McpServer } from '#types'

import close from './close'
import read from './read'
import list from './list'
import send from './send'
import split from './split'

const tmuxTools = { close, read, list, send, split } as const
export const registerTmuxTools = (server: McpServer) =>
    Object.values(tmuxTools).map((t) => t.register(server))
export default tmuxTools
