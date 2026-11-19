import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import Lenis from "lenis"
import { moonPath } from "@/lib/moon"
import { mountedMoonGL } from "@/lib/moon-gl"

gsap.registerPlugin(ScrollTrigger, SplitText)

// Seconds scrubbed animations take to catch up with the scroll: this lag, on
// top of Lenis, is what makes them glide instead of following every tick
const SCRUB = 1.1
// Plays on the way in and stays. Not `once: true`: a trigger that kills itself
// while ScrollTrigger is refreshing its list breaks the refresh loop.
const PLAY_ONCE = "play none none none"

const $ = <T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document
) => root.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document
) => gsap.utils.toArray<T>(root.querySelectorAll(sel))

const formatScore = (v: number) =>
  String(Math.round(v * 2) / 2).replace(".", ",")

// Page-wide listeners added while the animations run; aborted when
// gsap.matchMedia() reverts them (reduced motion switched on)
let signal: AbortSignal | undefined

function smoothScroll() {
  const lenis = new Lenis({ lerp: 0.09 })
  lenis.on("scroll", ScrollTrigger.update)
  const raf = (t: number) => lenis.raf(t * 1000)
  gsap.ticker.add(raf)
  gsap.ticker.lagSmoothing(0)
  const stop = () => {
    gsap.ticker.remove(raf)
    lenis.destroy()
  }
  return { lenis, stop }
}

// The homepage opening: the hero photo opens from a point to the whole
// screen, its edge traced by a ring of light as it spreads, and LUNA rises
// whole from the bottom edge. Scrolling then shrinks the photo back into a
// moon.
function intro() {
  const hero = $("[data-hero]")
  const media = $("[data-hero-media]")
  const ring = $("[data-hero-ring]")
  if (!hero || !media) return
  // Radii in px: a circle that covers the screen, and the moon the photo
  // becomes on scroll
  const fullR = () => Math.hypot(innerWidth, innerHeight) / 2 + 2
  const endR = () => Math.min(innerWidth, innerHeight) * 0.3
  const circle = (r: number, y = 50) => `circle(${r}px at 50% ${y}%)`

  // The photo opens from a point to the whole screen, with the ring of light
  // riding its edge and fading as it reaches the corners
  const opening = { duration: 1.5, ease: "expo.inOut" }
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } })
  tl.fromTo(
    media,
    { clipPath: circle(0) },
    { clipPath: circle(fullR()), ...opening },
    0
  )
  if (ring)
    tl.fromTo(
      ring,
      { width: 0, height: 0, opacity: 1 },
      { width: fullR() * 2, height: fullR() * 2, opacity: 0, ...opening },
      0
    )
  tl.to(
    "[data-hero-frame]",
    { scale: 1.05, duration: 2.4, ease: "expo.out" },
    0
  )
    .to(
      // Hidden below the edge by .motion; the word rises as one block
      "[data-hero-word] span",
      { y: 0, duration: 1.6, ease: "expo.out" },
      0.75
    )
    .to(
      // Hidden by .motion, so they never flash in before they arrive
      "[data-hero-meta] > *",
      { y: 0, opacity: 1, duration: 1, stagger: 0.12, ease: "expo.out" },
      1.05
    )

  // Then the scroll takes over: the word grows and lifts, the photo closes
  // back into a moon hanging over it
  gsap
    .timeline({
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom bottom",
        scrub: SCRUB,
        invalidateOnRefresh: true,
      },
    })
    .to(
      "[data-hero-word]",
      { yPercent: -70, scale: 1.25, transformOrigin: "50% 100%", ease: "none" },
      0
    )
    .fromTo(
      media,
      { clipPath: () => circle(fullR()) },
      {
        clipPath: () => circle(endR(), 40),
        ease: "none",
        immediateRender: false,
      },
      0
    )
    .to("[data-hero-frame]", { scale: 1.3, ease: "none" }, 0)
    .to("[data-hero-meta]", { opacity: 0, y: -40, ease: "none" }, 0)
}

// A statement that lights up word by word as it is read
function words() {
  $$("[data-words]").forEach((el) => {
    gsap.to($$(".word", el), {
      opacity: 1,
      stagger: 0.1,
      ease: "none",
      scrollTrigger: {
        trigger: el,
        start: "top 80%",
        end: "bottom 45%",
        scrub: SCRUB,
      },
    })
  })
  $$<SVGSVGElement>("[data-orbit]").forEach((svg) => {
    const place = orbitAt(svg)
    const state = { p: 0 }
    place(0)
    gsap.to(state, {
      p: 1,
      ease: "none",
      onUpdate: () => place(state.p),
      scrollTrigger: {
        trigger: svg,
        start: "top 95%",
        end: "bottom 35%",
        scrub: SCRUB,
      },
    })
  })
}

