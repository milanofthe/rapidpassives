<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children, onexport }: { children: Snippet; onexport?: () => void } = $props();
</script>

<div class="panel">
	{@render children()}
	<div class="actions">
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
		gap: 2px;
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
</style>
