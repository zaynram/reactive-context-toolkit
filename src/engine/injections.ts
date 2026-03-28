import type { InjectionEntry, HookEvent, GlobalsConfig } from "#config/types"
import type { FileRegistry } from "#config/files"
import { evaluateMatch, extractTargetValue } from "./evaluate"
import { normalize } from "#util"
import { applyStaleCheck } from "#config/schema"

export function evaluateInjections(
  injections: InjectionEntry[],
  event: HookEvent,
  toolName: string | undefined,
  payload: Record<string, unknown>,
  registry: FileRegistry,
  globals: Required<GlobalsConfig>,
): string[] {
  const results: string[] = []

  for (const injection of injections) {
    // Skip disabled
    if (injection.enabled === false) continue

    // Filter by event
    if (injection.on !== event) continue

    // Filter by matcher (pipe-delimited tool names)
    if (injection.matcher && toolName) {
      const matchers = injection.matcher.split("|")
      if (!matchers.includes(toolName)) continue
    } else if (injection.matcher && !toolName) {
      continue
    }

    // Check matchFile: tool_input.file_path must match a registered file
    if (injection.matchFile) {
      const filePath = extractTargetValue("file_path", payload)
      if (!filePath) continue
      const matchedFile = registry.get(injection.matchFile)
      if (!matchedFile || matchedFile.path !== normalize(filePath)) continue
    }

    // Evaluate match conditions
    if (injection.match) {
      if (!evaluateMatch(injection.match, payload)) continue
    }

    // Resolve file refs and collect content
    const format = injection.format ?? globals.format
    const wrapper = injection.wrapper

    for (const ref of injection.inject) {
      const resolved = registry.getRef(ref)
      if (!resolved) continue

      const { file, useBrief } = resolved
      const shouldUseBrief = useBrief || injection.brief === true || globals.briefByDefault

      let content: string
      if (shouldUseBrief && file.brief) {
        content = file.brief
      } else {
        content = file.read()
        if (file.staleCheck) {
          content = applyStaleCheck(content, file.staleCheck)
        }
      }

      // Wrap content if wrapper specified
      if (wrapper) {
        if (format === "json") {
          content = JSON.stringify({ [wrapper]: content })
        } else {
          content = `<${wrapper}>${content}</${wrapper}>`
        }
      }

      results.push(content)
    }
  }

  return results
}
