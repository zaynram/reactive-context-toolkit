interface ErrorTextOptions {
    prefix?: string
    suffix?: string
}
interface ErrorWriteOptions {
    level?: 'debug' | 'warn' | 'error'
    inner?: unknown
    separator?: string
}
export default {
    isinstance<T extends string = string>(
        err: unknown,
        name?: T
    ): err is Error & { name: T } {
        return err instanceof Error && (!name || err.name === name)
    },
    text(e: unknown, { prefix = '', suffix = '' }: ErrorTextOptions = {}): string {
        return !e ? '' : `${prefix}${e instanceof Error ? e.message : String(e)}${suffix}`
    },
    /**
    @description
    Write an error message to the console, optionally wrapping a serialized `inner` error.
    @param msg {string | Error}
    The message to write to the console or an error to serialize
    @param [options.level]
    The console method to write with
    @default 'warn'
    @param [options.inner]
    An error to include in the logged message
    @default undefined
    @param [options.separator]
    Separator between `msg` and serialized `inner`
    @default ': '
    */
    write(
        error: string | Error,
        { level = 'warn', separator = ': ', inner }: ErrorWriteOptions = {}
    ) {
        const parts = [this.text(error), this.text(inner, { prefix: separator })]
        return console[level ?? 'warn']('[rct]'.concat(...parts))
    },
}
