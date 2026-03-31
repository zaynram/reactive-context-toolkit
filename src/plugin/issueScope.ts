import type { RCTPlugin } from "./types"

const plugin = {
    name: "issue-scope",
    files: [
        {
            alias: "scope",
            path: ".claude/context/scope.xml",
            injectOn: "SessionStart",
            staleCheck: { dateTag: "date", wrapTag: "stale-scope" },
        },
        {
            alias: "candidates",
            path: ".claude/context/issues.xml",
            metaFiles: [
                {
                    alias: "issues-schema",
                    path: "node_modules/reactive-context-toolkit/public/schema/issues-schema.xml",
                },
            ],
        },
    ],
} as RCTPlugin
export default plugin
