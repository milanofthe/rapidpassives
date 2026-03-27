/**
 * <gds-viewer> — Embeddable GDS-II 3D viewer web component.
 *
 * Usage:
 *   <script src="https://rapidpassives.org/embed/gds-viewer.js"></script>
 *   <gds-viewer src="layout.gds" rotate explode interactive></gds-viewer>
 *
 * Attributes:
 *   src         — URL to a .gds file
 *   width       — CSS width (default: 100%)
 *   height      — CSS height (default: 400px)
 *   rotate      — enable continuous camera rotation
 *   explode     — enable layer explode/assemble animation
 *   interactive — enable mouse/touch orbit, pan, zoom
 *   transparent — transparent background (no dark fill)
 *   speed       — animation speed multiplier (default: 1)
 *   theta       — initial camera theta in degrees (default: 45)
 *   phi         — initial camera phi in degrees (default: 45)
 *   config      — JSON string or URL for layer config:
 *                  { "layers": { "1": { "color": "#6bbf8a", "z": 0, "thickness": 0.5 }, ... } }
 *                  Or shorthand colors-only: { "colors": ["#6bbf8a", "#d9513c", ...] }
 *                  Or per-layer with names: { "layers": { "1": { "color": "#f00", "name": "M1" }, ... } }
 */

import { initGL, buildInstancedMeshes, render3D, fitCamera, disposeGL, createCamera, type Camera, type InstancedSceneData, type GdsLayerInfo } from '../lib/render/canvas3d';
import { readGds, buildInstancedScene, sceneToInstancedData } from '../lib/gds/reader';
import type { ProcessStack } from '../lib/stack/types';
import { PDKS } from '../lib/stack/pdk';

// Same palette as pdk.ts — bottom to top: purple, green, blue, green, blue, red, orange
const DEFAULT_COLORS = ['#7b5e8a', '#6bbf8a', '#4a9ec2', '#5aad78', '#4a9ec2', '#5aad78', '#d9513c', '#e8944a'];

function createEmbedStack(): ProcessStack {
	return {
		name: 'Embed',
		layers: [{ id: 'sub', name: 'Substrate', type: 'substrate', z: 0, thickness: 300, color: '#4a4a5a', gdsLayers: [], visible: true }],
		substrateThickness: 300, oxideEr: 4.0, substrateRho: 10, substrateEr: 11.7,
	};
}

function assignLayerInfo(
	scene: InstancedSceneData,
	config?: any,
	presetId?: string,
): Map<number, GdsLayerInfo> {
	const info = new Map<number, GdsLayerInfo>();
	const layerNums = new Set<number>();
	for (const meshes of Object.values(scene.cellMeshes)) {
		for (const key of Object.keys(meshes)) layerNums.add(parseInt(key));
	}
	const sorted = [...layerNums].sort((a, b) => a - b);

	// If a PDK preset is specified, use its layer data as defaults
	const pdkLayers = presetId ? PDKS[presetId]?.layers : undefined;
	const pdkByGds = pdkLayers ? new Map(pdkLayers.map(l => [l.gds, l])) : undefined;

	// Parse config formats
	const layerConfig = config?.layers as Record<string, { color?: string; z?: number; thickness?: number }> | undefined;
	const colorList = config?.colors as string[] | undefined;

	let z = 0.5;
	const thickness = 0.5;
	sorted.forEach((num, i) => {
		const cfg = layerConfig?.[String(num)];
		const pdkL = pdkByGds?.get(num);
		const color = cfg?.color ?? pdkL?.color ?? colorList?.[i] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];
		const th = cfg?.thickness ?? pdkL?.thickness ?? thickness;
		info.set(num, {
			z: cfg?.z ?? pdkL?.z ?? z,
			thickness: th,
			color,
		});
		z += th;
	});
	return info;
}

function computeXYExtent(meshes: { bbox?: [number, number, number, number] }[]): number {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const m of meshes) {
		if (!m.bbox) continue;
		if (m.bbox[0] < minX) minX = m.bbox[0];
		if (m.bbox[2] > maxX) maxX = m.bbox[2];
		if (m.bbox[1] < minY) minY = m.bbox[1];
		if (m.bbox[3] > maxY) maxY = m.bbox[3];
	}
	return Math.max(isFinite(maxX) ? maxX - minX : 1, isFinite(maxY) ? maxY - minY : 1);
}

class GdsViewerElement extends HTMLElement {
	private canvas: HTMLCanvasElement | null = null;
	private wrapper: HTMLDivElement | null = null;
	private loadingEl: HTMLDivElement | null = null;
	private glState: ReturnType<typeof initGL> = null;
	private camera: Camera = createCamera();
	private animId = 0;
	private mounted = false;
	private scene: InstancedSceneData | null = null;
	private gdsLayerInfo: Map<number, GdsLayerInfo> = new Map();
	private layerNums: number[] = [];
	private xyExtent: number = 1;
	private isDragging = false;
	private isRightDrag = false;
	private lastMouse = { x: 0, y: 0 };
	private needsRender = false;

	static get observedAttributes() {
		return ['src', 'width', 'height', 'rotate', 'explode', 'interactive', 'transparent', 'speed', 'theta', 'phi', 'config', 'preset'];
	}

