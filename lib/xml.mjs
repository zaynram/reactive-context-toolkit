const { entries } = Object

/**
 * @param {Record<string, string> | string} [attrs]
 */
const attributes = attrs =>
    !attrs
        ? ""
        : typeof attrs === "string"
          ? attrs
          : entries(attrs)
                .map(([name, value]) => `${name}="${value}"`)
                .join(" ")
                .trim()

/**
 * @param {string} tag
 * @param {Record<string, string> | string} [attrs]
 */
const inline = (tag, attrs) =>
    !attrs ? `<${tag}/>` : `<${tag} ${attributes(attrs)}/>`

/**
 * @param {string} tag
 * @param {object} [options]
 * @param {Record<string, string> | string
 * } [options.attrs]
 * @param {string |
 * string[] |
 * Record<string, string>[] |
 * [string, Record<string, string>[]]
 * } [options.inner] If the value is undefined and the behavior option is  If the value is a string, it will be formatted as-is and trimmed. If the value is an string[], each element will be wrapped in tags made from the singular noun for the given tag. If the value is a Record<string, string>[], each element will be used as the attributes for inline formatted elements. Automatic indexing can be enabled with the options.index flag. If the value is a [string, Record<string, string>[]], then the first element will be used as the singular noun, and the second element will be used as attributes for elements.
 * @param {true
 * } [options.collection] Whether to treat the inner value as collection items. If set to true and inner evaluates to a falsy value, an empty string will be returned. Otherwise, an inline tag will be returned.
 * @param {true
 * } [options.index] Whether to add index attributes to items. Setting this to true is equivalent to setting this and collection to true. This does nothing if collection elements are already in XML format or the inner value is not an array.
 */
const wrap = (tag, { attrs, inner, collection, index } = {}) => {
    if (!inner) return (collection ?? index) ? "" : inline(tag, attrs)
    /** @type {string[]} */
    let parts = []
    let outer = tag
    if (collection ?? index) {
        let singular = tag
        if (tag.endsWith("s")) singular = tag.substring(0, tag.lastIndexOf("s"))
        else outer = `${tag}s`
        switch (typeof inner) {
            case "string":
                parts.push(inner.trim())
                break
            case "object":
                /** @type {[string, (string | Record<string, string>)[]]} */
                let [noun, items] =
                    inner.length === 2 && typeof inner[0] !== typeof inner[1]
                        ? inner
                        : [singular, inner]
                if (noun.endsWith("s"))
                    singular = noun.substring(0, noun.lastIndexOf("s"))
                else {
                    singular = noun
                    noun = `${singular}s`
                }
                if (noun !== outer) parts.push(`<${noun}>`)
                items.forEach(
                    (x, i) =>
                        void parts.push(
                            typeof x === "object"
                                ? inline(
                                      singular,
                                      index
                                          ? {
                                                ...x,
                                                index: `${i + 1}`,
                                            }
                                          : x,
                                  )
                                : x.startsWith(`<${singular}`)
                                  ? x
                                  : wrap(singular, {
                                        attrs: index && { index: `${i + 1}` },
                                        inner: x,
                                    }),
                        ),
                )
                if (noun !== outer) parts.push(`</${noun}>`)
                break
        }
    } else {
        if (Array.isArray(inner))
            inner.forEach(s => {
                if (typeof s === "string") return void parts.push(s.trim())
                const msg = `inner items must be strings if collection != true`
                throw TypeError(msg)
            })
        else parts.push(inner)
    }
    return [
        `<${[
            outer,
            attrs
                ? typeof attrs === "string"
                    ? attrs
                    : attributes(attrs)
                : null,
        ]
            .filter(x => typeof x === "string")
            .map(s => s.trim())
            .join(" ")
            .trim()}>`,
        ...parts,
        `</${outer}>`,
    ].join(" ")
}

export default { wrap, inline, attributes }
