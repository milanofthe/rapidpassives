/*
 * Fix K&R function signature mismatches for WASM compilation.
 * Force-included via -include flag to provide correct forward declarations
 * before any implicit (int-returning) assumptions are made by K&R C code.
 */
#ifndef WASM_FIXUPS_H
#define WASM_FIXUPS_H

struct ssystem;
struct cx_struct;

/* mulDo.c */
void mulEval(struct ssystem *);

/* mulMats.c */
void mulMatEval(struct ssystem *);

/* mulMulti.c */
void xyz2sphere(double, double, double, double, double, double,
                double *, double *, double *);
void evalLegendre(double, double *, int);
void mulMultiAlloc(int, int, int);

/* mulLocal.c */
void evalFacFra(double **, int);

/* addgroundplane.c */
void doincrement(double, double, double, double, double, double,
                 int, double *, double *, double *);

/* direct.c */
void solve(double **, double *, double *, int);

/* cx_ludecomp.c — CX is struct cx_struct */
void cx_lu_solve(struct cx_struct **, struct cx_struct *, struct cx_struct *, int);

/* uglieralloc.c */
void uallocEfcy(long);

/* sparse/spSolve.c */
void spSolve(char *, double *, double *);

/* Override the custom allocator (uglieralloc) with standard calloc
   to prevent heap corruption between two competing allocators */
#ifdef CALCORE
#undef CALCORE
#endif
#define CALCORE(NUM, TYPE) calloc((unsigned)(NUM), sizeof(TYPE))

#endif
