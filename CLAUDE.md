# Project guide

Alberto de Luna's restaurant review site (albertodeluna.com). Astro site with Tailwind and GSAP. Package manager: **pnpm**.

## Product and design rules (always apply)

Every change to the site follows these two documents. They are imported here so they are always in context:

- Product: who it's for, the voice, the brand and its commitments. @PRODUCT.md
- Design system: colours, type, layout, components, motion and the named rules. @DESIGN.md

When they conflict with a request, say so before building. When the work changes what they describe, update them in the same change:

- **A colour**: add or change it in `src/styles/global.css` (`:root`) and in the `DESIGN.md` frontmatter and Colors section together; colours drawn where CSS can't reach (seal, share cards, favicon, map) are `mark-*` / `map-*` tokens in `DESIGN.md`. Then refresh `.impeccable/design.json` (`$impeccable document`, or update its `colorMeta`).
- **A component, layout pattern or motion rule**: update the matching `DESIGN.md` section.
- **The product, audience, brand, domain or pages**: update `PRODUCT.md`.
- The brand is "Alberto de Luna"; never reintroduce "Dime un restaurante" in the site (it only survives as the SEO `alternateName`).

`pnpm check:design` enforces the mechanical part (tokens in sync across `global.css`, `DESIGN.md` and `design.json`, no colour outside the tokens, no old brand, GSAP only through `gsap.matchMedia()`). A Claude Code hook runs it after every edit to `src/`, `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json` or `public/favicon.svg`, and CI runs it on every push. If it fails, fix the cause; don't loosen the check.

## Stack

- **Astro**: static-first, plain `.astro` components and inline `<script>`s. There is no UI framework; add one (e.g. React islands) only when a component truly needs it.
- **Tailwind**: style with utilities and the theme's CSS variables. No hardcoded colors.
- **GSAP**: all animation. Respect `prefers-reduced-motion` with `gsap.matchMedia()`; hidden start states go behind the `.motion` class.
- **Content**: one JSON file per review in `src/content/reviews/<id>.json`; old WordPress URLs map to new pages in `src/data/redirects.json`.

## MCP servers (`.mcp.json`)

- `astro-docs`: check it before guessing Astro APIs.

## Skills: when to use which

- `impeccable`: design, critique, polish or audit any UI, and keep `DESIGN.md` / `.impeccable/design.json` current. Default choice for design work.
- `design-taste-frontend`: new landing pages or redesigns that must not look templated.
- `web-design-guidelines`: review UI code for accessibility and best practices before shipping.
- `modern-web-guidance`: check current web platform practice before writing HTML/CSS/client JS.
- `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-utils`, `gsap-plugins`, `gsap-performance`: animation work.

## Conventions

- Technical docs (README, `docs/`, `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`) and code comments are written in English. The site's copy stays in Spanish.
- Keep it simple: no abstractions, dependencies or config without a current need.
- Accessible by default: semantic HTML, visible focus, alt text, sufficient contrast (the ratios in `DESIGN.md` are measured; keep new pairs at 4.5:1 for text).
- Verify UI changes in the browser before calling them done: `pnpm dev`, or the production build with `pnpm build` and the `preview` launch config.
- Before pushing: `pnpm lint`, `pnpm typecheck`, `pnpm check:design`, `pnpm build` and `pnpm check:redirects` (CI runs the same).
