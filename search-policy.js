export const SEARCH_IDLE_MS = 15_000;

// Compare verified layouts, never previews. A tenth of a millimeter avoids
// resetting the clock for numerical noise in the last sheet's used height.
export function createImprovementTracker(mode) {
  let best = null, improvedAt = 0;
  const keys = mode === 'fill_area' ? ['placed_area', 'placed_priority', 'placed_parts'] : ['placed_parts', 'placed_priority', 'placed_area'];
  function improves(next, previous) {
    for (const key of keys) {
      const delta = (next[key] ?? 0) - (previous[key] ?? 0);
      if (Math.abs(delta) > 1e-6) return delta > 0;
    }
    if (next.sheets_used !== previous.sheets_used) return next.sheets_used < previous.sheets_used;
    return previous.last_sheet_used_height - next.last_sheet_used_height >= 0.1;
  }
  return {
    get best() { return best; },
    stalled(now) { return best !== null && now - improvedAt >= SEARCH_IDLE_MS; },
    consider(candidate, now) {
      const { valid, metrics } = candidate.validation ?? {};
      if (!valid || !metrics?.placed_parts || (best && !improves(metrics, best.validation.metrics))) return false;
      best = candidate;
      improvedAt = now;
      return true;
    },
  };
}

// Freeze the cutoff after queued validation drains. Check one latest preview
// without following an unbounded stream of new previews.
export async function confirmStagnation(tracker, { queued, latest, active, now, validate }) {
  await queued;
  if (!active() || !tracker.stalled(now())) return false;
  const candidate = latest();
  if (candidate && candidate.validation === undefined) await validate(candidate);
  return active() && tracker.stalled(now());
}
