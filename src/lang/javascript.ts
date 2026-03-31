import type { LangEntry, LangConfigFile } from "#config"
import { fs } from "#util"
import tools from "#tools"
export default async function defaultEntry(): Promise<{
    javascript: LangEntry
}> {
    const javascript: LangEntry = {
        tools: tools.javascript,
        config: [fs.manifest("javascript")],
        injectOn: undefined,
    }
    const jsconfig: LangConfigFile = {
        name: "jsconfig",
        path: fs.resolve("jsconfig.json"),
    }
    if (fs.exists(jsconfig.path)) {
        javascript.config!.push(jsconfig)
        await Bun.file(jsconfig.path)
            .json()
            .then(x => (jsconfig.extractPaths = "paths" in x.compilerOptions))
    }
    return { javascript }
}
