import { QuartzEmitterPlugin } from "../types"
import { FilePath, joinSegments } from "../../util/path"
import fs from "fs/promises"

export const SecureCalloutsEmitter: QuartzEmitterPlugin = () => {
  return {
    name: "SecureCalloutsEmitter",
    async emit(ctx, content, _resources) {
      const manifest: Record<string, { emails: string[]; html: string }> = {}

      for (const [_, file] of content) {
        const secureCallouts = file.data.secureCallouts
        if (secureCallouts) {
          for (const item of secureCallouts) {
            manifest[item.id] = {
              emails: item.emails,
              html: item.html,
            }
          }
        }
      }

      const outputDir = ctx.argv.output ?? ctx.cfg.configuration.outputDir ?? "public"
      await fs.mkdir(outputDir, { recursive: true })
      const manifestPath = joinSegments(outputDir, ".secure-callouts.json") as FilePath
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

      return [manifestPath]
    },
  }
}
