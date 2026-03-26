<script lang="ts">
	import '$lib/components/fields.css';

	let {
		label,
		value,
		unit = '',
		step = 1,
		min,
		max,
		placeholder,
		onchange,
		type = 'number',
	}: {
		label: string;
		value: number | string;
		unit?: string;
		step?: number;
		min?: number;
		max?: number;
		placeholder?: string;
		onchange: (v: number | undefined) => void;
		type?: 'number' | 'toggle';
	} = $props();

	function nudge(dir: number) {
		const cur = typeof value === 'number' ? value : 0;
		let next = cur + dir * step;
		if (min !== undefined) next = Math.max(min, next);
		if (max !== undefined) next = Math.min(max, next);
		// Round to avoid floating point drift
		const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
		const factor = Math.pow(10, decimals);
		onchange(Math.round(next * factor) / factor);
	}

	function onInput(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		if (raw === '' && placeholder) { onchange(undefined); return; }
		const v = parseFloat(raw);
		if (!isNaN(v)) onchange(v);
	}
</script>

{#if type === 'toggle'}
	<div class="f">
		<span>{label}</span>
		<div class="fi">
			<button class="toggle-btn" class:active={!!value} onclick={() => onchange(value ? 0 : 1)}>
				{value ? 'ON' : 'OFF'}
			</button>
			<em></em>
		</div>
	</div>
{:else}
	<div class="f">
		<span>{label}</span>
		<div class="fi">
			<button onclick={() => nudge(-1)}>-</button>
			<input type="number" {value} {placeholder} oninput={onInput}/>
			<button onclick={() => nudge(1)}>+</button>
			<em>{unit}</em>
		</div>
	</div>
{/if}
