/**
 * RCT Plugin: Redundant Read Guard
 *
 * On PreToolUse(Read), walks the session transcript backward to find the
 * most recent Read of the same file_path. Computes turns/bytes/seconds since
 * then and the file's current size, then calls decide() to gate the read.
 *
 *   - "block" → RCT emits {decision: 'block', reason} and exits 2.
 *               Claude sees the reason and reuses the prior result.
 *   - "warn"  → RCT injects the message into additionalContext. The read
 *               still proceeds, but Claude reasons over the warning first
 *               (e.g. did the user mention an out-of-band edit?).
 *   - "allow" → no action; silent passthrough.
 *
 * Short-circuit: if any Edit/Write/MultiEdit/NotebookEdit on the same file
 * happened after the last read, the re-read is always legitimate.
 */
import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'
import { definePlugin } from '#index'
import type {
    RCTPlugin,
    HookEvent,
    PluginHookInput,
    PluginTriggerResult,
} from '#index'
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])

// Normalization constants for freshness scoring
const TURN_BUDGET = 3
const BYTE_BUDGET = 5000
const SECOND_BUDGET = 60
const ALLOW_THRESHOLD = 2.5
const WARN_THRESHOLD = 1.0

interface ToolInput {
    file_path?: string
}

interface ScanResult {
    turns: number
    bytes: number
    seconds: number
    editedSince: boolean
}

interface DecideArgs {
    turnsSinceRead: number
    bytesSinceRead: number
    secondsSinceRead: number
    fileSize: number
}

function parseTimestamp(ts: unknown): number | null {
    if (typeof ts !== 'string') return null
    const t = Date.parse(ts)
    return Number.isFinite(t) ? t / 1000 : null
}

function scanTranscript(
    transcriptPath: string,
    targetAbs: string,
): ScanResult | null {
    let raw: string
    try {
        raw = readFileSync(transcriptPath, 'utf-8')
    } catch {
        return null
    }
    const lines = raw.split('\n')
    const now = Date.now() / 1000
    let turns = 0
    let bytes = 0
    let editedSince = false

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]
        if (!line) continue
        let msg: any
        try {
            msg = JSON.parse(line)
        } catch {
            bytes += Buffer.byteLength(line, 'utf-8')
            continue
        }

        if (msg?.type === 'assistant') {
            const content = msg?.message?.content ?? []
            for (const item of content) {
                if (!item || typeof item !== 'object') continue
                if (item.type !== 'tool_use') continue
                const fp = item?.input?.file_path
                if (typeof fp !== 'string') continue
                if (resolve(fp) !== targetAbs) continue
                if (item.name === 'Read') {
                    const ts = parseTimestamp(msg.timestamp)
                    return {
                        turns,
                        bytes,
                        seconds: ts ? now - ts : 0,
                        editedSince,
                    }
                }
                if (EDIT_TOOLS.has(item.name)) editedSince = true
            }
            turns += 1
        }

        bytes += Buffer.byteLength(line, 'utf-8')
    }

    return null
}

const normalizeFreshness = (args: DecideArgs) =>
    Math.max(
        args.turnsSinceRead / TURN_BUDGET,
        args.bytesSinceRead / BYTE_BUDGET,
        args.secondsSinceRead / SECOND_BUDGET,
    ) * Math.pow(Math.max(args.fileSize, 1) / BYTE_BUDGET, 0.3)

function decide(args: DecideArgs): PluginTriggerResult | undefined {
    const n = normalizeFreshness(args)
    if (n >= ALLOW_THRESHOLD) return undefined
    if (n >= WARN_THRESHOLD)
        return {
            action: 'warn',
            message: `You read this file ~${Math.round(args.secondsSinceRead / 60)} mins ago; ${args.turnsSinceRead} turns have since passed (constituting ${args.bytesSinceRead} bytes) indicating this file read may be unnecessary.`,
        }
    return {
        action: 'block',
        message: `You read this file ${args.turnsSinceRead} turns ago; refer to the prior read.`,
    }
}

export default definePlugin({
    name: 'rct-plugin-read-guard',
    trigger(event: HookEvent, input: PluginHookInput) {
        if (event !== 'PreToolUse') return undefined
        if (input.toolName !== 'Read') return undefined

        const tool: ToolInput = input.payload?.tool_input ?? {}
        const fp = tool?.file_path
        const transcript = input.payload?.transcript_path as string | undefined

        if (!fp || !transcript) return undefined

        const target = resolve(fp)

        let size: number
        try {
            size = statSync(target).size
        } catch {
            return undefined
        }

        const metrics = scanTranscript(transcript, target)

        if (!metrics?.editedSince) return undefined

        return decide({
            turnsSinceRead: metrics.turns,
            bytesSinceRead: metrics.bytes,
            secondsSinceRead: metrics.seconds,
            fileSize: size,
        })
    },
} as RCTPlugin)
