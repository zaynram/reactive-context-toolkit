export const CLAUDE_PROJECT_DIR =
    process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
export const LANGUAGES = ['node', 'python', 'rust'] as const
export const BUILTIN_PLUGINS = [
    'rct-plugin-track-work',
    'rct-plugin-tasktools',
    'rct-plugin-read-guard',
] as const
declare global {
    type SupportedLanguage = (typeof LANGUAGES)[number]
}
