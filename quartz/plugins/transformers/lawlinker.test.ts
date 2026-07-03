import test, { describe } from "node:test"
import assert from "node:assert"
import { LAW_REGEX, getUrl } from "./lawlinker"

describe("LawLinker Regex", () => {
  const testCases = [
    {
      input: "§ 446 (1) BGB",
      expected: { full: "§ 446 (1) BGB", bunch: "446 (1)", law: "BGB" }
    },
    {
      input: "§ 446 1st BGB",
      expected: { full: "§ 446 1st BGB", bunch: "446 1st", law: "BGB" }
    },
    {
      input: "§§ 488–606 BGB",
      expected: { full: "§§ 488–606 BGB", bunch: "488–606", law: "BGB" }
    },
    {
      input: "§ 453 I BGB",
      expected: { full: "§ 453 I BGB", bunch: "453 I", law: "BGB" }
    },
    {
      input: "§ 453 I (1) BGB",
      expected: { full: "§ 453 I (1) BGB", bunch: "453 I (1)", law: "BGB" }
    },
    {
      input: "§ 453 I 1st BGB",
      expected: { full: "§ 453 I 1st BGB", bunch: "453 I 1st", law: "BGB" }
    }
  ]

  testCases.forEach(({ input, expected }) => {
    test(`matches "${input}"`, () => {
      const matches = Array.from(input.matchAll(LAW_REGEX))
      assert.strictEqual(matches.length, 1, `Should find exactly 1 match for "${input}"`)
      const match = matches[0]
      assert.strictEqual(match[0], expected.full, `Full match should be "${expected.full}"`)
      assert.strictEqual(match[2], expected.bunch, `Bunch should be "${expected.bunch}"`)
      assert.strictEqual(match[3] || match[1], expected.law, `Law should be "${expected.law}"`)
    })
  })
})

describe("LawLinker getUrl", () => {
  test("generates correct URL for BGB", () => {
    assert.strictEqual(getUrl("BGB", "446"), "https://www.gesetze-im-internet.de/bgb/__446.html")
  })

  test("generates correct URL for GG", () => {
    assert.strictEqual(getUrl("GG", "1"), "https://www.gesetze-im-internet.de/gg/__1.html")
  })

  test("handles SGB I", () => {
    assert.strictEqual(getUrl("SGB I", "1"), "https://www.gesetze-im-internet.de/sgb_1/__1.html")
  })

  test("handles unknown law with slugification", () => {
    assert.strictEqual(getUrl("Some Law", "123"), "https://www.gesetze-im-internet.de/some_law/__123.html")
  })
})