// Puts the orbit's moon at a point along its path, lit to match: new at the
// start, full at the end
function orbitAt(svg: SVGSVGElement) {
  const path = $<SVGPathElement>(".orbit-path", svg)
  const moon = $<SVGGElement>("[data-orbit-moon]", svg)
  const lit = moon?.querySelector("path")
  const length = path?.getTotalLength() ?? 0
  return (p: number) => {
    if (!path || !moon || !lit) return
    const pt = path.getPointAtLength(p * length)
    moon.setAttribute("transform", `translate(${pt.x} ${pt.y})`)
    lit.setAttribute("d", moonPath(p, 22))
  }
}

// The scoring section: a moon fills from new to full while the number climbs
function moonScrub() {
  $$("[data-moon-scrub]").forEach((section) => {
    const paths = $$<SVGPathElement>(".moonwrap [data-moon]", section)
    const canvas = $<HTMLCanvasElement>("[data-moon-gl]", section)
    const score = $("[data-score]:not([data-moon-gl])", section)
    const bars = $$("[data-dist] i", section)
    const distText = $("[data-dist-text]", section)
    let bucket = -1
    const set = (v: number) => {
      paths.forEach((p) => p.setAttribute("d", moonPath(v / 10)))
      // The sphere exists once it nears the screen (shaded-moon.astro)
      if (canvas) {
        canvas.dataset.phase = String(v)
        mountedMoonGL(canvas)?.render(v / 10)
      }
      if (score) score.textContent = formatScore(v)
      // The bar for the whole score lights up, and the line says how many
      // (by the number as shown, which goes in halves: 2,5 counts as a 2)
      const n = Math.min(10, Math.floor(Math.round(v * 2) / 2))
      if (n !== bucket && bars.length) {
        bucket = n
        bars.forEach((b, i) => b.classList.toggle("is-on", i === n))
        if (distText) {
          distText.textContent = bars[n]!.dataset.text ?? ""
          distText.animate(
            [
              { opacity: 0, transform: "translateY(6px)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 300, easing: "ease-out" }
          )
        }
      }
    }
    const state = { v: 0 }
    set(0)
    gsap.to(state, {
      v: 10,
      ease: "none",
      onUpdate: () => set(state.v),
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: SCRUB,
      },
    })
    gsap.from($(".moonwrap", section), {
      rotate: -40,
      scale: 0.8,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top bottom",
        end: "top top",
        scrub: SCRUB,
      },
    })
  })
}

// Wide type travelling sideways with the scroll, and stickers that drop in
function travellingType() {
  $$("[data-marquee]").forEach((line) => {
    const left = line.dataset.marquee === "left"
    const distance = () => -(line.scrollWidth - window.innerWidth * 0.6)
    gsap.fromTo(
      line,
      { x: left ? 0 : distance },
      {
        x: left ? distance : 0,
        ease: "none",
        scrollTrigger: {
          trigger: line.parentElement,
          start: "top bottom",
          end: "bottom top",
          scrub: SCRUB,
          invalidateOnRefresh: true,
        },
      }
    )
  })
  $$("[data-drop]").forEach((sticker, i) => {
    gsap.fromTo(
      sticker,
      { y: -300, rotate: 0, opacity: 0 },
      {
        y: 0,
        rotate: Number(sticker.dataset.drop ?? 0),
        opacity: 1,
        duration: 1,
        delay: i * 0.12,
        ease: "bounce.out",
        scrollTrigger: {
          trigger: sticker.closest(".cities") ?? sticker.parentElement,
          start: "top 55%",
          toggleActions: PLAY_ONCE,
        },
      }
    )
  })
  const cities = $(".cities")
  const depthWraps = $$<HTMLElement>(".sticker-wrap[data-depth]")
  depthWraps.forEach((wrap) => {
    const depth = Number(wrap.dataset.depth ?? 0)
    gsap.fromTo(
      wrap,
      { y: -42 * depth },
      {
        y: 42 * depth,
        ease: "none",
        scrollTrigger: {
          trigger: cities ?? wrap.parentElement,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.9,
        },
      }
    )
  })
  if (
    cities &&
    depthWraps.length &&
    matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    const movers = depthWraps.map((wrap) => ({
      depth: Number(wrap.dataset.depth ?? 0),
      xTo: gsap.quickTo(wrap, "x", { duration: 0.65, ease: "power3.out" }),
    }))
    cities.addEventListener(
      "pointermove",
      (e) => {
        const r = cities.getBoundingClientRect()
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2
        for (const m of movers) m.xTo(nx * m.depth * 22)
      },
      { signal }
    )
    cities.addEventListener(
      "pointerleave",
      () => {
        for (const m of movers) m.xTo(0)
      },
      { signal }
    )
  }
}

