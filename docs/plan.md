# Plan: hosting, media and automatic publishing from Instagram

Status (18/11/2026): **design agreed, nothing built yet.**

This document records what has been decided to move from the current site (Astro on GitHub Pages, public repo, images served from the old WordPress) to a site on Cloudflare whose reviews are generated automatically from Alberto's Instagram posts.

---

## 1. Starting point

- **Content:** 7 Instagram reviews for now (the 721 from WordPress were removed and will be migrated again), one JSON file per review in `src/content/reviews/<id>.json`, loaded with Astro's content layer (`glob()` in `src/content.config.ts`) and validated with Zod. They are built as static pages.
- **Hosting:** GitHub Pages through `.github/workflows/pages.yml`. The repo has to be public for the site to be public.
- **Redirects:** the old WordPress URLs are in `src/data/redirects.json`. In a static build, Astro renders them as pages with `meta refresh`, not as real 301s.
- **Images:** **7,256 review images load from the old WordPress** (`https://dimeunrestaurante.com/wordpress/wp-content/uploads/...`). If the domain points at the new site before they are moved, they all return 404.
- The Instagram photos are already in `public/img/ig`, with 800px copies made by `scripts/photos.mjs` (sharp). Each dish's photo is mapped in `src/data/dish-photos.json`.

---

## 2. Decisions

### 2.1 Data: JSON in git, no database

- **No Supabase or any other database.** At ~400 new reviews a year (about 1,130 in total, ~6.5 MB) JSON is more than enough. A database would make the build depend on an external service, take the content out of git (no history, no diffs) and wouldn't make a static site any faster.
- ✅ **Done:** `reviews.json` was split into one file per review (`src/content/reviews/<id>.json`) loaded with `glob()`. Each new review is a new file and PRs stay clean.
- A database or CMS would only make sense if someone non-technical had to edit from a dashboard, if there were dynamic content (comments, votes) or if we reached tens of thousands of reviews.

### 2.2 Hosting: Cloudflare

| Option | Free private repo? | Why it was rejected or chosen |
|---|---|---|
| **Cloudflare (Workers static assets / Pages)** | Yes | **Chosen.** Unlimited free static traffic, CDN, DNS in the same place and real 301s with `_redirects`. |
| Netlify | Yes | Credit-based free plan with a bandwidth cap. |
| Vercel | Yes | The Hobby plan is for non-commercial use only. |
| GitHub Pages + Pro | No (~$4/month) | You pay just to keep the repo private and still get no 301s. |

- Build: `pnpm build`; output: `dist`.
- Generate **`_redirects` from `redirects.json`** to serve real 301s and keep the SEO of the old URLs.
- `BASE_PATH`, `SITE_URL` and `PUBLIC_PREVIEW` are no longer needed, and the `pages.yml` workflow is removed.
- No SSR, VPS or Docker needed.

### 2.3 Domain

Steps, in this order:

1. **Migrate the WordPress images first** (see 2.4) and back up the WordPress site.
2. Deploy to Cloudflare and check the site on its `*.workers.dev` URL.
3. Add the domain to Cloudflare, which imports the DNS records.
4. **Check the mail records (MX, SPF, DKIM)**, if the domain has email.
5. Change the nameservers at the registrar. Optionally, transfer the domain to Cloudflare afterwards.
6. Add `albertodeluna.com` and `www` as custom domains of the project. SSL sets itself up. Keep a single canonical version (with or without `www`) and redirect the other.
7. Keep `dimeunrestaurante.com` (with and without `www`) on Cloudflare with a 301 redirect of the whole path to `albertodeluna.com`, so neither SEO nor existing links are lost. The images under `/wordpress/wp-content/` must keep being served until they are moved to R2.
8. Submit the new sitemap in Google Search Console and register the domain change with its "Change of address" tool.

### 2.4 Media: Cloudflare R2

