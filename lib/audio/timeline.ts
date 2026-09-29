/** Maps seconds in a file made of `kept` [start,end) second ranges back to the source timeline. */
export function timelineMapper(kept: Array<[number, number]>): (t: number) => number {
  return (t) => {
    let acc = 0
    for (const [s, e] of kept) {
      if (e <= s) continue
      if (t <= acc + (e - s)) return s + (t - acc)
      acc += e - s
    }
    return kept.at(-1)?.[1] ?? t
  }
}

/** Complement of sorted, merged [start,end) ranges within [0, total). */
export function invert(ranges: Array<[number, number]>, total: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let cursor = 0
  for (const [s, e] of ranges) {
    if (s > cursor) out.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < total) out.push([cursor, total])
  return out.filter(([s, e]) => e - s > 0.05)
}
