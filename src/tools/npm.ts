import type { LangTool } from '#config/types'
import { fs } from '#util'
export default { name: 'npm', manifest: fs.resolve('package.json') } as LangTool
