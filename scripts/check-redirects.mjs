// Fails if any old-site redirect (src/data/redirects.json) points at a page
// the build no longer has, e.g. after a review is renamed or removed.
// Run after `pnpm build`: pnpm check:redirects
import { existsSync, readFileSync } from "node:fs"

const redirects = JSON.parse(readFileSync("src/data/redirects.json", "utf8"))
const broken = Object.entries(redirects).filter(([, to]) => {
  if (!to.startsWith("/")) return false
  const path = to.split(/[?#]/)[0].replace(/\/?$/, "/")
  return !existsSync(`dist${path}index.html`)
})

for (const [from, to] of broken) console.error(`${from} -> ${to} (no such page)`)
if (broken.length) process.exit(1)
console.log(`${Object.keys(redirects).length} redirects OK`)
