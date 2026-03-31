import { LangTool } from "#config"

import bun from "./bun"
import cargo from "./cargo"
import clippy from "./clippy"
import npm from "./npm"
import pip from "./pip"
import pnpm from "./pnpm"
import ruff from "./ruff"
import uv from "./uv"
import pixi from "./pixi"
import { fs } from "#util"

let pyprojectManager: string | null = null

export const python = Object.values({ pip, uv, ruff, pixi }).filter(t => {
    if (t.config) return fs.exists(t.config)
    if (pyprojectManager) return false
    if (t.manifest) {
        pyprojectManager = t.name
        return fs.exists(t.manifest)
    }
})
export const rust = Object.values({ cargo, clippy, pixi }).filter(t => {
    const path = t.config ?? t.manifest
    return path && fs.exists(path)
})
export const javascript = [
    Object.values({ bun, npm, pnpm }).find(async t =>
        t?.manifest
            ? await Bun.file(t.manifest)
                  .json()
                  .then(obj =>
                      `${obj.packageManager}`.split("@").includes(t.name),
                  )
            : false,
    ),
]
export default {
    rust: Object.values(rust),
    python: Object.values(python),
    javascript: javascript,
    typescript: [...javascript],
} as Record<SupportedLanguage, LangTool[]>