- **R2 bucket** served from a subdomain, e.g. `media.albertodeluna.com`, with CDN caching. Free up to 10 GB, with no egress fees.
- **Images:** the sizes are generated before upload, with `sharp` (what `scripts/photos.mjs` already does): 800 and 1600px, in AVIF and WebP. We rule out Cloudflare Images (on-the-fly resizing) because it adds nothing if we already generate the sizes.
- **Videos:** `ffmpeg` to 720p or 1080p H.264 MP4 with `faststart`, plus a WebP poster, all on R2. If videos get longer or traffic grows, move to **Cloudflare Stream** (adaptive HLS; $5 per 1,000 minutes stored and $1 per 1,000 minutes watched).
- The 7,256 WordPress images and those in `public/img/ig` move to the same bucket. They don't go in the repo, which would grow by several GB with videos.

---

## 3. Automatic publishing pipeline

### 3.1 Overview

```
Workflow 1: ingest (cron every 4 h)
│
├─ [0] Classifier            (@handle rule + Jev, inside the script)
│       is it a review? ── no ──► marked as processed and ignored
│                       ── unsure ──► issue "Is this a review?"
│
├─ [1] Ingest                (deterministic script, no AI)
│       download → compress → upload to R2
│
├─ [1b] Describer            (1 vision call, inside the script)
│       describes each photo/video and matches it to its dish → posts.json
│
└─ [2] Writer agent          (text only; only if there are new reviews)
        writes/updates the review → pnpm build → opens a PR

Workflow 2: review (when the PR is opened or updated)
│
├─ [3] Deterministic checks
│
├─ [4] Reviewer agent
│       OK? ── yes ──► approves → auto-merge → Cloudflare publishes
│           ── no ──► comments fixes for the writer → push → back to [3]
│           ── 3 rounds without approval ──► needs-human label
│
└─ Notification of every merge (email/Slack) with a link to the review
```

Design principle: **AI only does what needs understanding** (classifying, describing and matching photos to dishes, writing, reviewing). **Everything that moves files is deterministic code**: more reliable, cheaper and easier to debug.

### 3.2 Reading Instagram

- **Official Instagram API** (Instagram API with Instagram Login). **No scraping**: it breaks the terms, it breaks often, and the account can get blocked.
- **What Alberto needs:** a professional account (Creator or Business) and a Meta app to get the long-lived token. The token lasts 60 days and can be refreshed in the same job.
- The API doesn't notify when the account itself posts, so it's polled **by cron, every 4 hours**.
- The media URLs the API returns expire, so they have to be downloaded in the same run.

### 3.3 Step 0: classifier

Not all of Alberto's posts are reviews, so they're classified **before anything is downloaded**.

1. **Free deterministic hint:** reviews start with `NAME @restaurant` on the first line (`scripts/import-reviews.mjs` already extracts the `handle` this way). It's never used alone to discard a post.
2. **[Jev](https://openrouter.ai/blog/insights/what-is-jev/)** (`typesafe/jev-1.14`, through OpenRouter), a **decision model** that doesn't generate text: it returns one option from a closed list along with its probability.
   - It gets **one Choice question** with the options `opinion | dishes | drinks | not_review` over the caption and the deterministic hint. The probability it returns serves as `confidence`.
   - **Caption only, first.** The first photo's thumbnail is added only if the probability comes out low, because with images Jev switches to a long-context mode that is slower and less accurate. Jev only takes PNG and JPEG: Instagram's JPEG thumbnail works as is, our WebP or AVIF versions don't.
   - Jev doesn't extract data. The `handle` comes from the first-line rule and the writer agent writes the restaurant's name.
   - Cost: $0.042 per million input tokens, and output is free. **Less than a hundredth of a cent per post.**
   - **Risks:** it's in early access (endpoint `POST /api/alpha/decisions`) and image support is recent. Pin the version (`jev-1.14`, not `~typesafe/jev-latest`); the probability shows how concentrated the answers are, not whether they're right, so the threshold is calibrated in the benchmark.
   - **Plan B:** one structured-output call to a cheap generative model (Gemini 3.1 Flash-Lite, gpt-6-luna or Claude Haiku 5.5, under $0.001 per post), which can also extract the name and the `handle`:

     ```json
     { "kind": "opinion" | "dishes" | "drinks" | "not_review",
       "restaurant": "Casa Lista", "handle": "casalista",
       "confidence": 0.95, "reason": "Starts with a name and @, gives a score and price" }
     ```
3. **What happens with each result:**
   - `not_review`: marked as processed; nothing is downloaded or uploaded.
   - `confidence` < 0.8: an issue is opened with the link to the post. **No post is discarded without a trace.**
   - `opinion`, `dishes` or `drinks`: grouped by `handle` within a window of a few days, because one review can be spread over several posts (e.g. Yakiniku Rikyu has an opinion post and a dishes post from the same day). A `dishes` post that arrives without its opinion waits for the next run.
4. **State:** the IDs of every processed post are kept, discarded ones included. They can live in a file in the repo or be derived from the reviews' `instagram.posts`, plus a list of the ignored ones.

### 3.4 Step 1: deterministic ingest (`scripts/instagram.mjs`)

It's a step of its own in the workflow and **the only one with the Instagram and R2 credentials**. The agent can't see them. This step also runs the classifier (step 0), so it needs the OpenRouter key too.

1. Downloads the photos and videos of the posts that are reviews.
2. Optimises:
   - Photos: `sharp` to 800 and 1600px, in AVIF and WebP.
   - Videos: `ffmpeg` to MP4 with a poster, plus **3 or 4 JPEG frames** spread across the video (e.g. `casa-lista-v1-f2.jpg`). They're used by the describer (if it doesn't take native video), the reviewer and the Jev check, which only takes PNG and JPEG.
