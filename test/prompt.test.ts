import { describe, expect, test } from 'bun:test'

// Test that the module exports the expected functions
describe('prompt module', () => {
    test('exports ask, confirm, select', async () => {
        const mod = await import('#cli/prompt')
        expect(typeof mod.ask).toBe('function')
        expect(typeof mod.confirm).toBe('function')
        expect(typeof mod.select).toBe('function')
    })
})
