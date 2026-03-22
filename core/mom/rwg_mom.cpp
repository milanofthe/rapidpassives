/**
 * Minimal RWG Method of Moments solver for planar conductors.
 *
 * Based on: Rao, Wilton, Glisson, "Electromagnetic Scattering by
 * Surfaces of Arbitrary Shape", IEEE TAP, 1982.
 *
 * SIBC (Surface Impedance Boundary Condition) for finite conductivity.
 * Free-space Green's function (no substrate yet).
 *
 * Designed for RFIC inductor simulation (~100-2000 triangles, sub-wavelength).
 */

#include <Eigen/Dense>
#include <complex>
#include <vector>
#include <map>
#include <cmath>
#include <cstdio>
#include <algorithm>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

using cx = std::complex<double>;
using Vec3 = Eigen::Vector3d;
using Vec3c = Eigen::Vector3cd;

static const double PI  = 3.14159265358979323846;
static const double MU0 = 4.0 * PI * 1e-7;
static const double EPS0 = 8.854187817e-12;
static const double C0  = 299792458.0;
static const cx J(0.0, 1.0);

// ============================================================
// Triangle quadrature (Dunavant)
// ============================================================
struct QP { double L1, L2, L3, w; };

static const QP Q3[] = {
    {2./3, 1./6, 1./6, 1./3},
    {1./6, 2./3, 1./6, 1./3},
    {1./6, 1./6, 2./3, 1./3},
};
static const QP Q7[] = {
    {1./3, 1./3, 1./3, 0.225},
    {0.059715871789770, 0.470142064105115, 0.470142064105115, 0.132394152788506},
    {0.470142064105115, 0.059715871789770, 0.470142064105115, 0.132394152788506},
    {0.470142064105115, 0.470142064105115, 0.059715871789770, 0.132394152788506},
    {0.797426985353087, 0.101286507323456, 0.101286507323456, 0.125939180544827},
    {0.101286507323456, 0.797426985353087, 0.101286507323456, 0.125939180544827},
    {0.101286507323456, 0.101286507323456, 0.797426985353087, 0.125939180544827},
};

// ============================================================
// Mesh data
// ============================================================
struct Triangle { int v[3]; double area; Vec3 center; };
struct RWGEdge {
    int tri_plus, tri_minus;
    int v_opp_plus, v_opp_minus;
    int v0, v1;
    double length;
};
struct Port { std::vector<int> edges; };

struct MoMProblem {
    std::vector<Vec3> nodes;
    std::vector<Triangle> tris;
    std::vector<RWGEdge> edges;
    std::vector<Port> ports;
    double sigma;
    double thickness;
};

static MoMProblem* g_prob = nullptr;

static void buildEdges(MoMProblem& p) {
    p.edges.clear();
    struct EI { int tri, v_opp; };
    std::map<std::pair<int,int>, std::vector<EI>> em;
    for (int t = 0; t < (int)p.tris.size(); t++) {
        auto& tri = p.tris[t];
        for (int e = 0; e < 3; e++) {
            int a = tri.v[e], b = tri.v[(e+1)%3], c = tri.v[(e+2)%3];
            em[{std::min(a,b), std::max(a,b)}].push_back({t, c});
        }
    }
    for (auto& kv : em) {
        if (kv.second.size() == 2) {
            RWGEdge ed;
            ed.v0 = kv.first.first; ed.v1 = kv.first.second;
            ed.tri_plus = kv.second[0].tri; ed.tri_minus = kv.second[1].tri;
            ed.v_opp_plus = kv.second[0].v_opp; ed.v_opp_minus = kv.second[1].v_opp;
            ed.length = (p.nodes[ed.v0] - p.nodes[ed.v1]).norm();
            p.edges.push_back(ed);
        }
    }
}

static void computeTriProps(MoMProblem& p) {
    for (auto& t : p.tris) {
        Vec3 a = p.nodes[t.v[0]], b = p.nodes[t.v[1]], c = p.nodes[t.v[2]];
        t.area = 0.5 * (b - a).cross(c - a).norm();
        t.center = (a + b + c) / 3.0;
    }
}

