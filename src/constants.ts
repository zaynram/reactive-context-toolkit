import path from "path"

export const CLAUDE_PROJECT_DIR =
    process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
export const RCT_PREFIX = path.join(
    CLAUDE_PROJECT_DIR,
    "node_modules",
    "reactive-context-toolkit",
)
export const LANGUAGES = ["python", "javascript", "typescript", "rust"] as const

declare global {
    type SupportedLanguage = (typeof LANGUAGES)[number]
}
