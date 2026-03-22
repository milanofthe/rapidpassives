/**
 * Test the minimal RWG MoM solver.
 * Creates a simple 2-triangle strip and solves at 1 GHz.
 */
const fs = require('fs');
const path = require('path');

const wasmDir = path.join(__dirname, '../../web/static/wasm');
const wasmBinary = fs.readFileSync(path.join(wasmDir, 'mom.wasm'));
const code = fs.readFileSync(path.join(wasmDir, 'mom.js'), 'utf8');

globalThis.window = globalThis;
globalThis.document = { currentScript: { src: '' } };

const fn = new Function('require', '__dirname', '__filename', code + '\nreturn MoMModule;');
const MoMModule = fn(require, wasmDir, path.join(wasmDir, 'mom.js'));

async function main() {
  console.log('Loading MoM WASM...');
  const M = await MoMModule({
    print: t => console.log('[mom]', t),
    printErr: t => console.error('[err]', t),
    wasmBinary,
  });

  const init = M.cwrap('mom_init', 'number', []);
  const setMesh = M.cwrap('mom_set_mesh', 'number', ['number', 'number', 'number', 'number']);
  const findEdge = M.cwrap('mom_find_edge', 'number', ['number', 'number']);
  const addPort = M.cwrap('mom_add_port', 'number', ['number', 'number']);
  const solve = M.cwrap('mom_solve', 'number', ['number', 'number']);
  const cleanup = M.cwrap('mom_cleanup', null, []);

  console.log('\n--- Init ---');
  init();

  // Create a 10x2 structured mesh for a 100um x 10um strip at z=3um
  const um = 1e-6;
  const nx = 10, ny = 2;
  const L = 100*um, W = 10*um, z = 3*um;
  const dx = L/nx, dy = W/ny;

  // Generate nodes
  const nodes = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++)
      nodes.push(i*dx, -W/2 + j*dy, z);
  const nnodes = (nx+1)*(ny+1);

  // Generate triangles (2 per quad)
  const tris = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v00 = j*(nx+1) + i;
      const v10 = v00 + 1;
      const v01 = v00 + (nx+1);
      const v11 = v01 + 1;
      tris.push(v00, v10, v11); // lower-right triangle
      tris.push(v00, v11, v01); // upper-left triangle
    }
  }
  const ntris = nx * ny * 2;

  console.log(`Mesh: ${nnodes} nodes, ${ntris} triangles`);

  // Allocate and copy to WASM heap
  const nodePtr = M._malloc(nodes.length * 8);
  const triPtr = M._malloc(tris.length * 4);
  const nodeArr = new Float64Array(M.HEAPF64.buffer, nodePtr, nodes.length);
  const triArr = new Int32Array(M.HEAP32.buffer, triPtr, tris.length);
  nodeArr.set(nodes);
  triArr.set(tris);

  console.log('\n--- Set Mesh ---');
  const ndof = setMesh(nodePtr, nnodes, triPtr, ntris);
  M._free(nodePtr);
  M._free(triPtr);
  console.log('DOFs (internal edges):', ndof);

  // Two ports: one at each end of the strip (x=dx and x=L-dx)
  // Port 1 at x=dx (first internal column)
  const port1Edges = [];
  for (let j = 0; j < ny; j++) {
    const ei = findEdge(j*(nx+1)+1, (j+1)*(nx+1)+1);
    if (ei >= 0) port1Edges.push(ei);
  }
  // Port 2 at x=L-dx (last internal column)
  const port2Edges = [];
  for (let j = 0; j < ny; j++) {
    const ei = findEdge(j*(nx+1)+(nx-1), (j+1)*(nx+1)+(nx-1));
    if (ei >= 0) port2Edges.push(ei);
  }
  console.log(`Port 1 edges (x=${dx*1e6}um):`, port1Edges);
  console.log(`Port 2 edges (x=${(L-dx)*1e6}um):`, port2Edges);
  // Use 2-port: both ends
  const portEdges = null; // handled separately below
  console.log('Port edges found:', portEdges);

  // Add port 1 (near x=0)
  if (port1Edges.length > 0) {
    const pePtr = M._malloc(port1Edges.length * 4);
    new Int32Array(M.HEAP32.buffer, pePtr, port1Edges.length).set(port1Edges);
    addPort(pePtr, port1Edges.length);
    M._free(pePtr);
    console.log('Port 1 added');
  }
  // Add port 2 (near x=L)
  if (port2Edges.length > 0) {
    const pePtr = M._malloc(port2Edges.length * 4);
    new Int32Array(M.HEAP32.buffer, pePtr, port2Edges.length).set(port2Edges);
    addPort(pePtr, port2Edges.length);
    M._free(pePtr);
    console.log('Port 2 added');
  }

  // Solve at 1 GHz
  console.log('\n--- Solve at 1 GHz ---');
  const t0 = Date.now();
  const nport = solve(1e9, 50.0);
  const dt = Date.now() - t0;
  console.log(`Solve returned: ${nport} ports (${dt}ms)`);

  // Read and parse result
  try {
    const result = M.FS.readFile('/result.txt', { encoding: 'utf8' });
    console.log('\n=== Raw Result ===');
    console.log(result);

    // Parse Z matrix
    const lines = result.split('\n');
    const zLines = [];
    let inZ = false;
    for (const line of lines) {
      if (line.startsWith('Z')) { inZ = true; continue; }
      if (line.startsWith('S')) { inZ = false; continue; }
      if (inZ && line.trim()) zLines.push(line.trim().split(/\s+/).map(Number));
    }
    if (zLines.length >= 2) {
      const Z11r = zLines[0][0], Z11i = zLines[0][1];
      const Z12r = zLines[0][2], Z12i = zLines[0][3];
      const Z21r = zLines[1][0], Z21i = zLines[1][1];
      const Z22r = zLines[1][2], Z22i = zLines[1][3];
      const omega = 2*Math.PI*1e9;
      console.log('\n=== 2-Port Analysis ===');
      console.log(`Z11 = ${Z11r.toFixed(4)} + j${Z11i.toFixed(4)} Ohm`);
      console.log(`Z12 = ${Z12r.toFixed(4)} + j${Z12i.toFixed(4)} Ohm`);
      console.log(`Z22 = ${Z22r.toFixed(4)} + j${Z22i.toFixed(4)} Ohm`);
      // Series impedance: Z_series = Z11 - Z12 (for a 2-port through device)
      const Zsr = Z11r - Z12r, Zsi = Z11i - Z12i;
      const L = Zsi / omega;
      const R = Zsr;
      console.log(`\nZ_series = Z11-Z12 = ${Zsr.toFixed(4)} + j${Zsi.toFixed(4)} Ohm`);
      console.log(`L = ${(L*1e12).toFixed(2)} pH`);
      console.log(`R = ${(R*1e3).toFixed(2)} mOhm`);
      console.log(`Expected: L ≈ 67 pH, R ≈ 86 mOhm`);
    }
  } catch {
    console.log('No result file');
  }

  cleanup();
  console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
