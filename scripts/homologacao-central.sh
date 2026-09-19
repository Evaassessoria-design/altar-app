#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HOMOLOGAÇÃO DA CENTRAL DE COMUNICAÇÕES — cenário de demonstração
#
# Põe na Central oito conversas que se parecem com um dia de trabalho real:
# comercial das duas verticais, onboarding, suporte, financeiro, ouvidoria,
# pedido de funcionalidade e uma escalada para o CEO.
#
# ── POR QUE PELO GATEWAY, E NÃO POR INSERÇÃO DIRETA ─────────────────────────
# Cada mensagem entra pela MESMA rota que o WhatsApp usaria
# (`POST /channels/<canal>/webhook`, modo mock). Assim a homologação exercita o
# caminho inteiro — adaptador → identidade → contato → conversa → mensagem →
# evento de integração — em vez de fabricar o resultado dele. Inserir direto no
# banco testaria a tela contra dados que o sistema nunca produziria.
#
# A triagem é aplicada logo depois pela mutation interna que a ação de IA
# chama (`communicationsTriage.aplicarTriagem`), com um palpite FIXO por
# cenário. O modelo não é chamado: homologação não pode depender de rede, de
# chave, nem de uma resposta que muda a cada execução.
#
# ── O QUE ESTE SCRIPT NUNCA FAZ ─────────────────────────────────────────────
#   · não roda contra produção (trava explícita por nome de deployment);
#   · não liga envio externo — recusa se `ALTAR_CENTRAL_ENVIO_HABILITADO=true`;
#   · não toca em cobrança, assinatura ou Asaas;
#   · é idempotente: os identificadores de mensagem são fixos, então rodar de
#     novo é registrado como `duplicate` e não cria nada.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROD_PROIBIDA="mellow-goose-539"

alvo() {
  # Self-hosted (backend local) ou deployment da nuvem — nesta ordem.
  if [[ -n "${CONVEX_SELF_HOSTED_URL:-}" ]]; then
    echo "$CONVEX_SELF_HOSTED_URL"
  elif [[ -n "${CONVEX_DEPLOYMENT:-}" ]]; then
    echo "$CONVEX_DEPLOYMENT"
  else
    echo ""
  fi
}

ALVO="$(alvo)"

if [[ -z "$ALVO" ]]; then
  echo "✖ Nenhum deployment selecionado."
  echo "  Defina CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY (backend local)"
  echo "  ou selecione o deployment de desenvolvimento antes de rodar."
  exit 1
fi

# ── Trava de produção ────────────────────────────────────────────────────────
# Primeira e mais importante verificação: nada aqui pode acontecer em produção.
if [[ "$ALVO" == *"$PROD_PROIBIDA"* ]]; then
  echo "✖ RECUSADO: o alvo é a PRODUÇÃO ($PROD_PROIBIDA)."
  echo "  Este script cria dados de demonstração e nunca deve tocar produção."
  exit 1
fi

echo "▸ Alvo: $ALVO"
read -r -p "  Confirma que este NÃO é o deployment de produção? [s/N] " resposta
[[ "$resposta" == "s" || "$resposta" == "S" ]] || { echo "✖ Cancelado."; exit 1; }

# ── Trava de envio externo ───────────────────────────────────────────────────
ENVIO="$(npx convex env get ALTAR_CENTRAL_ENVIO_HABILITADO 2>/dev/null || true)"
if [[ "$(echo "$ENVIO" | tr -d '[:space:]')" == "true" ]]; then
  echo "✖ RECUSADO: ALTAR_CENTRAL_ENVIO_HABILITADO=true neste ambiente."
  echo "  Homologação não roda com a porta de saída aberta."
  exit 1
fi

PROVIDER="$(npx convex env get ALTAR_WHATSAPP_PROVIDER 2>/dev/null | tr -d '[:space:]' || true)"
if [[ "$PROVIDER" != "mock" ]]; then
  echo "✖ RECUSADO: ALTAR_WHATSAPP_PROVIDER=\"$PROVIDER\" (esperado: mock)."
  echo "  Com o provedor real configurado, uma resposta aprovada poderia sair."
  exit 1
fi

MOCK_TOKEN="${ALTAR_CENTRAL_MOCK_TOKEN:-}"
if [[ -z "$MOCK_TOKEN" ]]; then
  echo "✖ Defina ALTAR_CENTRAL_MOCK_TOKEN (o MESMO valor gravado no deployment)."
  exit 1
