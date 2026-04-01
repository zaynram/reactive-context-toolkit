import { describe, it, expect } from 'bun:test'
import { createHook } from '../src/lib/hook'

describe('createHook()', () => {
    it('is exported as a function', () => {
        expect(typeof createHook).toBe('function')
    })
})