// ============================================================
// Green's function
// ============================================================
static cx green(const Vec3& r, const Vec3& rp, double k) {
    double R = (r - rp).norm();
    if (R < 1e-20) return cx(0, 0);
    return std::exp(-J * k * R) / (4.0 * PI * R);
}

// ============================================================
// Galerkin-tested EFIE impedance matrix (RWG)
//
// The RWG EFIE system is:
//   Z(m,n) * I_n = V_m
//
// where I_n are in Amperes and V_m in Volts.
//
// Z(m,n) = <f_m, L(f_n)>
//        = jω <f_m, A(f_n)> - <f_m, ∇Φ(f_n)>
//
// Using integration by parts on the scalar potential term:
//   -<f_m, ∇Φ> = <∇·f_m, Φ>  (boundary terms vanish)
//
// With f_n = l_n/(2A_T) ρ_n, ∇·f_n = l_n/A_T (constant on each triangle)
//
// The vector potential from source f_n is:
//   A(r) = μ₀ ∫ G(r,r') f_n(r') dS'
//
// The scalar potential from source f_n is:
//   Φ(r) = -1/(jωε₀) ∫ G(r,r') ∇'·f_n(r') dS'
//        = -1/(jωε₀) * l_n/A_T * ∫_T G(r,r') dS'
//        with sign: +l_n/A on T+, -l_n/A on T-
//
// So:
// Z(m,n) = jωμ₀ ∫∫ f_m(r)·f_n(r') G(r,r') dS' dS
//        + 1/(jωε₀) ∫∫ (∇·f_m)(r) (∇'·f_n)(r') G(r,r') dS' dS
//
// ============================================================

// Integrate G over a source triangle: ∫_T G(r_obs, r') dS'
static cx intG(const Vec3& r_obs, const Triangle& src, const std::vector<Vec3>& nodes, double k, bool singular) {
    const Vec3& v0 = nodes[src.v[0]];
    const Vec3& v1 = nodes[src.v[1]];
    const Vec3& v2 = nodes[src.v[2]];
    double A2 = 2.0 * src.area;
    cx result(0, 0);

    if (singular) {
        // Singularity subtraction: G = (G - G0) + G0
        for (int q = 0; q < 7; q++) {
            Vec3 rp = Q7[q].L1*v0 + Q7[q].L2*v1 + Q7[q].L3*v2;
            double R = (r_obs - rp).norm();
            cx G_reg = (R > 1e-15) ? (std::exp(-J*k*R) - 1.0) / (4.0*PI*R) : cx(0, -k/(4.0*PI));
            double G0  = (R > 1e-15) ? 1.0 / (4.0*PI*R) : 0.0;
            result += Q7[q].w * A2 * (G_reg + G0);
        }
    } else {
        for (int q = 0; q < 7; q++) {
            Vec3 rp = Q7[q].L1*v0 + Q7[q].L2*v1 + Q7[q].L3*v2;
            result += Q7[q].w * A2 * green(r_obs, rp, k);
        }
    }
    return result;
}

// Integrate G * f_n over a source triangle: ∫_T G(r_obs, r') f_n(r') dS'
// where f_n(r') = l_n/(2A_T) * ρ_n(r') and ρ_n = r' - r_free (for T+) or r_free - r' (for T-)
static Vec3c intGf(const Vec3& r_obs, const Triangle& src, const std::vector<Vec3>& nodes,
                   double k, bool singular, double l_n, int v_free, double sign_n) {
    const Vec3& v0 = nodes[src.v[0]];
    const Vec3& v1 = nodes[src.v[1]];
    const Vec3& v2 = nodes[src.v[2]];
    const Vec3& rf = nodes[v_free];
    double A = src.area;
    double A2 = 2.0 * A;
    Vec3c result = Vec3c::Zero();

    auto eval = [&](const Vec3& rp, cx G_val) {
        Vec3 rho = sign_n > 0 ? (rp - rf) : (rf - rp);
        Vec3c fn = (l_n / (2.0 * A)) * rho.cast<cx>();
        result += G_val * fn;
    };

    if (singular) {
        for (int q = 0; q < 7; q++) {
            Vec3 rp = Q7[q].L1*v0 + Q7[q].L2*v1 + Q7[q].L3*v2;
            double R = (r_obs - rp).norm();
            cx G_reg = (R > 1e-15) ? (std::exp(-J*k*R) - 1.0) / (4.0*PI*R) : cx(0, -k/(4.0*PI));
            double G0 = (R > 1e-15) ? 1.0 / (4.0*PI*R) : 0.0;
            cx Gv = G_reg + G0;
            Vec3 rho = sign_n > 0 ? (rp - rf) : (rf - rp);
            Vec3c fn = (l_n / (2.0 * A)) * rho.cast<cx>();
            result += Q7[q].w * A2 * Gv * fn;
        }
    } else {
        for (int q = 0; q < 7; q++) {
            Vec3 rp = Q7[q].L1*v0 + Q7[q].L2*v1 + Q7[q].L3*v2;
            cx Gv = green(r_obs, rp, k);
            Vec3 rho = sign_n > 0 ? (rp - rf) : (rf - rp);
            Vec3c fn = (l_n / (2.0 * A)) * rho.cast<cx>();
            result += Q7[q].w * A2 * Gv * fn;
        }
    }
    return result;
}

