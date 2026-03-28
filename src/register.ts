import { RC } from "#types"
import { minify } from "#util"

export function standard<T extends RC.HookEvent = RC.HookEvent>(
    output: RC.HookSpecificOutput<T>,
    extra: RC.ExtraHookJSONOutput<T>,
): never {
    console.log(
        minify(
            JSON.stringify({
                hookSpecificOutput: output,
                ...extra,
            } as RC.HookJSONOutput<T>),
        ),
    )
    return process.exit()
}

function isError(e: unknown): e is Error {
    return (
        e !== null &&
        typeof e === "object" &&
        "message" in e &&
        typeof e.message === "string"
    )
}

export async function dynamic<
    T extends RC.HookEvent = RC.HookEvent,
>(): Promise<RC.HookInput> {
    return new Promise<RC.HookInput<T>>((resolve, reject) => {
        let data = ""
        process.stdin.on("data", chunk => (data += chunk))
        process.stdin.on("end", () => {
            try {
                resolve({
                    ...(JSON.parse(data) ?? {}),
                    inject: standard,
                })
            } catch (e: unknown) {
                reject(
                    block({
                        stopReason: isError(e)
                            ? e.message
                            : "An unknown error occured.",
                    }),
                )
            }
        })
        process.stdin.on("error", ({ message }) =>
            reject(block<T>({ stopReason: message })),
        )
    })
}

export function block<T extends RC.HookEvent = RC.HookEvent>(
    output: Omit<RC.HookJSONOutput<T>, "decision" | "hookSpecificOutput">,
): never {
    console.log(
        minify(
            JSON.stringify({
                ...output,
                decision: "block",
            } as RC.HookJSONOutput<T>),
        ),
    )
    return process.exit(2)
}
