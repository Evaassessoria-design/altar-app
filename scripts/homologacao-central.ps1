# Casca do Windows. A implementação é `scripts/homologacao/central.mjs`, a
# MESMA que o `.sh` executa — ver o cabeçalho dela.
#
#   pwsh scripts/homologacao-central.ps1
#
# Antes de rodar, exporte no seu terminal a variável ALTAR_CENTRAL_MOCK_TOKEN
# com o valor já gravado no deployment. O token vem do ambiente e nunca deste
# arquivo: versionado, ele entregaria a qualquer pessoa com o repositório a
# capacidade de injetar mensagem no ambiente.
$ErrorActionPreference = "Stop"
node (Join-Path $PSScriptRoot "homologacao/central.mjs") @args
exit $LASTEXITCODE