static Eigen::MatrixXcd fillZMatrix(const MoMProblem& prob, double freq) {
    double omega = 2.0 * PI * freq;
    double k = omega / C0;
    int N = prob.edges.size();
    Eigen::MatrixXcd Z = Eigen::MatrixXcd::Zero(N, N);

    // For each (m,n) pair, compute Galerkin double integral
    // Z(m,n) = jωμ₀ ∫∫ f_m·f_n G dSdS' + 1/(jωε₀) ∫∫ div(f_m) div'(f_n) G dSdS'

    for (int m = 0; m < N; m++) {
        const auto& em = prob.edges[m];

        // Test edge m has two triangles
        struct TT { int tri; int vf; double sign; };
        TT tm[2] = {
            {em.tri_plus,  em.v_opp_plus,  +1.0},
            {em.tri_minus, em.v_opp_minus, -1.0},
        };

        for (int n = 0; n < N; n++) {
            const auto& en = prob.edges[n];
            TT tn[2] = {
                {en.tri_plus,  en.v_opp_plus,  +1.0},
                {en.tri_minus, en.v_opp_minus, -1.0},
            };

            cx z_mn(0, 0);

            // Sum over 4 triangle pairs: (T_m±, T_n±)
            for (int ti = 0; ti < 2; ti++) {
                const auto& test = tm[ti];
                const auto& test_tri = prob.tris[test.tri];
                double A_m = test_tri.area;
                const Vec3& tv0 = prob.nodes[test_tri.v[0]];
                const Vec3& tv1 = prob.nodes[test_tri.v[1]];
                const Vec3& tv2 = prob.nodes[test_tri.v[2]];
                const Vec3& rf_m = prob.nodes[test.vf];

                // div(f_m) on this triangle = l_m / A_m * sign_m
                double div_fm = em.length / A_m * test.sign;

                for (int si = 0; si < 2; si++) {
                    const auto& src = tn[si];
                    const auto& src_tri = prob.tris[src.tri];
                    double A_n = src_tri.area;

                    // div(f_n) on source triangle = l_n / A_n * sign_n
                    double div_fn = en.length / A_n * src.sign;

                    // Outer (test) quadrature
                    for (int qi = 0; qi < 3; qi++) {
                        Vec3 r = Q3[qi].L1*tv0 + Q3[qi].L2*tv1 + Q3[qi].L3*tv2;
                        double w = Q3[qi].w * 2.0 * A_m;

                        // Test function value at r
                        Vec3 rho_m = test.sign > 0 ? (r - rf_m) : (rf_m - r);
                        Vec3c fm = (em.length / (2.0 * A_m)) * rho_m.cast<cx>();

                        bool sing = (test.tri == src.tri);

                        // Vector potential term: jωμ₀ f_m(r) · ∫ G(r,r') f_n(r') dS'
                        Vec3c gf = intGf(r, src_tri, prob.nodes, k, sing,
                                         en.length, src.vf, src.sign);
                        cx vecterm = J * omega * MU0 * fm.dot(gf);

                        // Scalar potential term: 1/(jωε₀) div(f_m) × div(f_n) × ∫ G(r,r') dS'
                        cx ig = intG(r, src_tri, prob.nodes, k, sing);
                        cx scaterm = (1.0 / (J * omega * EPS0)) * div_fm * div_fn * ig;

                        z_mn += w * (vecterm + scaterm);
                    }
                }
            }
            Z(m, n) = z_mn;
        }
    }
    return Z;
}

