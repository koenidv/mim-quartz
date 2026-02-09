import { QuartzEmitterPlugin } from "../types"
import { QuartzComponent, QuartzComponentProps } from "../../components/types"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { QuartzPluginData, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import { FullSlug, pathToRoot, simplifySlug, SimpleSlug, joinSegments, stripSlashes, slugifyFilePath } from "../../util/path"
import { defaultListPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { PageList } from "../../components"
import { write } from "./helpers"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { i18n } from "../../i18n"

import { glob } from "../../util/glob"

interface GhostPageOptions extends FullPageLayout {}

const GhostContent: QuartzComponent = (props: QuartzComponentProps) => {
  const { allFiles, fileData } = props
  return (
    <div class="popover-hint">
      <div class="page-listing">
        <p>
          Notes linking to <b>{fileData.frontmatter?.title}</b>:
        </p>
        <div>
          <PageList {...props} />
        </div>
      </div>
    </div>
  )
}

export const GhostPage: QuartzEmitterPlugin<Partial<GhostPageOptions>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultListPageLayout,
    pageBody: GhostContent,
    ...userOpts,
  }

  const { head: Head, header, beforeBody, pageBody, afterBody, left, right, footer: Footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  return {
    name: "GhostPage",
    getQuartzComponents() {
      return [
        Head,
        Header,
        Body,
        ...header,
        ...beforeBody,
        pageBody,
        ...afterBody,
        ...left,
        ...right,
        Footer,
      ]
    },
    async *emit(ctx, content, resources) {
      const allFiles = content.map((c) => c[1].data)
      const cfg = ctx.cfg.configuration

      const simplifiedSlugs = allFiles.map((f) => simplifySlug(f.slug!))
      const existingSlugs = new Set(simplifiedSlugs)
      const existingSlugsNormalized = new Set(simplifiedSlugs.map((s) => stripSlashes(s)))
      const fullSlugs = new Set(allFiles.map((f) => f.slug!))

      // Identify ALL files on disk to find which ones were ignored
      const allFilesOnDisk = await glob("**/*.md", ctx.argv.directory, [])
      const allSlugsOnDisk = new Set(
        allFilesOnDisk.map((fp) => stripSlashes(simplifySlug(slugifyFilePath(fp as FilePath)))),
      )

      const ghostLinks = new Map<SimpleSlug, Set<QuartzPluginData>>()

      for (const file of allFiles) {
        if (file.slug === "index") continue

        for (const link of file.links ?? []) {
          const normalizedLink = stripSlashes(link)
          if (!existingSlugsNormalized.has(normalizedLink) && !link.startsWith("tags/")) {
            // Check if it matches any file on disk (including ignored ones)
            // We check both exact match and tail match (for files in subfolders)
            const isIgnored = Array.from(allSlugsOnDisk).some(
              (s) => s === normalizedLink || s.endsWith("/" + normalizedLink),
            )
            if (isIgnored) {
              continue
            }

            const isAsset =
              link.endsWith(".png") ||
              link.endsWith(".jpg") ||
              link.endsWith(".jpeg") ||
              link.endsWith(".gif") ||
              link.endsWith(".svg") ||
              link.endsWith(".pdf") ||
              link.endsWith(".mp4") ||
              link.endsWith(".mp3")
            if (!isAsset) {
              if (!ghostLinks.has(link)) {
                ghostLinks.set(link, new Set())
              }
              ghostLinks.get(link)!.add(file)
            }
          }
        }
      }

      for (const [slug, backlinks] of ghostLinks) {
        const isDir = simplifiedSlugs.some((s) => s.startsWith(slug + "/"))
        const emitSlug = (isDir ? (joinSegments(slug, "index") as FullSlug) : slug) as FullSlug

        // Final safety check: never overwrite an existing page
        if (fullSlugs.has(emitSlug) || existingSlugs.has(emitSlug as unknown as SimpleSlug)) {
          continue
        }

        const title = slug.split("/").pop()?.replace(/-/g, " ") || slug

        const [_tree, file] = defaultProcessedContent({
          slug: emitSlug,
          frontmatter: {
            title: title,
            tags: [],
          },
        })

        const externalResources = pageResources(pathToRoot(emitSlug), resources)
        const componentData: QuartzComponentProps = {
          ctx,
          fileData: file.data,
          externalResources,
          cfg,
          children: [],
          tree: { type: "root", children: [] },
          allFiles: Array.from(backlinks),
        }

        const renderedContent = renderPage(cfg, emitSlug, componentData, opts, externalResources)
        yield write({
          ctx,
          content: renderedContent,
          slug: emitSlug,
          ext: ".html",
        })
      }
    },
    async *partialEmit(ctx, content, resources, changeEvents) {
      // Re-run the same logic for simplicity, or we could optimize by only
      // checking affected ghost pages. Given ghost pages are lightweight,
      // re-emitting all of them during a change is usually safe and robust.
      yield* this.emit!(ctx, content, resources)
    },
  }
}
