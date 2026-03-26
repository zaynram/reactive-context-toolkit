import { spawn } from "child_process"
import { fs } from "../lib/index.mjs"
void ["sessionStart.mjs"]
    .map(f => fs.resolve(".claude", "hooks", f))
    .forEach(p =>
        spawn("node", [p], {
            stdio: "inherit",
        }).on("close", code => {
            if (!code) return
            throw Error(`sessionStart.mjs exited with code ${code}`)
        }),
    )
