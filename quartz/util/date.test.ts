import { test } from "node:test"
import assert from "node:assert"
import { updateDates } from "./date"
import { ProcessedContent } from "../plugins/vfile"
import { FullSlug } from "./path"
import { VFile } from "vfile"

function mockContent(slug: string, modified: Date, type?: string, links: string[] = []): ProcessedContent {
  const vfile = new VFile()
  vfile.data = {
    slug: slug as FullSlug,
    frontmatter: { title: slug, type },
    dates: {
      created: new Date(),
      modified: modified,
      published: new Date()
    },
    links: links as any
  }
  return [{} as any, vfile]
}

test("updateDates - index file uses max modified date", () => {
  const date1 = new Date("2023-01-01")
  const date2 = new Date("2023-02-01")
  const content: ProcessedContent[] = [
    mockContent("index", date1),
    mockContent("page1", date2),
  ]

  updateDates(content)

  assert.strictEqual(content[0][1].data.dates?.modified.getTime(), date2.getTime())
})

test("updateDates - module file uses max topic modified date", () => {
  const topicDate1 = new Date("2023-01-01")
  const topicDate2 = new Date("2023-03-01")
  const otherDate = new Date("2023-05-01")
  
  const content: ProcessedContent[] = [
    mockContent("module1", new Date("2023-02-01"), "module", ["topic1", "topic2", "other"]),
    mockContent("topic1", topicDate1, "topic"),
    mockContent("topic2", topicDate2, "topic"),
    mockContent("other", otherDate, "some-other-type"),
  ]

  updateDates(content)

  // Should be topicDate2 because it's the latest among linked topics
  assert.strictEqual(content[0][1].data.dates?.modified.getTime(), topicDate2.getTime())
})

test("updateDates - module file remains unchanged if no topics linked", () => {
  const moduleDate = new Date("2023-02-01")
  const otherDate = new Date("2023-05-01")
  
  const content: ProcessedContent[] = [
    mockContent("module1", moduleDate, "module", ["other"]),
    mockContent("other", otherDate, "some-other-type"),
  ]

  updateDates(content)

  assert.strictEqual(content[0][1].data.dates?.modified.getTime(), moduleDate.getTime())
})
