import hook from './hook'
import init from './init'
if (process.argv[1] === __filename) {
    switch (process.argv[2]) {
        case 'init':
            init().catch((e) => {
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
    }
}
