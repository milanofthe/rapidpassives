<script lang="ts">
	import { onMount } from 'svelte';

	// Dynamically load the embed script so it registers the custom element
	onMount(() => {
		const script = document.createElement('script');
		script.src = '/embed/gds-viewer.js';
		document.head.appendChild(script);
	});

	// Use a known public GDS file for testing
	const testUrl = 'https://raw.githubusercontent.com/google/skywater-pdk-libs-sky130_fd_sc_hd/main/cells/inv/sky130_fd_sc_hd__inv_1.gds';
</script>

<svelte:head>
	<title>Embed Test — RapidPassives</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<h1>Embed Test</h1>
	<p class="desc">Testing <code>&lt;gds-viewer&gt;</code> web component with different configurations.</p>

	<div class="grid">
		<div class="card">
			<h3>Default (static)</h3>
			<code>&lt;gds-viewer src="..."&gt;</code>
			<gds-viewer src={testUrl} width="100%" height="280px"></gds-viewer>
		</div>

		<div class="card">
			<h3>Interactive</h3>
			<code>&lt;gds-viewer src="..." interactive&gt;</code>
			<gds-viewer src={testUrl} width="100%" height="280px" interactive></gds-viewer>
		</div>

		<div class="card">
			<h3>Rotate</h3>
			<code>&lt;gds-viewer src="..." rotate&gt;</code>
			<gds-viewer src={testUrl} width="100%" height="280px" rotate></gds-viewer>
		</div>

		<div class="card">
			<h3>Rotate + Explode</h3>
			<code>&lt;gds-viewer src="..." rotate explode&gt;</code>
			<gds-viewer src={testUrl} width="100%" height="280px" rotate explode></gds-viewer>
		</div>

		<div class="card">
			<h3>Interactive + Rotate</h3>
			<code>&lt;gds-viewer src="..." interactive rotate&gt;</code>
			<gds-viewer src={testUrl} width="100%" height="280px" interactive rotate></gds-viewer>
		</div>

		<div class="card">
			<h3>Transparent BG</h3>
			<code>&lt;gds-viewer src="..." interactive transparent&gt;</code>
			<div class="checkerboard">
				<gds-viewer src={testUrl} width="100%" height="280px" interactive transparent></gds-viewer>
			</div>
		</div>

		<div class="card">
			<h3>Slow Rotate + Explode</h3>
			<code>&lt;gds-viewer src="..." rotate explode speed="0.3"&gt;</code>
			<gds-viewer src={testUrl} width="100%" height="280px" rotate explode speed="0.3"></gds-viewer>
		</div>

		<div class="card">
			<h3>Custom Angle</h3>
			<code>&lt;gds-viewer src="..." theta="0" phi="90"&gt;</code>
			<gds-viewer src={testUrl} width="100%" height="280px" interactive theta="0" phi="85"></gds-viewer>
		</div>
	</div>
</div>

<style>
	.page {
		height: 100%;
		overflow-y: auto;
		padding: 40px;
		font-family: var(--font-mono);
	}
	h1 {
		font-size: var(--fs-lg);
		color: var(--accent);
		margin-bottom: 8px;
	}
	.desc {
		font-size: var(--fs-sm);
		color: var(--text-dim);
		margin-bottom: 32px;
	}
	.desc code {
		color: var(--text-muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
		gap: 20px;
	}
	.card {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.card h3 {
		font-size: var(--fs-sm);
		color: var(--accent);
		font-weight: 600;
	}
	.card code {
		font-size: 9px;
		color: var(--text-dim);
		word-break: break-all;
	}
	.checkerboard {
		background-image: linear-gradient(45deg, #222 25%, transparent 25%),
			linear-gradient(-45deg, #222 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #222 75%),
			linear-gradient(-45deg, transparent 75%, #222 75%);
		background-size: 16px 16px;
		background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
		background-color: #1a1a1a;
	}
</style>
