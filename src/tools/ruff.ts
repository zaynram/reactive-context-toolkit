import type { LangTool } from "#config/types"
import { fs } from "#util"
export default {
    name: "ruff",
    config: fs.resolve("ruff.toml"),
    manifest: fs.resolve("pyproject.toml"),
} as LangTool
