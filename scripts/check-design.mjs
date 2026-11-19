// Keeps the code in line with DESIGN.md, so the rules can't drift apart.
// Run by CI and by a Claude Code hook after every edit: pnpm check:design
// 1. Every colour token in src/styles/global.css has the same value in the
//    DESIGN.md frontmatter, and .impeccable/design.json agrees with both.
// 2. No colour literal outside global.css that DESIGN.md doesn't name
//    (The Token-Only Rule). Images that can't read CSS (seal, share cards,
//    favicon, map) use the mark-* and map-* colours declared there.
// 3. No old brand ("Dime un restaurante") in the site.
// 4. Anything animated with GSAP goes through gsap.matchMedia().
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const read = (p) => readFileSync(p, "utf8")
const errors = []
const fail = (msg) => errors.push(msg)

const files = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
const source = files("src").filter(
  (f) => /\.(astro|ts|css|mjs|js)$/.test(f) && !f.startsWith("src/content/")
)

// --- 1. tokens -----------------------------------------------------------
const front = read("DESIGN.md").split("---")[1]
const colorBlock = front.split(/^colors:$/m)[1]?.split(/^\S/m)[0] ?? ""
const design = Object.fromEntries(
  [...colorBlock.matchAll(/^ {2}([\w-]+): "(#[0-9a-f]{6})"$/gm)].map((m) => [m[1], m[2]])
)
const root = read("src/styles/global.css").match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? ""
const css = Object.fromEntries(
  [...root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2].toLowerCase()])
)
for (const [name, value] of Object.entries(css)) {
  if (!design[name]) fail(`DESIGN.md: token --${name} (${value}) from global.css is missing`)
  else if (design[name] !== value)
    fail(`DESIGN.md: --${name} is ${design[name]}, global.css says ${value}`)
}
for (const name of Object.keys(design))
  if (!css[name] && !/^(mark|map)-/.test(name))
    fail(`DESIGN.md: colour "${name}" isn't in global.css (off-screen colours must be mark-* or map-*)`)

const meta = JSON.parse(read(".impeccable/design.json")).extensions.colorMeta
for (const [name, value] of Object.entries(design))
  if (meta[name]?.canonical?.toLowerCase() !== value)
    fail(`.impeccable/design.json: colorMeta.${name} should be ${value} (regenerate it from DESIGN.md)`)
for (const name of Object.keys(meta))
  if (!design[name]) fail(`.impeccable/design.json: colorMeta.${name} isn't in DESIGN.md`)

// --- 2. colour literals ----------------------------------------------------
const allowed = new Set([...Object.values(design), "#fff", "#ffffff", "#000", "#000000"])
for (const f of [...source, "public/favicon.svg"]) {
  if (f === "src/styles/global.css") continue
  read(f)
    .split("\n")
    .forEach((line, i) => {
      for (const [hex] of line.matchAll(/(?<![\w&])#[0-9a-fA-F]{6}\b|(?<![\w&])#[0-9a-fA-F]{3}\b(?![\w-])/g))
        if (!allowed.has(hex.toLowerCase()))
          fail(`${f}:${i + 1}: colour ${hex} isn't a DESIGN.md token`)
    })
}

// --- 3. brand ----------------------------------------------------------------
// seo.ts keeps the old name as alternateName; url.ts and brand.ts mention the
// old site in comments (the GitHub Pages path, the origin of the logo)
const BRAND_OK = new Set(["src/lib/seo.ts", "src/lib/url.ts", "src/lib/brand.ts"])
for (const f of source) {
  if (BRAND_OK.has(f)) continue
  read(f)
    .split("\n")
    .forEach((line, i) => {
      if (/dime un restaurante|\bdime\b|dimeunrestaurante/i.test(line))
        fail(`${f}:${i + 1}: old brand; the site is "Alberto de Luna"`)
    })
}

// --- 4. reduced motion ---------------------------------------------------------
for (const f of source) {
  const text = read(f)
  if (/from "gsap(\/[^"]*)?"/.test(text) && !text.includes("gsap.matchMedia("))
    fail(`${f}: imports GSAP without gsap.matchMedia() (DESIGN.md: reduced motion)`)
}

if (errors.length) {
  console.error(`Design check failed (see DESIGN.md):\n- ${errors.join("\n- ")}`)
  process.exit(2)
}
console.log("Design check OK")
