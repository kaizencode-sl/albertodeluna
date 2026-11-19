import type { APIRoute } from "astro"

// The real site invites crawlers and points them at the sitemap; a preview
// build (GitHub Pages, PUBLIC_PREVIEW) asks them to stay away so it
// never competes with it
export const GET: APIRoute = ({ site }) => {
  const origin = site!.href.replace(/\/$/, "")
  const base = import.meta.env.BASE_URL.replace(/\/$/, "")
  const body = import.meta.env.PUBLIC_PREVIEW
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nAllow: /\n\nSitemap: ${origin}${base}/sitemap-index.xml\n`
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
