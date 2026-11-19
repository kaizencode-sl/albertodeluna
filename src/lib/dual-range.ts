/**
 * Wires up a from–to slider (dual-range.astro): a handle can't pass the
 * other, the track between them fills, `paint` hears every move (to label the
 * pick, or to filter live) and `change` fires when a handle is let go.
 */
export function dualRange(
  el: HTMLElement,
  paint: (lo: number, hi: number) => void,
  change?: () => void
) {
  const lo = el.querySelector<HTMLInputElement>("[data-lo]")!
  const hi = el.querySelector<HTMLInputElement>("[data-hi]")!
  const span = Number(lo.max) - Number(lo.min)
  const at = (i: HTMLInputElement) => (Number(i.value) - Number(lo.min)) / span
  const draw = () => {
    el.style.setProperty("--from", String(at(lo)))
    el.style.setProperty("--to", String(at(hi)))
    // Both at the top end: the "from" handle has to be the one on top, or it
    // couldn't be dragged back
    lo.style.zIndex = lo.value === lo.max ? "2" : ""
    paint(Number(lo.value), Number(hi.value))
  }
  lo.addEventListener("input", () => {
    if (Number(lo.value) > Number(hi.value)) lo.value = hi.value
    draw()
  })
  hi.addEventListener("input", () => {
    if (Number(hi.value) < Number(lo.value)) hi.value = lo.value
    draw()
  })
  if (change) {
    lo.addEventListener("change", change)
    hi.addEventListener("change", change)
  }
  draw()
  return {
    lo: () => Number(lo.value),
    hi: () => Number(hi.value),
    /** The whole track is picked: the filter is off */
    full: () => lo.value === lo.min && hi.value === hi.max,
    reset() {
      lo.value = lo.min
      hi.value = hi.max
      draw()
    },
    inputs: [lo, hi] as const,
  }
}

export type DualRange = ReturnType<typeof dualRange>
