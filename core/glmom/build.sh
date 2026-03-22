#!/bin/bash
# Build GLMoM solver core as WASM module
# First pass: try to compile everything and see what fails

EMCC="C:/Repositories/TEMP/emsdk/python/3.13.3_64bit/python.exe C:/Repositories/TEMP/emsdk/upstream/emscripten/em++.py"
SRC="C:/Repositories/TEMP/glmom/glmom1_11src"
OUT_DIR="C:/Repositories/rapidpassives/web/static/wasm"

# Create a minimal stdafx.h stub
cat > /tmp/glmom_stdafx.h << 'STDAFX'
#ifndef _GLMOM_STDAFX_H
#define _GLMOM_STDAFX_H
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#endif
STDAFX

# Collect all cpp sources from solver core (exclude GUI)
SOURCES=""

# momlib - electromagnetic theory core
for f in "$SRC/momlib/"*.cpp; do
    # Skip MFC-specific printf wrapper
    base=$(basename "$f")
    if [ "$base" = "myprintf-mfc.cpp" ]; then continue; fi
    SOURCES="$SOURCES $f"
done

# nr_v2 - numerical recipes
for f in "$SRC/nr_v2/"*.cpp; do
    SOURCES="$SOURCES $f"
done

# dielib - solver core (skip Dlg* GUI dialogs)
for f in "$SRC/dielib/"*.cpp; do
    base=$(basename "$f")
    # Skip MFC dialog files
    case "$base" in
        Dlg*) continue ;;
        *Dialog*) continue ;;
    esac
    SOURCES="$SOURCES $f"
done

# mmgr - memory manager
SOURCES="$SOURCES $SRC/mmgr/mmgr.cpp"

echo "Compiling GLMoM solver core..."
echo "Source files: $(echo $SOURCES | wc -w)"

$EMCC \
    $SOURCES \
    -I"$SRC/momlib" \
    -I"$SRC/dielib" \
    -I"$SRC/nr_v2" \
    -I"$SRC/mmgr" \
    -include /tmp/glmom_stdafx.h \
    -O2 \
    -std=c++11 \
    -Wno-deprecated \
    -Wno-writable-strings \
    -Wno-c++11-narrowing \
    -Wno-logical-op-parentheses \
    -Wno-dangling-else \
    -Wno-parentheses \
    -Wno-format \
    -Wno-switch \
    -Wno-reorder \
    -Wno-sign-compare \
    -Wno-unused-variable \
    -Wno-sometimes-uninitialized \
    -Wno-delete-non-virtual-dtor \
    -Wno-tautological-compare \
    -Wno-implicit-int-float-conversion \
    -c \
    2>&1 | head -80

echo ""
echo "=== Compilation attempt complete ==="
