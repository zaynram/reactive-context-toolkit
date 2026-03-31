import type { LangTool } from "#config/types"
import { fs } from "#util"
export default {
    name: "cargo",
    config: fs.resolve("Cargo.toml"),
} as LangTool