// ============================================================
// SIBC Gram matrix <f_m, f_n> (Galerkin)
// ============================================================
static cx surfaceImpedance(double sigma, double thickness, double omega) {
    if (sigma <= 0 || thickness <= 0) return cx(0, 0);
    double rho = 1.0 / sigma;
    if (omega <= 0) return cx(rho / thickness, 0);
    double delta = std::sqrt(2.0 * rho / (omega * MU0));
    cx alpha = cx(1, 1) * thickness / (2.0 * delta);
    if (std::abs(alpha) > 20) return cx(1, 1) * rho / delta;
    return cx(1, 1) * rho / delta * std::cosh(alpha) / std::sinh(alpha);
}

static Eigen::MatrixXcd buildGram(const MoMProblem& prob) {
    int N = prob.edges.size();
    int NT = prob.tris.size();
    Eigen::MatrixXcd G = Eigen::MatrixXcd::Zero(N, N);

    std::vector<std::vector<int>> t2e(NT);
    for (int e = 0; e < N; e++) {
        t2e[prob.edges[e].tri_plus].push_back(e);
        t2e[prob.edges[e].tri_minus].push_back(e);
    }

    for (int t = 0; t < NT; t++) {
        const auto& tri = prob.tris[t];
        double A = tri.area;
        if (A < 1e-30) continue;
        const Vec3& v0 = prob.nodes[tri.v[0]];
        const Vec3& v1 = prob.nodes[tri.v[1]];
        const Vec3& v2 = prob.nodes[tri.v[2]];

        for (int ei : t2e[t]) {
            const auto& em = prob.edges[ei];
            bool iplus = (em.tri_plus == t);
            int vfi = iplus ? em.v_opp_plus : em.v_opp_minus;
            double si = iplus ? 1.0 : -1.0;

            for (int ej : t2e[t]) {
                const auto& en = prob.edges[ej];
                bool jplus = (en.tri_plus == t);
                int vfj = jplus ? en.v_opp_plus : en.v_opp_minus;
                double sj = jplus ? 1.0 : -1.0;

                // ∫_T f_i · f_j dS using 3-point quadrature
                double val = 0;
                for (int q = 0; q < 3; q++) {
                    Vec3 r = Q3[q].L1*v0 + Q3[q].L2*v1 + Q3[q].L3*v2;
                    Vec3 rhoi = si > 0 ? (r - prob.nodes[vfi]) : (prob.nodes[vfi] - r);
                    Vec3 rhoj = sj > 0 ? (r - prob.nodes[vfj]) : (prob.nodes[vfj] - r);
                    Vec3 fi = (em.length / (2.0*A)) * rhoi;
                    Vec3 fj = (en.length / (2.0*A)) * rhoj;
                    val += Q3[q].w * fi.dot(fj);
                }
                val *= 2.0 * A; // Jacobian
                G(ei, ej) += val;
            }
        }
    }
    return G;
}

// ============================================================
// Port Z extraction
// ============================================================
static Eigen::MatrixXcd extractZ(const MoMProblem& prob, const Eigen::MatrixXcd& Zmom) {
    int nport = prob.ports.size();
    int N = prob.edges.size();
    Eigen::MatrixXcd Zp(nport, nport);

    for (int p = 0; p < nport; p++) {
        // Delta-gap: V_m = δ(m, n_gap) * 1V for each port edge
        // For multi-edge port: V is 1V at each port edge (parallel feeds)
        Eigen::VectorXcd V = Eigen::VectorXcd::Zero(N);
        for (int ei : prob.ports[p].edges) V(ei) = 1.0;

        Eigen::VectorXcd I = Zmom.fullPivLu().solve(V);

        for (int q = 0; q < nport; q++) {
            // Port current = sum of I_n * l_n for edges at port q
            cx Ip(0, 0);
            for (int ei : prob.ports[q].edges)
                Ip += I(ei) * prob.edges[ei].length;
            // Z = V / I_port = 1V / I_port
            Zp(q, p) = (std::abs(Ip) > 1e-40) ? 1.0 / Ip : cx(0, 0);
        }
    }
    return Zp;
}

