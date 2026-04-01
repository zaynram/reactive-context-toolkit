import hook from './hook'
import init from './init'
if (process.argv[1] === __filename) {
    const args = process.argv.slice(3)
    switch (process.argv[2]) {
        case 'init':
            init(args).catch((e) => {
                console.error(e)
                process.exit(1)
            })
            break
        case 'hook':
            hook(process.argv[3]).catch((e) => {
                console.error(e)
                process.exit(1)
            })
            break
        case 'update':
            import('./update')
                .then((m) => m.default(args))
                .catch((e) => {
                    console.error(e)
                    process.exit(1)
                })
            break
    }
}
