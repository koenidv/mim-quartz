import { QuartzTransformerPlugin } from "../types"
import { FilePath, slugifyFilePath, simplifySlug } from "../../util/path"
import { wikilinkRegex } from "./ofm"
import fs from "fs"
import path from "path"

export const HomeNoteLinks: QuartzTransformerPlugin = () => {
  const homeNoteName = "M.Sc. Management at TUM"
  const homeNoteFp = `${homeNoteName}.md`
  const homeNoteSlug = slugifyFilePath(homeNoteFp as FilePath)

  return {
    name: "HomeNoteLinks",
    textTransform(_ctx, src) {
      // Rewrite links like [[M.Sc. Management at TUM]] to [[index|M.Sc. Management at TUM]]
      // so they correctly point to the index page and generate backlinks.
      const regex = new RegExp(wikilinkRegex.source, wikilinkRegex.flags)
      return src.replace(regex, (value, ...capture) => {
        const [rawFp, rawHeader, rawAlias] = capture
        const fp = rawFp?.trim() ?? ""
        if (fp === homeNoteName || slugifyFilePath(fp as FilePath) === homeNoteSlug) {
          const anchor = rawHeader ?? ""
          const alias = rawAlias ?? `|${fp}`
          return `[[index${anchor}${alias}]]`
        }
        return value
      })
    },
    markdownPlugins(ctx) {
      return [
        () => (tree, file) => {
          if (file.data.slug === "index") {
            // 1. Add alias so incoming links (if any missed) point here
            if (file.data.frontmatter) {
              const aliases = file.data.frontmatter.aliases ?? []
              if (!aliases.includes(homeNoteName)) {
                aliases.push(homeNoteName)
                file.data.frontmatter.aliases = aliases
                
                const slug = slugifyFilePath(homeNoteFp as FilePath)
                file.data.aliases = [...(file.data.aliases ?? []), slug]
                
                if (!ctx.allSlugs.includes(slug)) {
                  ctx.allSlugs.push(slug)
                }
              }
            }
          }
        }
      ]
    },
    htmlPlugins(ctx) {
      return [
        () => (tree, file) => {
          if (file.data.slug === "index") {
            const homeNotePath = path.join(ctx.argv.directory, homeNoteFp)
            if (fs.existsSync(homeNotePath)) {
              const content = fs.readFileSync(homeNotePath, "utf-8")
              const links = new Set<string>()
              
              const regex = new RegExp(wikilinkRegex.source, wikilinkRegex.flags)
              let match
              while ((match = regex.exec(content)) !== null) {
                const link = match[1]
                if (link) {
                  links.add(simplifySlug(slugifyFilePath(link.trim() as FilePath)))
                }
              }
              
              file.data.links = Array.from(links)
            }
          }
        }
      ]
    }
  }
}
