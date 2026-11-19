import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "Flo's Notes",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "posthog",
      apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
      host: "https://igel.koeni.dev",
      uiHost: "https://eu.posthog.com",
      defaults: "2026-05-30",
      personProfiles: "identified_only",
    },
    outputDir: "public/out",
    locale: "en-US",
    baseUrl: "management.koeni.dev",
    ignorePatterns: ["**/private", "**/private/**", "eep", "_templates", ".obsidian", ".*", "M.Sc. Management at TUM.md", "Module Considerations.md", "agents.md", "Session Note *"],
    defaultDateType: "modified",
    accessControl: {
      protectedRoutes: ["**/Slides/**", "**/Resources/**", "**/videos/**", "Case*Study*Seminar/**", "Smart*Start*Seminar/**"],
    },
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: {
          name: "Poppins",
          weights: [500, 600, 700, 800],
        },
        body: {
          name: "Roboto",
          weights: [400, 500, 700],
          includeItalic: true,
        },
        code: "JetBrains Mono",
      },
      // Warm paper, black ink and a lime highlighter (mirrors koeni.dev and SimPrep).
      // The full token set lives in quartz/styles/base.scss.
      colors: {
        lightMode: {
          light: "#f5f0e5",
          lightgray: "#e3d8bf",
          gray: "#6f6a5c",
          darkgray: "#2b2a31",
          dark: "#131218",
          secondary: "#131218",
          tertiary: "#3f7d1c",
          highlight: "rgba(19, 18, 24, 0.05)",
          textHighlight: "#c5fc6f",
        },
        darkMode: {
          light: "#141318",
          lightgray: "#2d2b34",
          gray: "#9a95a3",
          darkgray: "#dcd6c8",
          dark: "#f5f0e5",
          secondary: "#c5fc6f",
          tertiary: "#8fc93a",
          highlight: "rgba(245, 240, 229, 0.06)",
          textHighlight: "#c5fc6f",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "filesystem"],
      }),
      Plugin.HardLineBreaks(),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false,  }),
      Plugin.SecureCallouts(),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.LawLinker(),
      Plugin.AI(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
      Plugin.HomeNoteLinks(),
      Plugin.ClickableImages(),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.GhostPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // Comment out CustomOgImages to speed up build time
      Plugin.CustomOgImages(),
      Plugin.SecureCalloutsEmitter(),
    ],
  },
}

export default config