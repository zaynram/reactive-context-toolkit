import { fs } from "#util"

export default {
    getSchemaPath: (name: string) => fs.source(["public", "schema", name]),
    createFromTemplate: async (
        templateName: string,
        destination: string | string[],
    ) => {
        const src = fs.source(["public", "templates", templateName])
        const dst = fs.resolve(destination)
        await Bun.write(dst, Bun.file(src))
    },
}
