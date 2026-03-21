<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { SimulationResult } from '$lib/solver/peec';

	let { result }: { result: SimulationResult | null } = $props();

	let container = $state<HTMLDivElement | null>(null);
	let Plotly: any = null;

	onMount(async () => {
		Plotly = (await import('plotly.js-dist-min')).default;
	});

	$effect(() => {
		const r = result;
		const el = container;
		if (!Plotly || !el || !r || r.freqs.length === 0) return;
		renderPlots(el, r);
	});

	function getSrf(r: SimulationResult): string {
		const srf = r.freqs.find((p, i) => i > 0 && p.L < 0);
		return srf ? (srf.freq / 1e9).toFixed(1) : '> ' + (r.freqs[r.freqs.length - 1].freq / 1e9).toFixed(0);
	}

	function renderPlots(el: HTMLDivElement, r: SimulationResult) {
		const f = r.freqs.map(p => p.freq);
		const L = r.freqs.map(p => p.L * 1e9);
		const Q = r.freqs.map(p => p.Q);
		const R = r.freqs.map(p => p.R);
		const S11_dB = r.freqs.map(p => {
			const re = p.S[0][0][0], im = p.S[0][0][1];
			return 10 * Math.log10(re * re + im * im);
		});

		const xType = r.logScale ? 'log' : 'linear';
		const base = {
			font: { family: 'JetBrains Mono, monospace', size: 10, color: '#7d7a85' },
			paper_bgcolor: 'rgba(0,0,0,0)',
			plot_bgcolor: '#18181d',
			margin: { t: 24, r: 12, b: 32, l: 48 },
			xaxis: { type: xType as any, gridcolor: '#2a2a32', linecolor: '#35353d', tickfont: { size: 9 } },
			height: 180,
			showlegend: false,
		};
		const cfg = { responsive: true, displayModeBar: false };
		const trace = (y: number[], color: string, name: string) => ({
			x: f, y, name, type: 'scatter' as const, mode: 'lines' as const, line: { color, width: 2 },
		});

		// Get or create plot divs
		const ids = ['plot-l', 'plot-q', 'plot-r', 'plot-s11'];
		for (const id of ids) {
			if (!el.querySelector(`#${id}`)) {
				const div = document.createElement('div');
				div.id = id;
				div.style.marginBottom = '4px';
				el.querySelector('.plots')!.appendChild(div);
			}
		}

		Plotly.react(el.querySelector('#plot-l')!, [trace(L, '#e8944a', 'L')], { ...base, yaxis: { title: 'L (nH)', gridcolor: '#2a2a32', tickfont: { size: 9 } } }, cfg);
		Plotly.react(el.querySelector('#plot-q')!, [trace(Q, '#d9513c', 'Q')], { ...base, yaxis: { title: 'Q', gridcolor: '#2a2a32', tickfont: { size: 9 } } }, cfg);
		Plotly.react(el.querySelector('#plot-r')!, [trace(R, '#6bbf8a', 'R')], { ...base, yaxis: { title: 'R (Ω)', gridcolor: '#2a2a32', tickfont: { size: 9 } } }, cfg);
		Plotly.react(el.querySelector('#plot-s11')!, [trace(S11_dB, '#7b5e8a', 'S11')], { ...base, yaxis: { title: '|S11| (dB)', gridcolor: '#2a2a32', tickfont: { size: 9 } } }, cfg);
	}
</script>

{#if result}
	<div class="results" bind:this={container}>
		<div class="summary">
			<div class="stat">
				<span class="stat-label">L</span>
				<span class="stat-value">{(result.freqs[Math.floor(result.freqs.length / 2)]?.L * 1e9).toFixed(2)}</span>
				<span class="stat-unit">nH</span>
			</div>
			<div class="stat">
				<span class="stat-label">Q<sub>max</sub></span>
				<span class="stat-value">{Math.max(...result.freqs.map(p => p.Q)).toFixed(1)}</span>
			</div>
			<div class="stat">
				<span class="stat-label">SRF</span>
				<span class="stat-value">{getSrf(result)}</span>
				<span class="stat-unit">GHz</span>
			</div>
			<div class="stat">
				<span class="stat-label">Fils</span>
				<span class="stat-value">{result.filaments.length}</span>
			</div>
		</div>
		<div class="plots"></div>
	</div>
{:else}
	<div class="no-result">Run simulation to see results</div>
{/if}

<style>
	.results {
		height: 100%;
		overflow-y: auto;
		background: var(--bg-surface);
	}
	.summary {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border);
	}
	.stat {
		flex: 1;
		padding: 8px 10px;
		display: flex;
		align-items: baseline;
		gap: 4px;
		border-right: 1px solid var(--border-subtle);
	}
	.stat:last-child { border-right: none; }
	.stat-label {
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.stat-value {
		font-size: 14px;
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent-secondary);
	}
	.stat-unit {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.plots {
		padding: 8px;
	}
	.no-result {
		padding: 24px;
		text-align: center;
		color: var(--text-dim);
		font-size: 12px;
		font-family: var(--font-mono);
	}
</style>
