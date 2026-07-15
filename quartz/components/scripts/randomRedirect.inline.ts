function checkRedirect() {
  const path = decodeURIComponent(window.location.pathname).toLowerCase()
  if (path.includes("random-case") || path.includes("random case")) {
    const cases = [
      "Case---Animal-Injury",
      "Case---Cash-Payment",
      "Case---Letter-of-Intent-and-cic",
      "Case---Revocation-of-Offer",
      "Case---Silence-as-Acceptance",
      "Case---Newspaper-Ad",
      "Case---Minor-Capacity",
      "Case---Impossibility",
      "Case---Mental-Capacity",
      "Case---Good-Faith-and-Stolen-Boat",
      "Case---Good-Faith-and-Skateboard",
      "Case---Lease-and-Right-of-Possession",
    ]
    const randomCase = cases[Math.floor(Math.random() * cases.length)]
    const parts = window.location.pathname.split("/")
    if (parts[parts.length - 1] === "") {
      parts.pop()
    }
    parts.pop()
    const base = parts.join("/")
    const hasHtml = window.location.pathname.toLowerCase().includes(".html")
    window.location.replace(base + "/" + randomCase + (hasHtml ? ".html" : ""))
  }
}
document.addEventListener("nav", checkRedirect)
checkRedirect()
