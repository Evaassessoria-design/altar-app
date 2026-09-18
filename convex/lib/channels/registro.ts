// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DE CANAIS
//
// Um único ponto de resolução "nome do canal → adaptador". Acrescentar
// Instagram, e-mail ou chat é escrever o arquivo do canal e somar UMA linha
// aqui. Nada mais no backend muda.
//
// O registro é montado a cada chamada, e não guardado em módulo: o ambiente
// de teste troca `process.env` entre casos, e um adaptador em cache
// congelaria a configuração do primeiro teste para todos os seguintes.
// ─────────────────────────────────────────────────────────────────────────────

import type { AdaptadorDeCanal, Canal } from "./tipos";
import { ehCanal } from "./tipos";
import { criarAdaptadorWhatsapp } from "./whatsapp";

type Fabrica = (env: Record<string, string | undefined>) => AdaptadorDeCanal;

const FABRICAS: Partial<Record<Canal, Fabrica>> = {
  whatsapp: criarAdaptadorWhatsapp,
  // instagram: criarAdaptadorInstagram,   ← BLOCO 5
  // email:     criarAdaptadorEmail,       ← BLOCO 5
};

/** Adaptador do canal, ou `null` quando o canal não existe neste build. */
export function adaptadorDe(
  canal: string,
  env: Record<string, string | undefined> = process.env,
): AdaptadorDeCanal | null {
  if (!ehCanal(canal)) return null;
  const fabrica = FABRICAS[canal];
  return fabrica ? fabrica(env) : null;
}

/** Canais que têm adaptador escrito — não necessariamente configurados. */
export function canaisDisponiveis(): Canal[] {
  return Object.keys(FABRICAS) as Canal[];
}
