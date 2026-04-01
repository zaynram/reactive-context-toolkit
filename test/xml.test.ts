import { describe, expect, test } from 'bun:test'
import { xml } from '#util'

describe('xml.inline attribute escaping', () => {
    test('escapes ampersands in attribute values', () => {
        const result = xml.inline('task', { name: 'build & test' })
        expect(result).toBe('<task name="build &amp; test"/>')
    })

    test('escapes double quotes in attribute values', () => {
        const result = xml.inline('task', { synopsis: 'say "hello"' })
        expect(result).toBe('<task synopsis="say &quot;hello&quot;"/>')
    })

    test('escapes less-than and greater-than in attribute values', () => {
        const result = xml.inline('task', { usage: 'cmd <arg>' })
        expect(result).toBe('<task usage="cmd &lt;arg&gt;"/>')
    })

    test('escapes multiple special chars in the same value', () => {
        const result = xml.inline('task', { name: 'a&b<c"d>e' })
        expect(result).toBe('<task name="a&amp;b&lt;c&quot;d&gt;e"/>')
    })

    test('leaves plain attribute values unchanged', () => {
        const result = xml.inline('task', { name: 'my-task', index: '1' })
        expect(result).toBe('<task name="my-task" index="1"/>')
    })
})

describe('xml.open attribute escaping', () => {
    test('escapes special chars in open tag attributes', () => {
        const result = xml.open('config', { name: 'foo & "bar"' })
        expect(result).toBe('<config name="foo &amp; &quot;bar&quot;">')
    })
})
