<script lang="ts">
	import type { ProcessStack } from '$lib/stack/types';
	import StackView from './StackView.svelte';
	import PdkSelect from './PdkSelect.svelte';

	let { stack = $bindable(), pdkId = $bindable() }: {
		stack: ProcessStack;
		pdkId: string;
	} = $props();
</script>

<div class="stack-wrapper">
	<StackView bind:stack>
		{#snippet header()}
			<div class="param-section"><h4>Process</h4>
				<PdkSelect bind:value={pdkId} />
			</div>
		{/snippet}
	</StackView>
</div>

<style>
	.stack-wrapper {
		padding: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}
</style>
