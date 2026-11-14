// Keeps v between lo and hi.
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