3. Uploads everything to R2, **frames included**, so the reviewer's workflow can download them without processing the video again.
4. Runs the describer (step 1b) and writes `posts.json` with the caption, date, permalink, `kind`, `handle` and the `media[]` list the describer returns.
5. Reports whether there are new reviews, so the agent step only runs when needed.

It can be tested locally without an agent: `node scripts/instagram.mjs` and check `posts.json`.

### 3.4b Step 1b: image and video describer

**A vision model describes the media and matches them to dishes; the writer then works with text only.** It's **a single structured-output call per post, not an agent**, and it lives inside the ingest script, like the classifier (`DESCRIBER_MODEL`).

- **It gets the caption and the list of dishes it mentions**, plus all the photos (800px version). Without the caption it could only say "grilled meat in strips" and the writer would have to guess the dish. With it, **the photo–dish matching is done by the model that sees the photos.**
- **Videos:** if the model takes video natively (Gemini), it gets the whole MP4; otherwise, the 3 or 4 frames. Check whether OpenRouter accepts video input for Gemini.
- It returns, for each media item:

  ```json
  { "file": "casa-lista-13.webp", "url": "https://media…/casa-lista-13.webp",
    "type": "image",
    "dish": "chuleta de rubia", "dish_confidence": 0.9,
    "description": "Chuleta cortada en tiras sobre tabla, con sal en escamas",
    "alt": "Chuleta de rubia gallega cortada, con sal en escamas",
    "cover_candidate": true }
  ```

  `dish` is `null` if the item isn't any dish from the caption (the room, the menu, a wine...). Descriptions and `alt` stay in Spanish, the site's language.

**Why it's separate from the writer:**
- **The writer doesn't need vision.** Any text model can be picked (including some without vision, like DeepSeek) and the question of whether OpenCode passes images to the model goes away.
- **Images are processed once.** In each round of fixes the writer works with text only, without loading the photos again.
- **Each part is evaluated and fixed on its own.** If a photo is matched wrong, it's clear right away whether the description or the writing failed.
- **Better video understanding**, if native video can be used.

**Cost:** the images (~15,000 tokens per post) are paid for once. The saving against a writer with vision is cents a month; the real gain is quality and freedom to pick models.

**Risk:** a describer error reaches the writer, who can't catch it because it doesn't see the images. That's why **the reviewer still looks at the images** (see 3.6).

### 3.5 Step 2: writer agent

It runs as **a coding agent inside the Action** (option B; see 3.8), **text only**. It gets `posts.json` (caption and `media[]` with descriptions, matched dishes, `alt` and cover candidates) and:

- Decides whether it's a new review or an update to an existing one (`instagram.kind: "new" | "update"`), searching the reviews in the repo.
- Writes the review's JSON following the `content.config.ts` schema and the tone of the existing reviews, with the R2 URLs.
- Fills `dish-photos.json` with the describer's matches, picks the cover from the candidates and uses the describer's `alt` text.
- Runs `pnpm build` and fixes its own errors.
- Opens the PR, with a table of which photo was matched to each dish (with its `dish_confidence`) so it can be reviewed at a glance.

