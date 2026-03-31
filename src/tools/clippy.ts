import type { LangTool } from "#config/types"
import { fs } from "#util"
export default {
    name: "clippy",
    manifest: fs.resolve("Cargo.toml"),
} as LangTool
