import { spawn } from "child_process"
import { fs } from "../lib/index.mjs"
void ["preToolBash.mjs", "preToolNotion.mjs", "preToolWrite.mjs"]
    .map(f => fs.resolve(".claude", "hooks", f))
    .forEach(p =>
        spawn("node", [p], { stdio: "inherit" }).on("close", code => {
            if (!code) return
            throw Error(`sessionStart.mjs exited with code ${code}`)
        }),
    )
