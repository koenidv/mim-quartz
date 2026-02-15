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

document.addEventListener("nav", setupCallout)
