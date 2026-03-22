/**
 * GLMoM WASM API wrapper.
 * Exposes the MoM solver to JavaScript through a simple C interface.
 *
 * Usage from JS:
 *   1. Call glmom_init()
 *   2. Write a script file to /script.txt via FS
 *   3. Call glmom_exec_file("/script.txt")
 *   4. Read results from /z.s2p, /y.s2p, /s.s2p via FS
 *   5. Call glmom_cleanup()
 */

#include "MoMSolver.h"
#include "EnumGreenType.h"
#include "EnumGeomType.h"
#include "cmatrix.h"
#include "s_param.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

static CMoMSolver* g_solver = nullptr;

extern "C" {

/**
 * Initialize the solver. Must be called first.
 */
EMSCRIPTEN_KEEPALIVE
int glmom_init() {
    if (g_solver) delete g_solver;
    g_solver = new CMoMSolver();
    printf("GLMoM solver initialized\n");
    return 0;
}

/**
 * Execute a solver script file (written to MEMFS).
 * The script uses GLMoM's command syntax:
 *   addQuad(origin, u, v, divu, divv, "name");
 *   setGreenType(0);  // 0=VAC, 1=GND, 2=PRN(multilayer)
 *   loadMedium("medium.dat");
 *   addPort();
 *   addPortEdge(portIdx, TIntPair(tri1, tri2));
 *   etc.
 */
EMSCRIPTEN_KEEPALIVE
int glmom_exec_file(const char* filename) {
    if (!g_solver) return -1;
    return g_solver->execFile(filename);
}

/**
 * Execute a single solver command string.
 */
EMSCRIPTEN_KEEPALIVE
int glmom_exec(const char* command) {
    if (!g_solver) return -1;
    char buf[1024];
    strncpy(buf, command, sizeof(buf)-1);
    buf[sizeof(buf)-1] = 0;
    return g_solver->exec(buf);
}

/**
 * Add a rectangular quad to the mesh.
 * origin: (x,y,z), u: edge vector 1, v: edge vector 2
 * divu, divv: number of mesh divisions
 */
EMSCRIPTEN_KEEPALIVE
int glmom_add_quad(
    double ox, double oy, double oz,
    double ux, double uy, double uz,
    double vx, double vy, double vz,
    int divu, int divv, const char* name
) {
    if (!g_solver) return -1;
    VEC3 origin(ox, oy, oz);
    VEC3 u(ux, uy, uz);
    VEC3 v(vx, vy, vz);
    g_solver->addQuad(origin, u, v, divu, divv, name);
    return 0;
}

/**
 * Import a raw triangle mesh from file (written to MEMFS).
 * Format: nodes section then triangles section.
 */
EMSCRIPTEN_KEEPALIVE
int glmom_import_raw(const char* filename, double scale) {
    if (!g_solver) return -1;
    return g_solver->importRaw(filename, scale);
}

/**
 * Set the Green's function type.
 * 0 = vacuum (free space)
 * 1 = ground plane (PEC half-space)
 * 2 = multilayer (Prony/DCIM)
 */
EMSCRIPTEN_KEEPALIVE
int glmom_set_green_type(int type) {
    if (!g_solver) return -1;
    g_solver->setGreenType(static_cast<EnumGreenType>(type));
    return 0;
}

/**
 * Load a multilayer medium definition file (written to MEMFS).
 */
EMSCRIPTEN_KEEPALIVE
int glmom_load_medium(const char* filename) {
    if (!g_solver) return -1;
    return g_solver->loadMedium(filename);
}

/**
 * Add a new port.
 */
EMSCRIPTEN_KEEPALIVE
int glmom_add_port() {
    if (!g_solver) return -1;
    return g_solver->addPort();
}

/**
 * Add an edge to a port.
 * iPort: port index, tri1/tri2: triangle indices sharing the edge.
 */
EMSCRIPTEN_KEEPALIVE
int glmom_add_port_edge(int iPort, int tri1, int tri2) {
    if (!g_solver) return -1;
    TIntPair pair;
    pair[0] = tri1;
    pair[1] = tri2;
    g_solver->addPortEdgeAndInitWavePort(iPort, pair);
    return 0;
}

/**
 * Set frequency in Hz.
 */
EMSCRIPTEN_KEEPALIVE
int glmom_set_freq(double freq_hz) {
    if (!g_solver) return -1;
    g_solver->setFreq(dcomplex(freq_hz, 0));
    return 0;
}

/**
 * Run frequency sweep and write Touchstone files to MEMFS.
 * f0, f1: start/end frequency in Hz
 * df: frequency step in Hz
 * Results written to /z.s2p, /y.s2p, /s.s2p
 */
EMSCRIPTEN_KEEPALIVE
int glmom_sweep_freq(double f0, double f1, double df) {
    if (!g_solver) return -1;
    return g_solver->sweepFreq(f0, f1, df, 1.0,
        "/z.s2p", "/y.s2p", "/s.s2p", "/gamma.dat", "");
}

/**
 * Solve at single frequency and return Z-matrix size.
 * Results are stored internally — retrieve with glmom_get_z().
 */
EMSCRIPTEN_KEEPALIVE
int glmom_solve(double freq_hz) {
    if (!g_solver) return -1;

    g_solver->setFreq(dcomplex(freq_hz, 0));

    CMatrix Y, Z, S;
    g_solver->calcYZSMatrix(Y, Z, S);

    // Write results to files that JS can read
    int nport = Z.rows();
    FILE* fp = fopen("/result.txt", "wt");
    if (!fp) return -1;

    fprintf(fp, "FREQ %lg\n", freq_hz);
    fprintf(fp, "NPORT %d\n", nport);

    fprintf(fp, "Z\n");
    for (int i = 0; i < nport; i++) {
        for (int j = 0; j < nport; j++) {
            fprintf(fp, "%lg %lg ", Z(i,j).re, Z(i,j).im);
        }
        fprintf(fp, "\n");
    }

    fprintf(fp, "S\n");
    for (int i = 0; i < nport; i++) {
        for (int j = 0; j < nport; j++) {
            fprintf(fp, "%lg %lg ", S(i,j).re, S(i,j).im);
        }
        fprintf(fp, "\n");
    }

    fclose(fp);
    return nport;
}

/**
 * Clean up solver resources.
 */
EMSCRIPTEN_KEEPALIVE
int glmom_cleanup() {
    if (g_solver) {
        delete g_solver;
        g_solver = nullptr;
    }
    return 0;
}

} // extern "C"

// Dummy main for Emscripten
int main() {
    printf("GLMoM WASM module loaded\n");
    return 0;
}