	connectedCallback() {
		this.mounted = true;
		const shadow = this.attachShadow({ mode: 'open' });

		const isTransparent = this.hasAttribute('transparent');
		this.wrapper = document.createElement('div');
		this.wrapper.style.cssText = `position:relative;width:${this.getAttribute('width') || '100%'};height:${this.getAttribute('height') || '400px'};background:${isTransparent ? 'transparent' : '#131316'};overflow:hidden;border-radius:inherit;`;

		this.canvas = document.createElement('canvas');
		this.canvas.style.cssText = `display:block;width:100%;height:100%;cursor:${this.hasAttribute('interactive') ? 'grab' : 'default'};`;
		this.wrapper.appendChild(this.canvas);

		// Loading indicator
		this.loadingEl = document.createElement('div');
		this.loadingEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 11px/1 monospace;color:#55535a;';
		this.loadingEl.textContent = '';
		this.wrapper.appendChild(this.loadingEl);

		// Badge
		const badge = document.createElement('a');
		badge.href = 'https://rapidpassives.org';
		badge.target = '_blank';
		badge.rel = 'noopener';
		badge.textContent = 'RapidPassives';
		badge.style.cssText = 'position:absolute;bottom:6px;right:8px;font:500 9px/1 monospace;color:#55535a;text-decoration:none;opacity:0.7;transition:opacity 0.15s;';
		badge.onmouseenter = () => badge.style.opacity = '1';
		badge.onmouseleave = () => badge.style.opacity = '0.7';
		this.wrapper.appendChild(badge);

		shadow.appendChild(this.wrapper);

		this.glState = initGL(this.canvas);
		if (!this.glState) return;

		// Interaction handlers
		if (this.hasAttribute('interactive')) {
			this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
			this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
			this.canvas.addEventListener('pointerup', () => this.onPointerUp());
			this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
			this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
			this.canvas.addEventListener('dblclick', () => this.fitView());
		}

		const ro = new ResizeObserver(() => { this.needsRender = true; });
		ro.observe(this.wrapper);

		const src = this.getAttribute('src');
		if (src) this.loadGds(src);
	}

	disconnectedCallback() {
		this.mounted = false;
		this.animId++;
		if (this.glState) disposeGL(this.glState);
	}

	attributeChangedCallback(name: string, _old: string | null, val: string | null) {
		if (name === 'src' && val && this.mounted) this.loadGds(val);
	}

	// --- Interaction ---

	private onPointerDown(e: PointerEvent) {
		this.isDragging = true;
		this.isRightDrag = e.button === 2;
		this.lastMouse = { x: e.clientX, y: e.clientY };
		this.canvas?.setPointerCapture(e.pointerId);
		if (this.canvas) this.canvas.style.cursor = 'grabbing';
	}

