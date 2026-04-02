/**
 * rct-plugin-autonomous-ops
 *
 * A cognitive helmet for Claude Code. Project-agnostic operational harness
 * that promotes rigorous, self-steering execution with maximum initiative
 * and minimum wasted motion.
 *
 * Not a set of project rules — a way of thinking. Distilled from observed
 * patterns in high-velocity autonomous development sessions:
 *
 * 1. Evidence before assertions — never claim something works without proof
 * 2. Explore before acting — understand the actual state before changing it
 * 3. Atomic progression — each action should be independently verifiable
 * 4. Self-correction over escalation — fix it yourself before asking
 * 5. Scope awareness — know what you're supposed to touch and what you're not
 */
import {
    definePlugin,
    type PluginHookInput,
    type HookEvent,
} from 'reactive-context-toolkit'

// Trigger dedup (triggers run in-process so module state works)
const warnedPatterns = new Set<string>()

function warnOnce(key: string, message: string) {
    if (warnedPatterns.has(key)) return undefined
    warnedPatterns.add(key)
    return { action: 'warn' as const, message }
}

export default definePlugin({
    name: 'rct-plugin-autonomous-ops',
    contextOn: 'SessionStart',
    contextFrequency: 'once', // RCT handles cross-invocation dedup

    context() {
        warnedPatterns.clear()
        return [
            '<autonomous-ops>',
            '<principle name="evidence-first">',
            '  Never claim work is complete, tests pass, or a bug is fixed without',
            '  running the verification command and confirming its output. "I believe',
            '  this works" is not evidence. Run it.',
            '</principle>',
            '<principle name="explore-before-acting">',
            '  Read the file before editing it. Check git status before committing.',
            '  Understand the current state before proposing changes. Assumptions',
            '  compound — each unchecked assumption multiplies error probability.',
            '</principle>',
            '<principle name="atomic-progression">',
            '  Each change should be independently verifiable. Commit after each',
            '  logical unit of work, not in bulk. If something breaks, the blast',
            '  radius should be one commit, not ten.',
            '</principle>',
            '<principle name="self-correction">',
            '  When something fails, diagnose before retrying. Read the error.',
            '  Check your assumptions. Try a focused fix. Do not retry the same',
            '  action hoping for a different result. Do not escalate to the user',
            '  until you have investigated.',
            '</principle>',
            '<principle name="scope-discipline">',
            '  Know what you are authorized to change and what you are not.',
            '  Document when you expand scope. Do not modify files outside your',
            '  stated objective without acknowledging the expansion.',
            '</principle>',
            '<principle name="minimum-restraint">',
            '  Take initiative. If you can see the next step, take it. Do not',
            '  ask permission for actions within your scope. Make decisions and',
            '  document them. Waiting is a cost — act when you can act.',
            '</principle>',
            '</autonomous-ops>',
        ].join('\n')
    },

    trigger(event: HookEvent, input: PluginHookInput) {
        if (event !== 'PreToolUse') return undefined
        const tool = input.toolName ?? ''
        const payload = input.payload ?? {}
        const cmd = String(payload.command ?? '')

        // Evidence-first: catch "I verified" without actually running anything
        // (This is behavioral — we can't detect it in a trigger. Skip.)

        // Scope-discipline: warn on destructive operations (once each)
        if (tool === 'Bash') {
            if (/git\s+(reset\s+--hard|push\s+--force|clean\s+-fd)/.test(cmd)) {
                return warnOnce(
                    'destructive-git',
                    'Destructive git operation. Confirm intent and that no work will be lost.',
                )
            }
            if (/rm\s+-r/.test(cmd) && !/node_modules|target|__pycache__|\.tmp|\.pixi|dist|build|out/.test(cmd)) {
                return warnOnce(
                    'destructive-rm',
                    'Recursive delete outside known build directories. Verify path.',
                )
            }
        }

        // Atomic-progression: warn on amending published commits
        if (tool === 'Bash' && /git\s+commit\s+--amend/.test(cmd)) {
            return warnOnce(
                'amend',
                'Amending a commit. If this commit has been pushed, prefer a new commit.',
            )
        }

        return undefined
    },
})
