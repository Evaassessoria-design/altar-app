// ─────────────────────────────────────────────────────────────────────────────
// O CONCEITO DO EVENTO — as três frases que abrem o projeto
//
// ── NENHUM CAMPO NOVO ───────────────────────────────────────────────────────
// O briefing já tem um grupo chamado "Conceito do Evento"
// (`briefing-areas.ts`), com quatro campos, três deles úteis aqui:
//
//   decorStyle             → "Jardim contemporâneo"
//   colorPalette           → "Verde oliva e branco"
//   atmosphereDescription  → o parágrafo da atmosfera
//
// Os três são `visibility: ALL` — já podiam aparecer para a cliente antes
// desta rodada, no Caderno de Montagem. Eles estavam preenchidos e não
// apareciam em lugar nenhum do Projeto Visual: a decoradora escrevia o
// conceito do casamento no Questionário e depois abria o projeto sem ele.
//
// O quarto campo do grupo, `referenceImages`, é DELIBERADAMENTE ignorado: é
// uma caixa de texto de URLs, anterior à Galeria, e trazê-la para cá criaria
// um segundo lugar para guardar referência — o defeito que a rodada do
// ambiente acabou de tirar do repositório.
//
// ── POR QUE UMA FUNÇÃO, E NÃO TRÊS LEITURAS NA TELA ─────────────────────────
// Porque a tela é virada para a noiva. `getBriefing` devolve a linha INTEIRA,
// e nela moram contato do espaço, seguro, pagamento e observação interna —
// campos `TEAM_ONLY` que a decoradora nunca mandaria para a cliente.
//
// Então a fronteira mora na TRANSFORMAÇÃO, como em `paraOCliente`: esta
// função CONSTRÓI um objeto novo, campo a campo. Não existe `...briefing`
// aqui, e essa ausência é a regra — um campo interno acrescentado ao schema
// amanhã não entra neste objeto por acidente, porque nada entra por acidente.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
// Não reescreve texto, não resume, não traduz, não chama IA e NÃO transforma
// "verde oliva e branco" em amostras de cor. Interpretar a paleta exigiria
// adivinhar que verde é esse — e seria cor inventada apresentada como decisão
// dela. O texto aparece como ela escreveu.
// ─────────────────────────────────────────────────────────────────────────────

/** Só os campos que este módulo lê. O resto da linha não entra no tipo. */
export type BriefingComConceito = {
  decorStyle?: string;
  colorPalette?: string;
  atmosphereDescription?: string;
};

export type ConceitoDoEvento = {
  /** "Jardim contemporâneo" — o título do conceito. */
  estilo?: string;
  /** "Verde oliva e branco" — TEXTO, nunca amostra de cor. */
  paleta?: string;
  /** O parágrafo. Vem de um textarea, então pode ter várias linhas. */
  atmosfera?: string;
};

const textoLimpo = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * O conceito, ou `null` quando não há nenhum.
 *
 * `null` é a resposta honesta para um briefing em branco: a seção inteira
 * desaparece em vez de imprimir três rótulos sem valor. Um evento sem conceito
 * escrito não é um evento com defeito — é o estado de todo evento novo.
 */
export function conceitoDoEvento(
  briefing: BriefingComConceito | null | undefined,
): ConceitoDoEvento | null {
  if (!briefing) return null;

  const conceito: ConceitoDoEvento = {
    estilo: textoLimpo(briefing.decorStyle),
    paleta: textoLimpo(briefing.colorPalette),
    atmosfera: textoLimpo(briefing.atmosphereDescription),
  };

  const temAlgo = !!(conceito.estilo || conceito.paleta || conceito.atmosfera);
  return temAlgo ? conceito : null;
}

/**
 * A linha curta do conceito: estilo e paleta, separados por ponto médio.
 *
 * `undefined` quando nenhum dos dois existe — a tela não desenha separador
 * solto nem "·" pendurado sem texto de um dos lados.
 */
export function linhaDoConceito(conceito: ConceitoDoEvento): string | undefined {
  const partes = [conceito.estilo, conceito.paleta].filter(
    (v): v is string => !!v,
  );
  return partes.length > 0 ? partes.join("  ·  ") : undefined;
}
