export default {
    name: 'throwing-context',
    context() {
        throw new Error('context exploded in integration test')
    },
}
