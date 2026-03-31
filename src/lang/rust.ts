import { fs } from "#util"
import type { LangEntry } from "#config"
import tools from "#tools"

export default async function defaultEntry(): Promise<{
    rust: LangEntry
}> {
    return {
        rust: {
            tools: tools.rust,
            config: [fs.manifest("rust")],
            injectOn: undefined,
        },
    }
}
