import type { LangEntry, LangConfigFile } from "#config"
import { fs } from "#util"
import tools from "#tools"
export default async function defaultEntry(): Promise<{
    typescript: LangEntry
}> {
    const typescript: LangEntry = {
        tools: tools.typescript,
        config: [fs.manifest("typescript")],
        injectOn: undefined,
    }
    const tsconfig: LangConfigFile = {
        name: "tsconfig",
        path: fs.resolve("tsconfig.json"),
    }
    if (fs.exists(tsconfig.path)) {
        typescript.config!.push(tsconfig)
        await Bun.file(tsconfig.path)
            .json()
            .then(x => (tsconfig.extractPaths = "paths" in x.compilerOptions))
    }
    return { typescript }
}