fi

SITE_URL="${CONVEX_SITE_URL:-http://127.0.0.1:3211}"
echo "▸ Gateway: $SITE_URL/channels/whatsapp/webhook (modo mock)"
echo "▸ Envio externo: DESLIGADO"
echo

# ── Os oito cenários ─────────────────────────────────────────────────────────
# id | telefone | nome | quando (min atrás) | texto
CENARIOS=(
"wamid.HOMOLOG.COMERCIAL.DECOR|5511988880001|Helena Prado|18|Oi! Vi o ALTAR no Instagram. Tenho uma empresa de decoração em Campinas e queria ver uma demonstração ainda esta semana, pode ser?"
"wamid.HOMOLOG.COMERCIAL.BUFFET|5511988880002|Rodrigo Tavares|95|Boa tarde. Sou do Buffet Villa Real. Vocês têm uma versão para buffet? Queria entender preços e o que entra no plano."
"wamid.HOMOLOG.ONBOARDING|5521977770003|Carla Menezes|240|Assinei ontem e estou perdida pra começar. Por onde eu cadastro meu primeiro evento e a equipe?"
"wamid.HOMOLOG.SUPORTE|5531966660004|Patrícia Lemos|420|A ficha técnica não está somando as flores do arranjo. Já refiz duas vezes e continua dando o mesmo número errado."
"wamid.HOMOLOG.FINANCEIRO|5541955550005|Juliana Berto|600|Bom dia! Chegou uma cobrança e eu achei que meu plano fosse o mensal antigo. Consigo ver o que foi cobrado?"
"wamid.HOMOLOG.OUVIDORIA|5551944440006|Marina Duarte|1500|Estou bem chateada. Perdi a tarde toda tentando subir as fotos do casamento e o sistema derrubou tudo duas vezes."
"wamid.HOMOLOG.PRODUTO|5561933330007|Fernanda Rocha|2800|Sugestão: seria ótimo exportar o orçamento em Excel pra mandar pro contador. Hoje só sai PDF."
"wamid.HOMOLOG.CEO|5571922220008|Beatriz Nunes|35|Preciso falar com o responsável. Tenho 14 decoradoras na minha rede e quero fechar contrato para todas, mas só se tiver condição especial e contrato assinado esta semana."
)

enviar() {
  local id="$1" telefone="$2" nome="$3" minutos="$4" texto="$5"
  local quando=$(( ($(date +%s) - minutos * 60) ))

  local payload
  payload=$(python3 - "$id" "$telefone" "$nome" "$quando" "$texto" <<'PY'
import json, sys
wamid, telefone, nome, quando, texto = sys.argv[1:6]
print(json.dumps({"entry": [{"changes": [{"value": {
    "metadata": {"phone_number_id": "MOCK"},
    "contacts": [{"wa_id": telefone, "profile": {"name": nome}}],
    "messages": [{"from": telefone, "id": wamid, "timestamp": quando,
                  "type": "text", "text": {"body": texto}}],
}}]}]}))
PY
)

  curl -sS --noproxy 127.0.0.1 --max-time 30 \
    -X POST "$SITE_URL/channels/whatsapp/webhook" \
    -H "Content-Type: application/json" \
    -H "X-Altar-Mock-Token: $MOCK_TOKEN" \
    -d "$payload"
  echo "  ← $nome"
}

echo "▸ Enviando os oito cenários pelo gateway…"
for cenario in "${CENARIOS[@]}"; do
  IFS='|' read -r id telefone nome minutos texto <<< "$cenario"
  enviar "$id" "$telefone" "$nome" "$minutos" "$texto"
done

echo
echo "▸ Aplicando a triagem (palpite fixo por cenário, sem chamar modelo)…"
node scripts/homologacao-triagem.mjs

echo
echo "▸ Reparando o índice de busca…"
npx convex run internal.communications.repararIndiceDeBusca '{}'

echo
echo "✔ Pronto. Abra /central e confira:"
echo "   · 8 conversas, 5 departamentos, 4 prioridades;"
echo "   · fila de aprovação com propostas pendentes;"
echo "   · tarefas abertas com prazo;"
echo "   · Ouvidoria com reclamação e pedido de funcionalidade;"
echo "   · uma conversa escalada para o CEO;"
echo "   · e o aviso de que NADA sai deste ambiente."