// Display titles whose letters arrive one by one, once
function charTitles() {
  $$("[data-chars]").forEach((title) => {
    gsap.from(SplitText.create(title, { type: "words,chars" }).chars, {
      yPercent: 100,
      rotate: 8,
      opacity: 0,
      duration: 0.9,
      stagger: 0.035,
      ease: "power3.out",
      scrollTrigger: {
        trigger: title,
        start: "top 88%",
        toggleActions: PLAY_ONCE,
      },
    })
  })
}

// Rows and galleries: the head rises, each photo opens via rounded optical curtains, the score stamps
function wipes() {
  const desktop = matchMedia("(min-width: 800px)").matches
  const shutterFrom = (idx: number, radius: number) =>
    desktop && idx % 2 === 0
      ? `inset(0% 50% 0% 50% round ${radius}px)`
      : `inset(50% 0% 50% 0% round ${radius}px)`

  $$("[data-row]").forEach((row) => {
    const photos = $$("[data-wipe]", row)
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: row,
        start: "top 88%",
        toggleActions: PLAY_ONCE,
      },
    })
    tl.from($("[data-row-top]", row), {
      y: 40,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
    })
    photos.forEach((fig, idx) => {
      tl.fromTo(
        fig,
        { clipPath: shutterFrom(idx, 12) },
        {
          clipPath: "inset(0% 0% 0% 0% round 3px)",
          duration: 1.05,
          ease: "expo.out",
        },
        0.1 + idx * 0.08
      )
    })
    tl.from(
      $$("[data-wipe] img", row),
      { scale: 1.16, duration: 1.35, stagger: 0.08, ease: "expo.out" },
      0.1
    )
      .from(
        $("[data-stamp]", row),
        {
          scale: 2.2,
          rotate: -25,
          opacity: 0,
          duration: 0.6,
          ease: "back.out(2.5)",
        },
        0.5
      )
      .add(fillStamp($("[data-stamp]", row)), 0.7)
  })

  $$("[data-gallery]").forEach((gallery) => {
    $$("[data-wipe]", gallery).forEach((fig, idx) => {
      const trigger = {
        trigger: fig,
        start: "top 92%",
        toggleActions: PLAY_ONCE,
      }
      gsap.fromTo(
        fig,
        { clipPath: shutterFrom(idx, 14) },
        {
          clipPath: "inset(0% 0% 0% 0% round 3px)",
          duration: 1.1,
          ease: "expo.out",
          scrollTrigger: trigger,
        }
      )
      const img = $("img", fig)
      if (img) {
        gsap.from(img, {
          scale: 1.12,
          duration: 1.35,
          ease: "expo.out",
          scrollTrigger: trigger,
        })
      }
    })
  })
}

// A score stamp's moon waxes up to its score
function fillStamp(stamp: HTMLElement | null) {
  const paths = stamp ? $$<SVGPathElement>("[data-moon]", stamp) : []
  const target = Number(stamp?.dataset.score ?? 0)
  const phase = { v: 0 }
  const draw = () =>
    paths.forEach((p) => p.setAttribute("d", moonPath(phase.v / 10)))
  draw()
  return gsap.to(phase, {
    v: target,
    duration: 1.1,
    ease: "power2.out",
    onUpdate: draw,
  })
}

// The lunar cycle in the footer, one moon after another
function phases() {
  $$("[data-phases]").forEach((strip) => {
    gsap.from($$(".phase", strip), {
      opacity: 0,
      scale: 0.3,
      rotate: -90,
      duration: 0.6,
      stagger: 0.08,
      ease: "back.out(2)",
      scrollTrigger: {
        trigger: strip,
        start: "top 95%",
        toggleActions: PLAY_ONCE,
      },
    })
  })
}

// The moon by the logo waxes as you read down the page
function progressMoon() {
  const paths = $$<SVGPathElement>("[data-progress-moon] [data-moon]")
  if (!paths.length) return
  const draw = (p: number) =>
    paths.forEach((path) => path.setAttribute("d", moonPath(p)))
  draw(0)
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => draw(self.progress),
  })
}

// Anything that simply rises into place, once
function reveals() {
  $$("[data-reveal]").forEach((el) => {
    gsap.from(el, {
      y: 36,
      opacity: 0,
      duration: 0.9,
      ease: "power3.out",
      scrollTrigger: {
        trigger: el,
        start: "top 90%",
        toggleActions: PLAY_ONCE,
      },
    })
  })
  $$("[data-parallax]").forEach((img) => {
    gsap.fromTo(
      img,
      { yPercent: -8, scale: 1.15 },
      {
        yPercent: 8,
        ease: "none",
        scrollTrigger: {
          trigger: img.parentElement,
          start: "top bottom",
          end: "bottom top",
          scrub: SCRUB,
        },
      }
    )
  })
}

