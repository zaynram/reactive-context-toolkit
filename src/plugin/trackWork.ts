import type { RCTPlugin } from './types'
import { fs } from '#util'
const metaFiles = [
    {
        alias: 'entry-schema',
        path: fs.source(['public', 'schema', 'entry-schema.xml']),
    } as const,
]
export default {
    name: 'track-work',
    files: [
        {
            alias: 'chores',
            path: 'dev/chores.xml',
            injectOn: 'SessionStart',
            metaFiles,
        },
        {
            alias: 'plans',
            path: '.claude/plans/index.xml',
            injectOn: 'SessionStart',
            metaFiles,
        },
    ],
} as RCTPlugin