static Eigen::MatrixXcd zToS(const Eigen::MatrixXcd& Z, double z0) {
    int n = Z.rows();
    Eigen::MatrixXcd I = Eigen::MatrixXcd::Identity(n, n);
    return (Z/z0 - I) * (Z/z0 + I).inverse();
}

// ============================================================
// C API
// ============================================================
extern "C" {

EXPORT int mom_init() {
    if (g_prob) delete g_prob;
    g_prob = new MoMProblem();
    g_prob->sigma = 5.8e7;
    g_prob->thickness = 2e-6;
    return 0;
}

EXPORT void mom_set_material(double sigma, double thickness) {
    if (g_prob) { g_prob->sigma = sigma; g_prob->thickness = thickness; }
}

EXPORT int mom_set_mesh(const double* nodes, int nnodes, const int* tris, int ntris) {
    if (!g_prob) return -1;
    g_prob->nodes.resize(nnodes);
    for (int i = 0; i < nnodes; i++)
        g_prob->nodes[i] = Vec3(nodes[3*i], nodes[3*i+1], nodes[3*i+2]);
    g_prob->tris.resize(ntris);
    for (int i = 0; i < ntris; i++) {
        g_prob->tris[i].v[0] = tris[3*i];
        g_prob->tris[i].v[1] = tris[3*i+1];
        g_prob->tris[i].v[2] = tris[3*i+2];
    }
    computeTriProps(*g_prob);
    buildEdges(*g_prob);
    printf("Mesh: %d nodes, %d tris, %d DOFs\n", nnodes, ntris, (int)g_prob->edges.size());
    return (int)g_prob->edges.size();
}

EXPORT int mom_add_port(const int* edge_indices, int nedges) {
    if (!g_prob) return -1;
    Port p;
    for (int i = 0; i < nedges; i++) p.edges.push_back(edge_indices[i]);
    g_prob->ports.push_back(p);
    return (int)g_prob->ports.size() - 1;
}

EXPORT int mom_find_edge(int v0, int v1) {
    if (!g_prob) return -1;
    int a = std::min(v0,v1), b = std::max(v0,v1);
    for (int i = 0; i < (int)g_prob->edges.size(); i++) {
        int ea = std::min(g_prob->edges[i].v0, g_prob->edges[i].v1);
        int eb = std::max(g_prob->edges[i].v0, g_prob->edges[i].v1);
        if (ea == a && eb == b) return i;
    }
    return -1;
}

EXPORT int mom_solve(double freq_hz, double z0) {
    if (!g_prob || g_prob->edges.empty()) return -1;
    double omega = 2.0 * PI * freq_hz;
    int N = g_prob->edges.size();

    printf("Solving at %.3g GHz (%d DOFs, %d ports)...\n",
           freq_hz/1e9, N, (int)g_prob->ports.size());

    // EFIE matrix
    Eigen::MatrixXcd Zmom = fillZMatrix(*g_prob, freq_hz);

    // SIBC
    cx Zs = surfaceImpedance(g_prob->sigma, g_prob->thickness, omega);
    printf("  Z_s = %.4g + j%.4g Ohm/sq\n", Zs.real(), Zs.imag());
    if (std::abs(Zs) > 0) {
        Eigen::MatrixXcd Gram = buildGram(*g_prob);
        Zmom += Zs * Gram;
    }

    // Diagnostics
    printf("  Z_mom(0,0) = %.4g + j%.4g\n", Zmom(0,0).real(), Zmom(0,0).imag());
    if (N > 1) printf("  Z_mom(1,1) = %.4g + j%.4g\n", Zmom(1,1).real(), Zmom(1,1).imag());

    if (g_prob->ports.empty()) {
        printf("No ports defined\n");
        return 0;
    }

    Eigen::MatrixXcd Z = extractZ(*g_prob, Zmom);
    // Use input power method to verify sign:
    // P_in = 0.5 * V^H * I, Z_in = |V|^2 / (2*P_in)
    {
        int N = Zmom.rows();
        Eigen::VectorXcd V = Eigen::VectorXcd::Zero(N);
        for (int ei : g_prob->ports[0].edges) V(ei) = 1.0;
        Eigen::VectorXcd I = Zmom.fullPivLu().solve(V);
        cx Pin = 0.5 * V.dot(I); // V^H * I (Eigen dot is conjugate-linear in first arg)
        double Vnorm2 = V.squaredNorm();
        cx Zin_power = Vnorm2 / (2.0 * std::conj(Pin));
        printf("  Power method: P_in=%.4g+j%.4g, Z_in=%.4f+j%.4f Ohm\n",
               Pin.real(), Pin.imag(), Zin_power.real(), Zin_power.imag());
        printf("  L=%.3f pH, R=%.3f mOhm\n",
               Zin_power.imag()/(2*PI*freq_hz)*1e12, Zin_power.real()*1e3);
    }
    Eigen::MatrixXcd S = zToS(Z, z0);

    int nport = Z.rows();
    FILE* fp = fopen("/result.txt", "wt");
    fprintf(fp, "FREQ %.15g\nNPORT %d\n", freq_hz, nport);
    fprintf(fp, "Z\n");
    for (int i = 0; i < nport; i++) {
        for (int j = 0; j < nport; j++)
            fprintf(fp, "%.10g %.10g ", Z(i,j).real(), Z(i,j).imag());
        fprintf(fp, "\n");
    }
    fprintf(fp, "S\n");
    for (int i = 0; i < nport; i++) {
        for (int j = 0; j < nport; j++)
            fprintf(fp, "%.10g %.10g ", S(i,j).real(), S(i,j).imag());
        fprintf(fp, "\n");
    }
    fclose(fp);

    double L_nH = Z(0,0).imag() / omega * 1e9;
    double R_mOhm = Z(0,0).real() * 1e3;
    double Q = Z(0,0).real() > 0 ? Z(0,0).imag() / Z(0,0).real() : 0;
    printf("  Z(1,1) = %.4f + j%.4f Ohm  (L=%.3f nH, R=%.2f mOhm, Q=%.1f)\n",
           Z(0,0).real(), Z(0,0).imag(), L_nH, R_mOhm, Q);
    return nport;
}

EXPORT int mom_get_ndof() {
    return g_prob ? (int)g_prob->edges.size() : 0;
}

EXPORT void mom_cleanup() {
    if (g_prob) { delete g_prob; g_prob = nullptr; }
}

} // extern "C"

