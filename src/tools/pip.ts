import type { LangTool } from '#config/types'
import { fs } from '#util'
export default {
    name: 'pip',
    manifest: fs.resolve('requirements.txt'),
} as LangTool
