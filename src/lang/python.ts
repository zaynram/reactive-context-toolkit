import { fs } from "#util"
import type { LangEntry } from "#config"
import tools from "#tools"
export default async function defaultEntry(): Promise<{
    python: LangEntry
}> {
    return {
        python: {
            tools: tools.python,
            config: [fs.manifest("python")],
            injectOn: undefined,
        },
    }
}
