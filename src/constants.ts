export const CLAUDE_PROJECT_DIR =
    process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
export const LANGUAGES = ['node', 'python', 'rust'] as const

declare global {
    type SupportedLanguage = (typeof LANGUAGES)[number]
}