// A panel that grows to fill the screen as it arrives
function closingPanel() {
  $$("[data-close]").forEach((panel) => {
    gsap.fromTo(
      panel,
      { scale: 0.86, borderRadius: 48 },
      {
        scale: 1,
        borderRadius: 18,
        ease: "none",
        scrollTrigger: {
          trigger: panel.parentElement,
          start: "top bottom",
          end: "top 20%",
          scrub: SCRUB,
        },
      }
    )
  })
}

// A review page opens with its name rising and its moon filling to the score
function reviewHead() {
  const head = $("[data-review-head]")
  if (!head) return
  const paths = $$<SVGPathElement>("[data-moon]", head)
  const roll = $("[data-roll-score]", head)
  const hasScore = head.dataset.score !== ""
  const target = Number(head.dataset.score ?? 0)
  const state = { v: 0 }
  // The photo and name arrive whole: the view transition from the card
  // already opens them, so a reveal here would fight it
  const tl = gsap.timeline({ defaults: { ease: "expo.out" } })
  tl.from("[data-review-meta] > *", {
    y: 20,
    opacity: 0,
    duration: 0.7,
    stagger: 0.08,
    ease: "power3.out",
  })
    .addLabel("moon", 0.3)
    .to(
      state,
      {
        v: hasScore ? target : 0,
        duration: 1.6,
        ease: "power2.inOut",
        onUpdate: () =>
          paths.forEach((p) => p.setAttribute("d", moonPath(state.v / 10))),
      },
      "moon"
    )
  // The digits roll with the moon instead of jumping from value to value
  if (roll) {
    tl.fromTo(
      roll,
      { "--n": 0 },
      {
        "--n": Number(roll.dataset.whole ?? 0),
        duration: 1.6,
        ease: "power2.inOut",
      },
      "moon"
    )
    const half = $("[data-roll-half]", roll)
    if (half)
      tl.fromTo(
        half,
        { opacity: 0, yPercent: 40 },
        { opacity: 1, yPercent: 0, duration: 0.5, ease: "power3.out" },
        "moon+=1.25"
      )
  }
}

// The cursor dot that grows into a label over anything with data-cursor
function cursor() {
  const el = $("[data-cursor-dot]")
  if (!el || !matchMedia("(hover: hover) and (pointer: fine)").matches) return
  const label = $("span", el)
  const xTo = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3" })
  const yTo = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3" })
  addEventListener(
    "pointermove",
    (e) => {
      el.style.opacity = "1"
      xTo(e.clientX)
      yTo(e.clientY)
    },
    { signal }
  )
  document.addEventListener(
    "pointerover",
    (e) => {
      const target = (e.target as Element).closest<HTMLElement>("[data-cursor]")
      el.classList.toggle("is-big", !!target)
      if (target && label) label.textContent = target.dataset.cursor ?? ""
    },
    { signal }
  )
}

// Show the end states the animations would have reached
function endStates() {
  $$("[data-moon-scrub]").forEach((s) =>
    $("[data-moon]", s)?.setAttribute("d", moonPath(1))
  )
  $$<SVGSVGElement>("[data-orbit]").forEach((svg) => orbitAt(svg)(1))
  progressMoon()
  const head = $("[data-review-head]")
  if (head)
    $("[data-moon]", head)?.setAttribute(
      "d",
      moonPath(Number(head.dataset.score || 0) / 10)
    )
}

// Everything runs inside gsap.matchMedia(): switching reduced motion while
// the page is open reverts every tween, ScrollTrigger and SplitText it made
export function initMotion() {
  gsap.matchMedia().add(
    {
      reduce: "(prefers-reduced-motion: reduce)",
      motion: "(prefers-reduced-motion: no-preference)",
    },
    (ctx) => {
      const root = document.documentElement
      if (ctx.conditions?.reduce) {
        // The hidden start states (main.astro) would leave things invisible
        root.classList.remove("motion")
        endStates()
        return
      }
      root.classList.add("motion")
      const listeners = new AbortController()
      signal = listeners.signal
      const { stop } = smoothScroll()
      progressMoon()
      intro()
      reviewHead()
      words()
      moonScrub()
      travellingType()
      charTitles()
      wipes()
      reveals()
      closingPanel()
      phases()
      cursor()
      // Fonts change line lengths: measure again once they are in
      document.fonts?.ready.then(() => ScrollTrigger.refresh())
      return () => {
        listeners.abort()
        stop()
      }
    }
  )
}