	private onPointerMove(e: PointerEvent) {
		if (!this.isDragging) return;
		const dx = e.clientX - this.lastMouse.x;
		const dy = e.clientY - this.lastMouse.y;
		this.lastMouse = { x: e.clientX, y: e.clientY };

		if (this.isRightDrag) {
			// Pan
			const panScale = this.camera.distance * 0.0007;
			const ct = Math.cos(this.camera.theta), st = Math.sin(this.camera.theta);
			this.camera = {
				...this.camera,
				target: [
					this.camera.target[0] + (dx * ct - dy * st * Math.sin(this.camera.phi)) * panScale,
					this.camera.target[1] - (dx * st + dy * ct * Math.sin(this.camera.phi)) * panScale,
					this.camera.target[2] + dy * Math.cos(this.camera.phi) * panScale,
				],
			};
		} else {
			// Orbit
			this.camera = {
				...this.camera,
				theta: this.camera.theta + dx * 0.005,
				phi: Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.camera.phi + dy * 0.005)),
			};
		}
		this.needsRender = true;
	}

	private onPointerUp() {
		this.isDragging = false;
		this.isRightDrag = false;
		if (this.canvas) this.canvas.style.cursor = 'grab';
	}

	private onWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
		this.camera = { ...this.camera, distance: this.camera.distance * factor };
		this.needsRender = true;
	}

	private fitView() {
		if (!this.glState) return;
		this.camera = fitCamera({}, createEmbedStack(), this.scene, this.glState);
		const theta = parseFloat(this.getAttribute('theta') || '45') * Math.PI / 180;
		const phi = parseFloat(this.getAttribute('phi') || '45') * Math.PI / 180;
		this.camera = { ...this.camera, theta, phi };
		this.needsRender = true;
	}

	// --- Loading ---

	private async loadGds(url: string) {
		if (this.loadingEl) {
			this.loadingEl.textContent = 'Loading...';
			this.loadingEl.style.display = 'flex';
		}

		try {
			const resp = await fetch(url);
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const buf = await resp.arrayBuffer();

			if (this.loadingEl) this.loadingEl.textContent = 'Parsing...';

			const gds = readGds(new Uint8Array(buf));
			if (this.loadingEl) this.loadingEl.textContent = 'Building...';
			const rawScene = buildInstancedScene(gds);
			if (this.loadingEl) this.loadingEl.textContent = 'Triangulating...';
			const result = sceneToInstancedData(rawScene);
			this.scene = { cellMeshes: result.cellMeshes, cellEdges: result.cellEdges, cellInstances: result.cellInstances };

			// Parse config
			let config: any;
			const cfgAttr = this.getAttribute('config');
			if (cfgAttr) {
				try {
					config = cfgAttr.startsWith('{') ? JSON.parse(cfgAttr) : await (await fetch(cfgAttr)).json();
				} catch { /* ignore */ }
			}

			this.gdsLayerInfo = assignLayerInfo(this.scene, config, this.getAttribute('preset') ?? undefined);
			this.layerNums = [...this.gdsLayerInfo.keys()].sort((a, b) => a - b);

			const stack = createEmbedStack();
			if (this.glState) {
				buildInstancedMeshes(this.glState, this.scene, stack, undefined, undefined, this.gdsLayerInfo);
				// Compute XY extent from mesh bboxes for proportional explode animation
				this.xyExtent = computeXYExtent(this.glState.instancedMeshes);
			}

			this.fitView();

			if (this.loadingEl) this.loadingEl.style.display = 'none';

			this.startAnimation();
		} catch (e) {
			console.error('[gds-viewer] Failed to load GDS:', e);
			if (this.loadingEl) {
				this.loadingEl.textContent = `Error: ${(e as Error).message}`;
			}
		}
	}

	// --- Rendering ---

	private syncCanvas(): { w: number; h: number } {
		if (!this.canvas) return { w: 0, h: 0 };
		const rect = this.canvas.getBoundingClientRect();
		const w = Math.round(rect.width);
		const h = Math.round(rect.height);
		if (w <= 0 || h <= 0) return { w, h };
		const dpr = window.devicePixelRatio || 1;
		const bw = Math.round(w * dpr);
		const bh = Math.round(h * dpr);
		if (this.canvas.width !== bw || this.canvas.height !== bh) {
			this.canvas.width = bw;
			this.canvas.height = bh;
		}
		return { w, h };
	}

	private renderFrame(time: number = 0) {
		if (!this.glState || !this.canvas || !this.mounted) return;
		const { w, h } = this.syncCanvas();
		if (w <= 0 || h <= 0) return;

		const doRotate = this.hasAttribute('rotate');
		const doExplode = this.hasAttribute('explode');
		const isTransparent = this.hasAttribute('transparent');
		const speed = parseFloat(this.getAttribute('speed') || '1');

		if (doRotate && !this.isDragging) {
			this.camera = { ...this.camera, theta: this.camera.theta + 0.003 * speed };
		}

		let layerZOffsets: Map<number, number> | null = null;
		if (doExplode && this.layerNums.length > 1) {
			layerZOffsets = new Map();
			const t = time * 0.001 * speed;
			const n = this.layerNums.length;
			const gap = this.xyExtent / n * 2; // equal gap between layers
			// Total cycle: assemble one layer at a time, hold, disassemble one at a time, hold
			const layerDur = 0.3; // seconds per layer transition
			const holdDur = 2.0; // seconds to hold fully spread / fully assembled
			const halfCycle = n * layerDur + holdDur;
			const fullCycle = 2 * halfCycle;
			const ct = t % fullCycle;

			for (let i = 0; i < n; i++) {
				// Each layer lifts off sequentially from bottom (i=0) to top
				// layerT: 0 = assembled, 1 = fully exploded
				let layerT: number;
				if (ct < halfCycle) {
					// Spreading phase: layers peel off one at a time from top
					const startTime = (n - 1 - i) * layerDur;
					if (ct < startTime) layerT = 0;
					else if (ct < startTime + layerDur) {
						const p = (ct - startTime) / layerDur;
						layerT = p * p * (3 - 2 * p); // smoothstep
					} else layerT = 1;
				} else {
					// Assembling phase: layers come back one at a time from bottom
					const ct2 = ct - halfCycle;
					const startTime = i * layerDur;
					if (ct2 < startTime) layerT = 1;
					else if (ct2 < startTime + layerDur) {
						const p = (ct2 - startTime) / layerDur;
						layerT = 1 - p * p * (3 - 2 * p); // reverse smoothstep
					} else layerT = 0;
				}
				layerZOffsets.set(this.layerNums[i], i * gap * layerT);
			}
		}

		render3D(this.glState, this.camera, w, h, 0, isTransparent, null, 1.0, layerZOffsets);
		this.needsRender = false;
	}

	private startAnimation() {
		const id = ++this.animId;
		const doRotate = this.hasAttribute('rotate');
		const doExplode = this.hasAttribute('explode');
		const isAnimated = doRotate || doExplode;

		if (!isAnimated && !this.hasAttribute('interactive')) {
			this.renderFrame(0);
			return;
		}

		const tick = (time: number) => {
			if (!this.mounted || id !== this.animId) return;
			if (isAnimated || this.needsRender) {
				this.renderFrame(time);
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}
}

if (!customElements.get('gds-viewer')) {
	customElements.define('gds-viewer', GdsViewerElement);
}
