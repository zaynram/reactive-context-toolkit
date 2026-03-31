import type { LangTool } from "#config/types"
import { fs } from "#util"
export default {
    name: "uv",
    config: fs.resolve("pyproject.toml"),
    manifest: fs.resolve("pyproject.toml"),
} as LangTool
