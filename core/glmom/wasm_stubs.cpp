/**
 * Stubs for missing functions in GLMoM WASM build.
 */
#include <stdio.h>
#include <string.h>
#include "dcomplex.h"
#include "hankel.h"
#include "pencil.h"
#include "GreenTester.h"

// ---- LAPACK stubs (return int to match caller expectations) ----
extern "C" {
    int zgetrf_(int* m, int* n, void* a, int* lda, int* ipiv, int* info) {
        *info = -1; return -1;
    }
    int zgetrs_(char* trans, int* n, int* nrhs, void* a, int* lda, int* ipiv,
                void* b, int* ldb, int* info) {
        *info = -1; return -1;
    }
}

// ---- Pencil (Prony method) stub ----
void pencil(int m, double xmin, double xmax, dcomplex* aa,
            int minnp, int maxnp, int& np, dcomplex* gamma,
            dcomplex* b, double& error, int verbose) {
    np = 0;
    error = 1e10;
}

// ---- Hankel transform stub ----
dcomplex hankel_t::operator()(Fcomplex& func, int order, double rho) {
    return dcomplex(0, 0);
}
int hankel_t::rk = 0;

// ---- GreenTester stubs ----
GreenTester::GreenTester() : m_green(0) {}
GreenTester::GreenTester(TMultilayerGreen* green) : m_green(green) {}
GreenTester::~GreenTester() {}
void GreenTester::setGreen(TMultilayerGreen* green) { m_green = green; }
void GreenTester::test() {}
bool GreenTester::enabled() { return false; }
void GreenTester::setParam(char, double, double, double, double, double, int) {}
void GreenTester::load(const char*) {}
void GreenTester::load(FILE*) {}
char GreenTester::m_com = 0;
double GreenTester::m_z = 0;
double GreenTester::m_zs = 0;
double GreenTester::m_theta = 0;
double GreenTester::m_lambda0 = 0;
double GreenTester::m_lambda1 = 0;
int GreenTester::m_n = 0;

// ---- flushall (MSVC-specific) ----
extern "C" {
    int flushall() { fflush(stdout); fflush(stderr); return 0; }
}
