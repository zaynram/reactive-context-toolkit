import type { RCTConfig, MetaConfig, GlobalsConfig, LangConfig } from "#config/types"
import type { FileRegistry } from "#config/files"
import { xml } from "#util"

type MetaSection = "files" | "lang" | "test" | "rules"

interface FileMeta {
  alias: string
  path: string
  brief?: string
}

interface LangMeta {
  language: string
  tools: string[]
}

interface TestMeta {
  configured: boolean
}

interface RulesMeta {
  count: number
  actions: string[]
}

type SectionData = {
  files?: FileMeta[]
  lang?: LangMeta[]
  test?: TestMeta
  rules?: RulesMeta
}

function buildFilesSection(config: RCTConfig, registry: FileRegistry, brief: boolean): FileMeta[] {
  const files = config.files ?? []
  return files.map((f) => {
    const alias = f.alias ?? f.path
    const ref = registry.get(alias)
    const entry: FileMeta = { alias, path: f.path }
    if (brief && (f.brief || ref?.brief)) {
      entry.brief = f.brief ?? ref?.brief
    }
    return entry
  })
}

function buildLangSection(lang: LangConfig): LangMeta[] {
  const result: LangMeta[] = []
  for (const [language, entry] of Object.entries(lang)) {
    if (!entry) continue
    const tools = (entry.tools ?? []).map((t) => t.name)
    result.push({ language, tools })
  }
  return result
}

function buildTestSection(config: RCTConfig): TestMeta {
  return { configured: !!config.test }
}

function buildRulesSection(config: RCTConfig): RulesMeta {
  const rules = config.rules ?? []
  const actions = [...new Set(rules.map((r) => r.action))]
  return { count: rules.length, actions }
}

function formatXml(sections: SectionData): string {
  const parts: string[] = []
  parts.push(xml.open("rct-meta"))

  if (sections.files) {
    parts.push(xml.open("files"))
    for (const f of sections.files) {
      parts.push(xml.inline("file", { alias: f.alias, path: f.path, ...(f.brief && { brief: f.brief }) }))
    }
    parts.push(xml.close("files"))
  }

  if (sections.lang) {
    parts.push(xml.open("lang"))
    for (const l of sections.lang) {
      parts.push(xml.inline("language", { name: l.language, tools: l.tools.join(", ") }))
    }
    parts.push(xml.close("lang"))
  }

  if (sections.test) {
    parts.push(xml.inline("test", { configured: String(sections.test.configured) }))
  }

  if (sections.rules) {
    parts.push(xml.inline("rules", { count: String(sections.rules.count), actions: sections.rules.actions.join(", ") }))
  }

  parts.push(xml.close("rct-meta"))
  return parts.join("")
}

function formatJson(sections: SectionData): string {
  return JSON.stringify(sections)
}

function formatPath(sections: SectionData): string {
  const parts: string[] = []

  if (sections.files) {
    parts.push("files:")
    for (const f of sections.files) {
      const briefStr = f.brief ? ` (${f.brief})` : ""
      parts.push(`  ${f.alias}: ${f.path}${briefStr}`)
    }
  }

  if (sections.lang) {
    parts.push("lang:")
    for (const l of sections.lang) {
      parts.push(`  ${l.language}: ${l.tools.join(", ")}`)
    }
  }

  if (sections.test) {
    parts.push(`test: configured=${sections.test.configured}`)
  }

  if (sections.rules) {
    parts.push(`rules: count=${sections.rules.count}, actions=${sections.rules.actions.join(", ")}`)
  }

  return parts.join("\n")
}

function formatRaw(sections: SectionData): string {
  const parts: string[] = []

  if (sections.files) {
    for (const f of sections.files) {
      const briefStr = f.brief ? ` (${f.brief})` : ""
      parts.push(`${f.alias}: ${f.path}${briefStr}`)
    }
  }

  if (sections.lang) {
    for (const l of sections.lang) {
      parts.push(`${l.language}: ${l.tools.join(", ")}`)
    }
  }

  if (sections.test) {
    parts.push(`test: configured=${sections.test.configured}`)
  }

  if (sections.rules) {
    parts.push(`rules: count=${sections.rules.count}, actions=${sections.rules.actions.join(", ")}`)
  }

  return parts.join("\n")
}

export function generateMeta(
  config: RCTConfig,
  registry: FileRegistry,
  globals: Required<GlobalsConfig>,
  metaConfig: MetaConfig,
): string {
  const include: MetaSection[] = metaConfig.include ?? ["files", "lang"]
  const brief = metaConfig.brief ?? true
  const enumeration = metaConfig.contents?.enumeration ?? "xml"

  const sections: SectionData = {}

  if (include.includes("files")) {
    sections.files = buildFilesSection(config, registry, brief)
  }

  if (include.includes("lang") && config.lang) {
    sections.lang = buildLangSection(config.lang)
  }

  if (include.includes("test")) {
    sections.test = buildTestSection(config)
  }

  if (include.includes("rules")) {
    sections.rules = buildRulesSection(config)
  }

  switch (enumeration) {
    case "xml":
      return formatXml(sections)
    case "json":
      return formatJson(sections)
    case "path":
      return formatPath(sections)
    case "raw":
      return formatRaw(sections)
    default:
      return formatXml(sections)
  }
}
