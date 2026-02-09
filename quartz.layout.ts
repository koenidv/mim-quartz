import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer(),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      filterFn: (item) => !item.data?.slug.match(/^([^/]+)\/\1$/) == true,
      sortFn: (a, b) => {
        if (a.isFolder && b.isFolder) {
          return a.displayName.localeCompare(b.displayName, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        }

        if (!a.isFolder && !b.isFolder) {
          if (a.data?.date && b.data?.date) {
            return new Date(a.data.date).getTime() - new Date(b.data.date).getTime()
          } else if (a.data?.date && !b.data?.date) {
            return -1
          } else if (!a.data?.date && b.data?.date) {
            return 1
          }

          return a.displayName.localeCompare(b.displayName, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        }

        if (!a.isFolder && b.isFolder) {
          return 1
        } else {
          return -1
        }
      },
    }),
  ],
  right: [
    Component.Graph({
      localGraph: {
        removeTags: ["TUM"],
        removeFiles: [],
      },
      globalGraph: {
        removeTags: ["TUM"],
        removeFiles: [],
        scale: 1,
        linkDistance: 20,
      }
    }),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.ConditionalRender({
      component: Component.Backlinks(),
      condition: (page) => {
        const slug = page.fileData.slug
        if (slug === "index") return false
        if (slug?.endsWith("/index")) {
          const path = page.fileData.filePath
          if (!path) return false
          const parts = slug.split("/")
          const folderName = parts[parts.length - 2]
          const fileName = path.split("/").pop()?.replace(/\.md$/, "")
          return folderName.toLowerCase() === fileName?.toLowerCase()
        }
        return true
      },
    }),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
      filterFn: (item) => !item.data?.slug.match(/^([^/]+)\/\1$/) == true,
      sortFn: (a, b) => {
        if (a.isFolder && b.isFolder) {
          return a.displayName.localeCompare(b.displayName, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        }

        if (!a.isFolder && !b.isFolder) {
          if (a.data?.date && b.data?.date) {
            return new Date(a.data.date).getTime() - new Date(b.data.date).getTime()
          } else if (a.data?.date && !b.data?.date) {
            return -1
          } else if (!a.data?.date && b.data?.date) {
            return 1
          }

          return a.displayName.localeCompare(b.displayName, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        }

        if (!a.isFolder && b.isFolder) {
          return 1
        } else {
          return -1
        }
      },
    }),
  ],
  right: [
    Component.Graph({
      localGraph: {
        removeTags: ["TUM"],
        removeFiles: [],
      },
      globalGraph: {
        removeTags: ["TUM"],
        removeFiles: [],
        scale: 1,
        linkDistance: 20,
      },
    }),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.ConditionalRender({
      component: Component.Backlinks(),
      condition: (page) => {
        const slug = page.fileData.slug
        if (slug === "index") return false
        if (slug?.endsWith("/index")) {
          const path = page.fileData.filePath
          if (!path) return false
          const parts = slug.split("/")
          const folderName = parts[parts.length - 2]
          const fileName = path.split("/").pop()?.replace(/\.md$/, "")
          return folderName.toLowerCase() === fileName?.toLowerCase()
        }
        return true
      },
    }),
  ],
}
