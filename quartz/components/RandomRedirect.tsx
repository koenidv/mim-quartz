// @ts-ignore
import randomRedirectScript from "./scripts/randomRedirect.inline"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

const RandomRedirect: QuartzComponent = () => {
  return null
}

RandomRedirect.beforeDOMLoaded = randomRedirectScript

export default (() => RandomRedirect) satisfies QuartzComponentConstructor
