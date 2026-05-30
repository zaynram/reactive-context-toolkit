#!/usr/bin/env bun
import { HookEvent } from '#config'
async function main() {
    const [, , subcommand, ...args] = process.argv
    switch (subcommand) {
        case 'init':
            await import('./init')
                .then(m => m.default(args))
                .catch(e => Bun.stderr.write(e).then(() => process.exit(1)))
            break
        case 'hook':
            const event = args.at(0) as HookEvent | undefined
            if (event)
                await import('./hook')
                    .then(m => m.default(event))
                    .catch(e => Bun.stderr.write(e).then(() => process.exit(1)))
            else
                await Bun.stderr
                    .write('usage: rct hook <event>')
                    .then(() => process.exit(1))
            break
        case 'update':
            await import('./update')
                .then(m => m.default(args))
                .catch(e => Bun.stderr.write(e).then(() => process.exit(1)))
            break
        default:
            await Bun.stderr
                .write(`usage: rct <init|hook|update> [...args]`)
                .then(() => process.exit(1))
    }
}

if (import.meta.main) await main().then(() => process.exit(0))