#ifndef __EMSCRIPTEN__
int main() {
    printf("RWG MoM solver test\n");
    mom_init();
    // 100um x 10um strip at z=3um
    double um = 1e-6;
    int nx=10, ny=2;
    double L=100*um, W=10*um, z=3*um;
    double dx=L/nx, dy=W/ny;
    std::vector<double> nd;
    for (int j=0;j<=ny;j++) for (int i=0;i<=nx;i++) {
        nd.push_back(i*dx); nd.push_back(-W/2+j*dy); nd.push_back(z);
    }
    std::vector<int> tr;
    for (int j=0;j<ny;j++) for (int i=0;i<nx;i++) {
        int v00=j*(nx+1)+i, v10=v00+1, v01=v00+(nx+1), v11=v01+1;
        tr.push_back(v00); tr.push_back(v10); tr.push_back(v11);
        tr.push_back(v00); tr.push_back(v11); tr.push_back(v01);
    }
    mom_set_mesh(nd.data(), (nx+1)*(ny+1), tr.data(), nx*ny*2);
    // Port at x=L/2
    std::vector<int> pe;
    for (int j=0;j<ny;j++) {
        int e = mom_find_edge(j*(nx+1)+nx/2, (j+1)*(nx+1)+nx/2);
        if (e>=0) pe.push_back(e);
    }
    if (!pe.empty()) mom_add_port(pe.data(), pe.size());
    mom_solve(1e9, 50.0);
    mom_cleanup();
    return 0;
}
#endif
