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
        // Sort order: folders first, then files. Sort folders and files alphabeticall
        if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
          // numeric: true: Whether numeric collation should be used, such that "1" < "2" < "10"
          // sensitivity: "base": Only strings that differ in base letters compare as unequal. Examples: a ≠ b, a = á, a = A
          console.log(a, b.data?.date)
          return a.data?.date?.toString().localeCompare(b.data?.date?.toString() ?? "", undefined, {
            numeric: true,
            sensitivity: "base",
          }) ?? 0
          
        }

        if (!a.isFolder && b.isFolder) {
          return 1
        } else {
          return -1
        }
      }
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
    Component.Backlinks(),
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
    Component.Explorer(),
  ],
  right: [],
}
