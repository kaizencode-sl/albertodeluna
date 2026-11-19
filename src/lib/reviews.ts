import { getCollection, type CollectionEntry } from "astro:content"
import { url } from "@/lib/url"

export type Review = CollectionEntry<"reviews">

export const reviewUrl = (id: string) => url(`/restaurantes/${id}`)

/** "9.5" → "9,5" */
export const formatScore = (score: number | null) =>
  score === null ? "–" : String(score).replace(".", ",")

const visited = (r: Review) => (r.data.year ?? 0) * 100 + (r.data.month ?? 0)

/** Reviews newest visit first (undated last), then by address */
export async function getReviews() {
  const reviews = await getCollection("reviews")
  reviews.sort((a, b) => visited(b) - visited(a) || a.id.localeCompare(b.id))
  // Local photos live under the site's base
  return reviews.map((r) => ({
    ...r,
    data: { ...r.data, images: r.data.images.map(url) },
  }))
}

/**
 * An Instagram photo's 800px copy (scripts/photos.mjs) for phones and
 * thumbnails; other photos have a single size
 */
export const srcset = (src: string) =>
  IG.test(src) ? `${smallPhoto(src)} 800w, ${src} 1600w` : undefined

const IG = /\/img\/ig\/[^/]+\.webp$/
/** The 800px copy where there is one, else the photo itself */
export const smallPhoto = (src: string) =>
  IG.test(src) ? src.replace(/\.webp$/, "-800.webp") : src

/** Count of values across reviews, most frequent first */
export function tally(
  reviews: Review[],
  pick: (r: Review) => string | string[] | null
) {
  const counts = new Map<string, number>()
  for (const r of reviews) {
    for (const v of [pick(r)].flat())
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])
}

/** "Para primera cita" → "Primera cita" */
export const shortPlan = (plan: string) =>
  plan.replace(/^Para (ir )?/, "").replace(/^./, (c) => c.toUpperCase())

/** Stable, CSS-safe view-transition-name shared between listings and review detail. */
export const vtName = (kind: "photo" | "title", id: string) =>
  `vt-${kind}-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`