### 3.6 Steps 3 and 4: automatic review, no human review

**Step 3, deterministic checks** (no AI, before the reviewer):
- `pnpm build`, which validates the schema.
- Every image and video URL returns 200.
- Every dish in `dish-photos.json` appears in the review's text.
- Branch protection on `main`: nothing that fails these checks can be merged.

*Experiment, which does use AI:* **Jev with Noul questions** (yes/no with a probability) for each photo–dish pair, e.g. "does this photo show a chuleta de rubia?". It's a nearly free check that would catch mismatched photos before the reviewer. Since Jev only takes PNG and JPEG, the 800px photos have to be converted first; video frames are already JPEG, so the check covers videos too. It's measured in the benchmark and only switched on if it's reliable.

**Step 4, reviewer agent:** a second workflow triggered when the PR is opened or updated (`pull_request: opened, synchronize`).
- **It's independent:** it only gets the original caption, the diff and the images, never the writer's reasoning. Ideally it uses **a model from a different family**, which catches errors better than one like the writer.
- It checks:
  - That the data comes from the caption, which is the source of truth. Score, price, city and dishes can't be made up.
  - That each photo **and each video** matches its dish. For that, its workflow first downloads from R2 the 800px photos and **the videos' JPEG frames**, and **looks at them itself**: it doesn't trust the describer's descriptions, because this is the only independent check of that matching. That's why the reviewer does need a vision model that reads images from the runner's disk.
  - The reviewer doesn't see video (OpenCode opens images, not MP4) and, being from a different family than the describer, won't be Gemini with native video. It sees less than the describer, but a few spread-out frames are enough to check whether the video is the matched dish. **If the frames don't let it confirm a video's match, it doesn't reject it: it labels the PR `needs-human`.**
  - That the new review vs update call is right, that the tone sounds like Alberto and that the `alt` text is good.
  - That the lessons in `docs/agent-lessons.md` are followed.
- If everything is fine, it **approves and enables auto-merge**. If not, it leaves a comment with concrete fixes that starts with the mention that triggers the writer (`/opencode`). The writer fixes and pushes, and that push re-runs this workflow (`synchronize`).
- **At most 3 rounds**, counted from the reviewer's comments on the PR. After that the `needs-human` label is added and the flow stops.

**Technical details:**
- Events created with the default `GITHUB_TOKEN` **don't trigger other workflows**. The agents have to use a GitHub App token.
- The writer has to explicitly allow comments from the reviewer bot; by default, some Actions ignore bot comments.

**Safeguards, since there is no human review:**
- A notification for every merge, with a link to the review. Reverting is one click.
- Automatic `needs-human` if the score isn't stated explicitly in the caption, if the post is negative about the restaurant, or if the reviewer can't confirm from the frames which dish a video shows.

### 3.7 Lessons memory

- CI has no memory between runs, so the memory is a **versioned file**: `docs/agent-lessons.md`. Both agents' instructions tell them to read it before starting; don't rely on each tool loading `CLAUDE.md` or `AGENTS.md` on its own.
- When the writer applies a fix, **it adds the lesson in the same PR**. For example: "If the caption says 'menú degustación', `price` is the menu's price, not the average price".
- The reviewer also reviews the lessons, which only stay if the PR is merged.
- Rules: only generalisable lessons, one line each, no duplicates. The file is consolidated every so often.

### 3.8 How the agent fits into GitHub Actions

| Option | What it is | Verdict |
|---|---|---|
| A. Script + one API call | The caption step is a single structured-output call | The cheapest and most predictable, but it can't adapt to cases you didn't foresee. A fallback if we want to simplify. |
| **B. Coding agent in the Action** | Claude Code (`claude-code-action`), Codex (`openai/codex-action`), Gemini CLI (`run-gemini-cli`) or OpenCode | **Chosen.** It adapts, checks its work with the build and answers PR comments. |
| C. Anthropic Managed Agents | Anthropic hosts the agent and the cron | Rejected: beta, billed by session time and one more platform, with no advantage here. |

