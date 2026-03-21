/** Nudge a numeric field, clamping and rounding */
export function nudgeValue(current: number, step: number, min?: number, max?: number): number {
	let v = current + step;
	if (min !== undefined) v = Math.max(min, v);
	if (max !== undefined) v = Math.min(max, v);
	return Math.round(v * 1000) / 1000;
}

/** Parse a number from an input event */
export function parseInput(e: Event): number | null {
	const v = parseFloat((e.target as HTMLInputElement).value);
	return isNaN(v) ? null : v;
}
