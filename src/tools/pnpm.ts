import type { LangTool } from '#config/types'
import { fs } from '#util'
export default {
    name: 'pnpm',
    config: fs.resolve('pnpm-workspace.yaml'),
    manifest: fs.resolve('package.json'),
} as LangTool
