import { ProcessedContent } from "../plugins/vfile"
import { simplifySlug } from "./path"

export function updateDates(content: ProcessedContent[]) {
  const slugToContent = new Map<string, ProcessedContent>()
  let maxModifiedDate = new Date(0)

  for (const [tree, file] of content) {
    const slug = file.data.slug!
    const simpleSlug = simplifySlug(slug)
    slugToContent.set(simpleSlug, [tree, file])

    if (file.data.dates?.modified) {
      if (file.data.dates.modified > maxModifiedDate) {
        maxModifiedDate = file.data.dates.modified
      }
    }
  }

  for (const [_tree, file] of content) {
    const slug = file.data.slug!
    const frontmatter = file.data.frontmatter
    const type = frontmatter?.type

    if (slug === "index") {
      if (file.data.dates) {
        file.data.dates.modified = maxModifiedDate
      }
    }

    if (type === "module") {
      const links = file.data.links ?? []
      let maxTopicModifiedDate = new Date(0)
      let foundTopic = false

      for (const link of links) {
        const linkedContent = slugToContent.get(link)
        if (linkedContent) {
          const [_tree, linkedFile] = linkedContent
          if (linkedFile.data.frontmatter?.type === "topic") {
            foundTopic = true
            if (linkedFile.data.dates?.modified && linkedFile.data.dates.modified > maxTopicModifiedDate) {
              maxTopicModifiedDate = linkedFile.data.dates.modified
            }
          }
        }
      }

      if (foundTopic && file.data.dates) {
        file.data.dates.modified = maxTopicModifiedDate
      }
    }
  }
}
