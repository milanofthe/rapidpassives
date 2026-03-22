#!/bin/bash
# Build FastHenry as WASM module
# Run from this directory

EMCC="C:/Repositories/TEMP/emsdk/python/3.13.3_64bit/python.exe C:/Repositories/TEMP/emsdk/upstream/emscripten/emcc.py"
FH_SRC="C:/Repositories/TEMP/FastHenry2/src/fasthenry"
OUT_DIR="C:/Repositories/rapidpassives/web/static/wasm"

mkdir -p "$OUT_DIR"

# Restore any previous patches
cd "C:/Repositories/TEMP/FastHenry2" && git checkout -- src/fasthenry/ 2>/dev/null
cd "C:/Repositories/rapidpassives/core/fasthenry"

# FastHenry source files (from Makefile OBJS + MOBJS + NONUNIOBJS)
OBJS="induct gmres savemat_mod readGeom joelself writefastcap \
      SetupMulti calcp SetupComputePsi mulSetup BreakupSeg \
      Precond addgroundplane findpaths fillM cx_ludecomp \
      parse_command_line default_opts Prec_cost hole \
      dist_betw_fils mutual newPrecond deg_mutual \
      barnoldi regurgitate"
MOBJS="mulGlobal mulDo mulMulti mulLocal mulMats direct \
       uglieralloc capsolve"
NONUNIOBJS="find_nonuni_path read_tree contact"

SOURCES=""
for f in $OBJS $MOBJS $NONUNIOBJS; do
    SOURCES="$SOURCES $FH_SRC/$f.c"
done

# Sparse library (only the core files used by FastHenry)
for f in spAllocate spBuild spFactor spOutput spSolve; do
    SOURCES="$SOURCES $FH_SRC/sparse/$f.c"
done

# Stubs for missing POSIX functions
cat > /tmp/fh_stubs.c << 'EOF'
#include <string.h>
int gethostname(char *name, int len) { strncpy(name, "wasm", len); return 0; }
EOF
SOURCES="$SOURCES /tmp/fh_stubs.c"

# Patch: dumpnums caller passes 3 args but definition takes 2
sed -i 's/^dumpnums(flag, size)$/dumpnums(flag, size, unused_up_size)/' "$FH_SRC/calcp.c"
sed -i 's/^int flag, size;$/int flag, size, unused_up_size;/' "$FH_SRC/calcp.c"

echo "Compiling FastHenry to WASM..."
echo "Sources: $(echo $SOURCES | wc -w) files"

$EMCC \
    $SOURCES \
    -I"$FH_SRC" \
    -I"$FH_SRC/sparse" \
    -O2 \
    -Wno-implicit-int \
    -Wno-implicit-function-declaration \
    -Wno-deprecated-non-prototype \
    -Wno-incompatible-pointer-types \
    -Wno-int-conversion \
    -Wno-return-type \
    -Wno-return-mismatch \
    -std=gnu89 \
    -include "C:/Repositories/rapidpassives/core/fasthenry/wasm_fixups.h" \
    -s WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s STACK_SIZE=4194304 \
    -s INITIAL_MEMORY=16777216 \
    -s EXPORTED_FUNCTIONS='["_main"]' \
    -s EXPORTED_RUNTIME_METHODS='["FS","callMain","cwrap"]' \
    -s MODULARIZE=1 \
    -s EXPORT_NAME='FastHenryModule' \
    -s ENVIRONMENT='web,worker' \
    -s FILESYSTEM=1 \
    -s NO_EXIT_RUNTIME=0 \
    -Wl,--allow-multiple-definition \
    -lm \
    -o "$OUT_DIR/fasthenry.js" \
    2>&1

if [ $? -eq 0 ]; then
    echo ""
    echo "Build successful!"
    ls -la "$OUT_DIR/fasthenry.js" "$OUT_DIR/fasthenry.wasm" 2>/dev/null
else
    echo ""
    echo "Build FAILED"
fi
