import { XML } from "#types"
import { entries } from "./general"

// -- Helpers --

function getNounVariants(noun: string): {
    singular: string
    plural: string
} {
    if (!noun.endsWith("s")) return { singular: noun, plural: `${noun}s` }
    return {
        singular: noun.substring(0, noun.lastIndexOf("s")),
        plural: noun,
    }
}

function isAttributeString(s: unknown): s is XML.AttributeString {
    if (!(typeof s === "string")) return false
    const parts = s.split("=")
    return (
        parts.length === 2 &&
        parts.every(Boolean) &&
        parts[1].indexOf('"') !== parts[1].lastIndexOf('"')
    )
}
function isArray<T = any>(x: unknown, tc?: (x: unknown) => x is T): x is T[] {
    return Array.isArray(x) && (!tc || x.every(tc))
}

// -- Methods --

const attributes = (attrs?: AttributesArgument): XML.AttributeString[] =>
    !attrs || typeof attrs !== "object"
        ? isAttributeString(attrs)
            ? [attrs]
            : []
        : entries(attrs)
              .map(a => a.map(s => s.trim()))
              .filter(a => a.length === 2 && a.every(Boolean))
              .map(([k, v]): XML.AttributeString => `${k}="${v}"`)

const open = (tag: string, attrs?: AttributesArgument): XML.OpenTag =>
    !attrs ? `<${tag}>` : `<${tag} ${attributes(attrs).join(" ").trim()}>`

const close = (tag: string): XML.CloseTag => `</${tag}>`

const inline = (tag: string, attrs?: AttributesArgument): XML.InlineTag => {
    const chars = open(tag, attrs).split("")
    return chars.with(chars.indexOf(">"), "/>").join("") as XML.InlineTag
}

const wrap = <T extends WrapXMLOptions>(
    tag: string,
    { attrs, inner = [], index }: T = {} as T,
): XML.Element => {
    const collection = index || (typeof inner === "object" && "items" in inner)
    if (!inner) return collection ? "" : inline(tag, attrs)

    const { plural, singular } = getNounVariants(tag)
    const parts: string[] = []

    if (isArray(inner)) inner.forEach(s => parts.push(s.trim()))
    else if (!collection) parts.push(inner)
    else
        switch (typeof inner) {
            case "string":
                parts.push(inner.trim())
                break
            case "object":
                if (isArray<string>(inner))
                    inner.forEach((s, i) =>
                        parts.push(
                            wrap(singular, {
                                attrs: index && { index: `${i + 1}` },
                                inner: s,
                            }),
                        ),
                    )
                else {
                    const noun = getNounVariants(inner.tag)
                    parts.push(open(noun.plural, inner.attrs))
                    const callback: (s: any, i: number) => XML.Element =
                        isArray(inner.items, x => typeof x === "string")
                            ? (s: string, i: number) =>
                                  wrap(noun.singular, {
                                      attrs: index && { index: `${i + 1}` },
                                      inner: s,
                                  })
                            : (a: Record<string, string>, i: number) =>
                                  inline(
                                      noun.singular,
                                      index ? { ...a, index: `${i + 1}` } : a,
                                  )
                    inner.items.map(callback)
                    parts.push(close(noun.plural))
                }
                break
        }

    const outer = collection ? plural : tag
    return `${open(outer, attrs)}${parts.join("")}${close(outer)}`
}

const xml = { wrap, inline, open, close, attributes }

// -- Types --

type AttributesArgument = Record<string, string> | string
type WrapXMLOptions = {
    attrs?: AttributesArgument
} & (
    | { inner: string; index?: never }
    | {
          inner: {
              tag: string
              attrs?: AttributesArgument
              items: string[] | Record<string, string>[]
          }
          index?: true
      }
    | { inner: string[]; index?: true }
)

export { xml }
export type { XML, WrapXMLOptions }
export default xml
