<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children, onexport, onsimulate }: { children: Snippet; onexport?: () => void; onsimulate?: () => void } = $props();
</script>

<div class="panel">
	{@render children()}
	<div class="actions">
		{#if onsimulate}
			<button class="btn-sim" onclick={onsimulate}>Simulate</button>
		{/if}
		{#if onexport}
			<button onclick={onexport}>Export GDS</button>
		{/if}
	</div>
</div>

<style>
	.panel {
		height: 100%;
		overflow-y: auto;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		background: var(--bg);
	}
	.actions {
		display: flex;
		gap: 2px;
		margin-top: auto;
		padding-top: 8px;
	}
	.actions button {
		flex: 1;
	}
	.btn-sim {
		background: var(--accent-secondary);
		color: #000;
	}
	.btn-sim:hover {
		background: #f0a050;
	}
</style>
