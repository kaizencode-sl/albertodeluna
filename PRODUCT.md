# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: fans of Alberto de Luna who come to read his reviews. They follow him on Instagram (151.000 followers) or arrive from search, and they come for his voice and his opinions, browsing reviews rather than running a quick "where do we eat tonight" lookup. Serving the reader comes first; finding a restaurant by plan, city or score is a secondary job the site still supports.

Secondary: restaurants that have been reviewed, who can download a seal with their score that links back to the review (`/sello/`).

## Product Purpose

Alberto de Luna (formerly "Dime un restaurante") is Alberto's restaurant review site: around 728 reviews written since 2010, each scored in "lunas" (moons) from 0 to 10. This codebase is a rebuild of the existing WordPress site at dimeunrestaurante.com, made by Kaizencode as a **pitch demo** to win Alberto as a client; he has not commissioned it yet. Success for the demo is that Alberto sees his archive and his voice presented better than anything he has, and wants it live.

## Positioning

One named critic with a personal scale, not an aggregator. Alberto scores the food against what it costs ("relación placer-precio") and against the restaurant's own category, so a cheaper place with less ambitious cooking can outscore a fine-dining one. He pays his own bills (save the occasional invitation), visits around a hundred places a year, and writes in a direct, sincere, slightly provocative voice. Scores are agreed with whoever ate with him.

## Operating Context

- Reviews start on Alberto's Instagram. For now the repo holds only the seven reviews built from his Instagram posts (October–November 2026); the WordPress archive was imported once (`scripts/import-reviews.mjs`), then removed and is being migrated back from the old site; new reviews will come from an Instagram-to-PR pipeline in this repo (see `docs/plan.md`). The content model follows what that pipeline produces.
- A review can carry linked Instagram posts of three kinds: the opinion itself, the dishes, and the drinks.
- Previews are published to GitHub Pages on every push to `main` and kept out of search. Production will live at **albertodeluna.com** (planned on Cloudflare, see `docs/plan.md`), with dimeunrestaurante.com redirecting to it.

## Capabilities and Constraints

- Static Astro site; content is one collection, a JSON file per review (`src/content/reviews/<id>.json`), with name, city, headline, score (may be null), price band, plans, venue and cuisine tags, what he paid, visit date, address, images, body and Instagram links.
- Pages: home, the full review list with filters, a page per review, a map of scored restaurants ("Mapa de lunas"), "Cómo puntúo" (the scale and who he is), and the restaurant seal finder and download pages.
- Old WordPress addresses redirect to the new pages (`src/data/redirects.json`, guarded by `pnpm check:redirects`); the site is in Spanish.
- Undecided: when it replaces the live site, and anything Alberto has not yet seen or approved.

## Brand Commitments

- Name: "Alberto de Luna" (formerly "Dime un restaurante"; the old name stays only as the SEO alternate name). Domain: albertodeluna.com.
- Mark: his three moon phases (`src/lib/brand.ts`), alone or stacked above "ALBERTO DE LUNA".
- The score unit is the "luna", 0 to 10; the maximum is reserved for restaurants "uno no puede morir sin conocer".
- His own line: "La vida es demasiado corta como para no disfrutarla comiendo."
- Voice: first person, direct, sincere, a little provocative; "Ni me vendo ni me caso con nadie."

## Evidence on Hand

- The Instagram reviews with their photos (`src/content/reviews/`, `public/img/ig/`), the hero photo (`public/img/home/`), dish photos and Instagram photo maps (`src/data/dish-photos.json`, `src/data/instagram-photos.json`), geocoded locations (`src/data/geo.json`), and a hero video (`public/video/ostras.mp4`).
- His follower count (151.000) and the scale explanation in "Cómo puntúo".
- No testimonials, press quotes or restaurant endorsements exist in the repo; don't invent them.

## Product Principles

1. **Alberto's voice is the product.** Every surface should make his opinion easier to read and harder to mistake for anyone else's.
2. **The score is his scale, not a rating.** Always show it as lunas and keep the placer-precio logic visible where scores are compared.
3. **The archive is the asset.** Fifteen years of reviews should feel like a body of work worth browsing, not a database to query.
4. **Instagram feeds the site.** Design for content that arrives from his posts, with real photos and uneven text lengths, never hand-curated placeholders.
5. **It has to win the pitch.** Prefer work that shows Alberto something he couldn't get from a template.
