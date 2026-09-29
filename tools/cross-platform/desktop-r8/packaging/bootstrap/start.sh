#!/bin/sh
set -eu
# Resolve the physical instance directory; forward arguments literally.
SEP_INSTANCE_DIR=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd -P)
cd -- "$SEP_INSTANCE_DIR"
exec "$SEP_INSTANCE_DIR/runtime/node/bin/node" "$SEP_INSTANCE_DIR/launch.mjs" "$@"
