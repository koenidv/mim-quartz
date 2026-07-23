import { QuartzTransformerPlugin } from "../types"
import { Root, Element } from "hast"
import { visit } from "unist-util-visit"
import { toHtml } from "hast-util-to-html"
import crypto from "crypto"

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

export type SecureCalloutEntry = {
  id: string
  emails: string[]
  html: string
}

export const SecureCallouts: QuartzTransformerPlugin = () => {
  return {
    name: "SecureCallouts",
    htmlPlugins() {
      return [
        () => {
          return (tree: Root, file) => {
            visit(tree, "element", (node: Element) => {
              if (node.tagName !== "blockquote" || !node.properties) {
                return
              }

              let metadataStr = ""
              const rawMetadata =
                node.properties.dataCalloutMetadata ??
                node.properties["data-callout-metadata"]

              if (typeof rawMetadata === "string" || typeof rawMetadata === "number") {
                metadataStr = String(rawMetadata)
              } else {
                // Fallback: check if raw blockquote HTML contains [!type|email...] header
                const rawHtml = toHtml(node)
                const headerMatch = rawHtml.match(/\[![\w-]+\|([^\]]+)\]/)
                if (headerMatch && headerMatch[1]) {
                  metadataStr = headerMatch[1]
                }
              }

              const emailMatches = metadataStr.match(EMAIL_REGEX)
              if (!emailMatches || emailMatches.length === 0) {
                return
              }

              const emails = Array.from(new Set(emailMatches.map((e) => e.toLowerCase())))
              const htmlContent = toHtml(node)
              const id = crypto
                .createHash("sha256")
                .update(htmlContent + emails.join(","))
                .digest("hex")
                .substring(0, 16)

              if (!file.data.secureCallouts) {
                file.data.secureCallouts = []
              }

              file.data.secureCallouts.push({
                id,
                emails,
                html: htmlContent,
              })

              // Replace the blockquote node with dynamic island placeholder
              node.tagName = "div"
              node.properties = {
                className: ["secure-callout-island"],
                "data-callout-id": id,
                style: "display:none;",
              }
              node.children = []
              if (node.data) {
                delete node.data
              }
            })
          }
        },
      ]
    },
  }
}
