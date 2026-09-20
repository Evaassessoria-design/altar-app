#!/usr/bin/env bash
# Casca. A implementação é `scripts/homologacao/central.mjs`, em Node, para
# rodar igual no Linux e no Windows — ver o cabeçalho dela.
#
# Este arquivo existe só para quem já tem o comando na memória dos dedos.
set -euo pipefail
exec node "$(dirname "$0")/homologacao/central.mjs" "$@"