- **Decision: OpenRouter for every model and OpenCode for the agents.**
  - **[OpenRouter](https://openrouter.ai/)**: one key (`OPENROUTER_API_KEY`) and one bill for every model. It charges the provider's price and takes a ~5.5% fee when buying credits (cents at this volume; confirm on their site).
  - **OpenCode** (`anomalyco/opencode/github`) supports any provider (`provider/model`), OpenRouter included. It runs on cron and answers mentions in the PR (`/opencode`). `claude-code-action`, `codex-action` and `run-gemini-cli` are tied to one provider and don't use OpenRouter.
  - The classifier (Jev) and the describer are called directly by the ingest script.
  - **One fixed model per step**, stored in GitHub Actions variables (`CLASSIFIER_MODEL`, `DESCRIBER_MODEL`, `WRITER_MODEL`, `REVIEWER_MODEL`), to switch models without touching code. Writer and reviewer from different families; describer and reviewer too, so the reviewer doesn't repeat the describer's vision mistakes.
  - **To verify:** that OpenCode passes the images it opens from disk to the reviewer's model.
  - **No automatic router** (`openrouter/auto`): it can't be evaluated, because the model changes with every request; it may pick one without vision; and it doesn't guarantee writer and reviewer are from different families.
  - Accepted downsides: the data (captions and photos, which are public) goes through one more intermediary, and some provider-specific features (prompt caching, structured-output details) may behave differently through OpenRouter. Checked in the benchmark.
- Example workflow structure (the exact input names have to be checked in each Action's docs):

  ```yaml
  on:
    schedule: [{ cron: "0 */4 * * *" }]
  jobs:
    ingest:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - id: ingest
          run: node scripts/instagram.mjs # classifies, processes and writes posts.json
          env:
            IG_TOKEN: ${{ secrets.IG_TOKEN }}
            R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
            R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
            OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
            CLASSIFIER_MODEL: ${{ vars.CLASSIFIER_MODEL }}
            DESCRIBER_MODEL: ${{ vars.DESCRIBER_MODEL }}
        - if: steps.ingest.outputs.new == 'true'
          uses: anomalyco/opencode/github@<pinned version>
          env:
            OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          with:
            model: ${{ vars.WRITER_MODEL }}
            prompt: Read docs/agent-lessons.md and posts.json, and create or update the reviews...
  ```

---

## 4. Models

**Undecided.** At about 9 posts a month, any candidate costs a few euros a month or less, so **quality** decides, and it has to be measured.

Estimate per post: about 150,000 input tokens and 10,000 output tokens, adding writer and reviewer over one round and counting the images. With a separate describer the split changes (the describer and the reviewer pay for the images, the writer only for text), but the total stays in the same order of magnitude. Prices are from November 2026; OpenAI's and Google's from their official pages.

| Model | Input / output (per million tokens) | Per post | Per month |
|---|---|---|---|
| Claude Opus 5.5 | $4 / $20 | ~$0.80 | ~$7 |
| Claude Sonnet 5.5 | $2 / $10 | ~$0.40 | ~$3.60 |
| OpenAI gpt-6.2-sol | $2 / $10 | ~$0.40 | ~$3.60 |
| Gemini 4 Hydrogen | $1.50 / $7.50 | ~$0.30 | ~$2.70 |
| OpenAI gpt-6.1-terra | $1 / $5 | ~$0.20 | ~$1.80 |
| Gemini 3.8 Flash (⚠️ doubles from 1/1/2027) | $0.75 / $3.75 | ~$0.15 | ~$1.35 |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 | ~$0.05 | ~$0.45 |
| Qwen 3.8 Flash (aggregator price) | ~$0.15 / $0.47 | ~$0.03 | ~$0.25 |
| OpenAI gpt-6-luna | $0.10 / $0.50 | ~$0.02 | ~$0.20 |
| Claude Haiku 5.5 | $0.10 / $0.50 | ~$0.02 | ~$0.20 |

- DeepSeek has no vision, so it can't be the describer or the reviewer. **It can be a writer candidate**, now that the writer only works with text (DeepSeek V4 Flash, about $0.22 / $0.66 per million tokens off-peak according to aggregators; confirm on their site).
- To do: confirm which OpenAI models accept images.
- **Describer:** a model with good vision; if possible, Gemini with native video. Candidates: Gemini 4 Hydrogen, Gemini 3.1 Flash-Lite and an OpenAI vision model.
- **Classifier:** **Jev** (`typesafe/jev-1.14`, $0.042 per million input tokens, free output). Plan B: a low-end model (Haiku 5.5, gpt-6-luna or Flash-Lite).
- **Hypothesis to validate:** a vision describer, a mid-range text-only writer (gpt-6.1-terra or DeepSeek) and a vision reviewer from a different family than the describer, with OpenCode on OpenRouter, for about €2–4 a month.
- Every candidate is called through OpenRouter, so the benchmark runs through the models with a single key.

### Benchmark before choosing

We already have the data for it: the reviews generated from Instagram posts, with their caption, their `instagram.posts[].kind` and their `dish-photos.json`.

1. **Architecture:** compare a vision writer that does everything against describer plus text-only writer, on the same posts.
2. **Describer:** measure photo–dish matching against `dish-photos.json` and the quality of the `alt` text. On posts with video, compare native video (Gemini) against frames.
3. **Writer and reviewer:** feed the same post from about 10 existing reviews to 4 or 5 candidates (gpt-6.1-terra, DeepSeek as text writer, Gemini 4 Hydrogen, gpt-6-luna and Claude Sonnet 5.5 as the reference).
4. **Score:** correct fields (score, price, city, cuisine), correct photo–dish matches, made-up data and faithfulness to Alberto's tone.
5. **Classifier:** add about 20 posts that aren't reviews (personal, sponsored, travel) and compare Jev, caption only and caption plus thumbnail, against plan B. Calibrate the probability threshold. What matters is that **no non-review post slips through** and that very few reviews are missed.
6. **Photo–dish check with Jev (Noul):** using the pairs in `dish-photos.json`, measure whether it catches mismatched photos, mixing correct pairs with deliberately swapped ones.

Estimated cost of the benchmark: a few dollars.

---

## 5. Estimated recurring costs

| Item | Cost |
|---|---|
| Cloudflare hosting (static) | €0 |
| R2 (up to 10 GB, no egress fees) | €0 at first |
| GitHub Actions, private repo (~2,000 min or $12 of compute a month on the Free plan) | €0: about 200–250 min a month of cron, plus a few minutes of checks and review per PR round. Well under the quota. |
| AI models, through OpenRouter | ~€0.20–7 a month depending on the model (see 4), plus a ~5.5% fee on credits. The Jev classifier is practically free. |
| Cloudflare Stream (only if needed) | $5 per 1,000 minutes stored, $1 per 1,000 minutes watched |

---

## 6. Order of work

1. **WordPress images to R2.** Measure how much they take, create the bucket and subdomain, and write a script that downloads, optimises with `sharp`, uploads and rewrites the URLs in `src/content/reviews/`. Also migrate `public/img/ig`. *This is what blocks the domain change.*
2. **Deploy to Cloudflare** with `_redirects` generated from `redirects.json`, check on `*.workers.dev`, switch DNS and remove `pages.yml`. Make the repo private.
3. ✅ **Split `reviews.json`** into one file per review (`glob()`). Done.
4. **Model benchmark** through OpenRouter: architecture (vision writer vs describer plus text writer), describer, writer, reviewer, classifier (Jev vs plan B) and the Jev photo–dish check.
5. **Instagram job:** `scripts/instagram.mjs` (classifier, ingest and describer) and the workflow with the writer agent.
6. **Reviewer agent:** deterministic checks, branch protection, auto-merge, round limit, `docs/agent-lessons.md` and notifications.

## 7. What we need before starting

- [ ] Cloudflare account, R2 bucket and an API token with R2 permissions.
- [ ] Access to the domain registrar and a list of the current DNS records, especially mail.
- [ ] A backup of the WordPress site.
- [ ] Alberto's Instagram account set to professional (Creator or Business).
- [ ] A Meta app and a long-lived Instagram API token.
- [ ] An OpenRouter account with credits and `OPENROUTER_API_KEY` (replaces each provider's keys).
- [ ] A GitHub App (OpenCode's or our own) so the agents can comment and trigger workflows.
- [ ] Secrets and variables in GitHub: `IG_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `OPENROUTER_API_KEY` as secrets; `CLASSIFIER_MODEL`, `DESCRIBER_MODEL`, `WRITER_MODEL` and `REVIEWER_MODEL` as variables.
- [ ] A notification channel for merges (email or Slack).
