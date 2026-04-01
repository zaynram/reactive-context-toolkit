import { describe, expect, it } from 'bun:test'
import { parseListPanes, validateTarget } from '../src/lib/tmux'
import { InvalidTargetError } from '../src/lib/types'

describe('parseListPanes', () => {
    it('parses a single pane', () => {
        const output = 'main:0.0\t120\t40\tbash\t1'
        const result = parseListPanes(output)
        expect(result).toEqual([
            {
                target: 'main:0.0',
                width: 120,
                height: 40,
                command: 'bash',
                active: true,
            },
        ])
    })

    it('parses multiple panes across sessions', () => {
        const output = [
            'dev:0.0\t100\t30\tbash\t1',
            'dev:0.1\t100\t30\tnode\t0',
            'work:0.0\t80\t24\tvim\t1',
        ].join('\n')
        const result = parseListPanes(output)
        expect(result).toHaveLength(3)
        expect(result[0].target).toBe('dev:0.0')
        expect(result[0].active).toBe(true)
        expect(result[1].target).toBe('dev:0.1')
        expect(result[1].command).toBe('node')
        expect(result[1].active).toBe(false)
        expect(result[2].target).toBe('work:0.0')
    })

    it('returns empty array for empty output', () => {
        expect(parseListPanes('')).toEqual([])
    })

    it('skips malformed lines', () => {
        const output =
            'dev:0.0\t100\t30\tbash\t1\nbadline\nwork:0.0\t80\t24\tvim\t0'
        const result = parseListPanes(output)
        expect(result).toHaveLength(2)
    })
})

describe('validateTarget', () => {
    it('accepts simple session name', () => {
        expect(() => validateTarget('main')).not.toThrow()
    })

    it('accepts session:window.pane format', () => {
        expect(() => validateTarget('main:0.1')).not.toThrow()
    })

    it('accepts tmux ID targets with $, @, %', () => {
        expect(() => validateTarget('$0')).not.toThrow()
        expect(() => validateTarget('@1')).not.toThrow()
        expect(() => validateTarget('%2')).not.toThrow()
    })

    it('accepts targets with hyphens and underscores', () => {
        expect(() => validateTarget('my-session_1:0.0')).not.toThrow()
    })

    it('accepts targets with slashes', () => {
        expect(() => validateTarget('session/sub:0.0')).not.toThrow()
    })

    it('rejects empty string', () => {
        expect(() => validateTarget('')).toThrow(InvalidTargetError)
    })

    it('rejects shell injection attempts', () => {
        expect(() => validateTarget(';rm -rf /')).toThrow(InvalidTargetError)
        expect(() => validateTarget('$(whoami)')).toThrow(InvalidTargetError)
        expect(() => validateTarget('`id`')).toThrow(InvalidTargetError)
        expect(() => validateTarget('foo bar')).toThrow(InvalidTargetError)
    })
})
