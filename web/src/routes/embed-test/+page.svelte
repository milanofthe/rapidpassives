<script lang="ts">
	import { onMount } from 'svelte';
	import CodeSnippet from '$lib/components/CodeSnippet.svelte';

	onMount(() => {
		const script = document.createElement('script');
		script.src = '/embed/gds-viewer.js';
		document.head.appendChild(script);
	});

	const testUrl = 'https://raw.githubusercontent.com/google/skywater-pdk-libs-sky130_fd_sc_hd/main/cells/inv/sky130_fd_sc_hd__inv_1.gds';

	const examples = [
		{
			title: 'Default',
			attrs: '',
			desc: 'Static 3D view, no interaction',
		},
		{
			title: 'Interactive',
			attrs: 'interactive',
			desc: 'Orbit, pan, zoom with mouse. Double-click to fit.',
		},
		{
			title: 'Rotate',
			attrs: 'rotate',
			desc: 'Continuous camera orbit',
		},
		{
			title: 'Rotate + Explode',
			attrs: 'rotate explode',
			desc: 'Layer breathing animation with orbit',
		},
		{
			title: 'Interactive + Rotate',
			attrs: 'interactive rotate',
			desc: 'Auto-orbit pauses while dragging',
		},
		{
			title: 'Transparent',
			attrs: 'interactive transparent',
			desc: 'No background, blends with page',
			transparent: true,
		},
		{
			title: 'Slow Animation',
			attrs: 'rotate explode speed="0.3"',
			desc: 'Gentle animation speed',
		},
		{
			title: 'Top-Down View',
			attrs: 'interactive theta="0" phi="85"',
			desc: 'Custom initial camera angle',
		},
	];

	function buildSnippet(attrs: string): string {
		return `<script src="https://rapidpassives.org/embed/gds-viewer.js"><\/script>\n<gds-viewer\n  src="${testUrl}"${attrs ? '\n  ' + attrs.split(' ').join('\n  ') : ''}\n  width="100%" height="300px"\n><\/gds-viewer>`;
	}
</script>

<svelte:head>
	<title>Embed Test — RapidPassives</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<div class="header">
		<h1>Embeddable GDS Viewer</h1>
		<p>Showcase RFIC layouts on any website with a single script tag.</p>
	</div>

	{#each examples as ex}
		<div class="example">
			<div class="example-info">
				<h3>{ex.title}</h3>
				<p>{ex.desc}</p>
				<CodeSnippet code={buildSnippet(ex.attrs)} />
			</div>
			<div class="example-preview" class:checkerboard={ex.transparent}>
				{@html `<gds-viewer src="${testUrl}" ${ex.attrs} width="100%" height="300px"></gds-viewer>`}
			</div>
		</div>
	{/each}
</div>

<style>
	.page {
		height: 100%;
		overflow-y: auto;
		padding: 40px 40px 80px;
		display: flex;
		flex-direction: column;
		gap: 40px;
		max-width: 1100px;
		margin: 0 auto;
	}
	.header h1 {
		font-size: var(--fs-lg);
		font-family: var(--font-mono);
		color: var(--accent);
		margin-bottom: 6px;
	}
	.header p {
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.example {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		border: 1px solid var(--border-subtle);
		background: var(--bg-surface);
		padding: 16px;
	}
	.example-info {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.example-info h3 {
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
		color: var(--accent);
		font-weight: 600;
	}
	.example-info p {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.example-preview {
		min-height: 300px;
		overflow: hidden;
	}
	.checkerboard {
		background-image: linear-gradient(45deg, #222 25%, transparent 25%),
			linear-gradient(-45deg, #222 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #222 75%),
			linear-gradient(-45deg, transparent 75%, #222 75%);
		background-size: 16px 16px;
		background-position: 0 0, 0 8px, 8px -8px, -8px 0;
		background-color: #1a1a1a;
	}

	@media (max-width: 800px) {
		.example {
			grid-template-columns: 1fr;
		}
	}
</style>
