function toggleCallout(this: HTMLElement) {
  const outerBlock = this.parentElement!
  outerBlock.classList.toggle("is-collapsed")
}

function setupCallout() {
  const collapsible = document.getElementsByClassName(
    `callout is-collapsible`,
  ) as HTMLCollectionOf<HTMLElement>
  for (const div of collapsible) {
    const title = div.getElementsByClassName("callout-title")[0] as HTMLElement
    const content = div.getElementsByClassName("callout-content")[0] as HTMLElement
    if (!title || !content) continue

    title.addEventListener("click", toggleCallout)
    window.addCleanup(() => title.removeEventListener("click", toggleCallout))
  }
}

async function setupSecureCallouts() {
  const islands = document.querySelectorAll<HTMLElement>(".secure-callout-island")
  for (const island of islands) {
    const id = island.getAttribute("data-callout-id")
    if (!id) continue

    try {
      const res = await fetch(`/api/secure-callouts/${id}`)
      if (res.ok) {
        const html = await res.text()
        island.outerHTML = html
        setupCallout()
      }
    } catch {
      // Remain hidden on error or unauthorized response
    }
  }
}

document.addEventListener("nav", () => {
  setupCallout()
  setupSecureCallouts()
})

