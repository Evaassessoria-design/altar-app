// ─────────────────────────────────────────────────────────────────────────────
// O CÓDIGO E O DEPLOYMENT DIZEM A MESMA COISA?
//
// ── O DEFEITO QUE ISTO EXISTE PARA PEGAR ────────────────────────────────────
// Numa homologação visual, `/escritorio` quebrou com:
//
//     Could not find public function for 'escritorio:souDono'
//
// A função estava no código, exportada, pública, e no `api.d.ts` gerado. O
// typecheck passava, os 5.100 testes passavam, o CI estava verde. O que estava
// errado era o DEPLOYMENT: o DEV rodava uma versão antiga, sem 51 funções.
//
// ── POR QUE NENHUM TESTE PEGAVA ─────────────────────────────────────────────
// Porque teste roda contra o código. Nenhum deles sabe o que está publicado —
// e é exatamente nessa distância que este defeito mora.
//
// ── A ARMADILHA QUE CAUSOU ISSO ─────────────────────────────────────────────
// `npx convex codegen` imprime "Uploading functions to Convex..." e NÃO
// publica: ele sobe os módulos para analisar tipos e descarta. Quem lê a saída
// conclui, razoavelmente, que publicou. Quem publica é `npx convex dev --once`.
//
// Este módulo é só a COMPARAÇÃO, pura, sem rede e sem `process`. Quem busca os
// dois lados é `conferir.mjs`, e é essa separação que torna a regra testável.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As funções públicas declaradas no código.
 *
 * Recebe o conteúdo dos arquivos, não os lê: é o que permite testar a regra
 * sem tocar em disco.
 *
 * @param {Array<{arquivo: string, fonte: string}>} arquivos
 * @returns {string[]} identificadores no formato `modulo.js:funcao`
 */
export function funcoesNoCodigo(arquivos) {
  const achadas = new Set();
  for (const { arquivo, fonte } of arquivos) {
    // Só os TRÊS tipos públicos. `internalQuery` e irmãs não são alcançáveis
    // pelo navegador e não aparecem no spec — incluí-las produziria um
    // "faltando" permanente que ensinaria a ignorar a saída.
    const re = /export const (\w+)\s*=\s*(query|mutation|action)\s*\(/g;
    const modulo = arquivo.replace(/\.ts$/, "");
    let m;
    while ((m = re.exec(fonte)) !== null) {
      achadas.add(`${modulo}.js:${m[1]}`);
    }
  }
  return [...achadas].sort();
}

/**
 * As chamadas `api.modulo.funcao` que o frontend faz.
 *
 * É a outra metade da pergunta: não basta o deployment ter tudo o que o código
 * declara — ele precisa ter tudo o que a TELA chama. As duas listas quase
 * sempre coincidem, e o "quase" é onde a tela quebra.
 *
 * @param {Array<{arquivo: string, fonte: string}>} arquivos
 * @returns {string[]}
 */
export function chamadasDoFrontend(arquivos) {
  const achadas = new Set();
  for (const { fonte } of arquivos) {
    const re = /\bapi\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/g;
    let m;
    while ((m = re.exec(fonte)) !== null) {
      achadas.add(`${m[1]}.js:${m[2]}`);
    }
  }
  return [...achadas].sort();
}

/**
 * Os identificadores PÚBLICOS publicados, a partir de `convex function-spec`.
 *
 * ── DUAS FILTRAGENS, E A SEGUNDA CUSTOU UM RELATÓRIO ERRADO ─────────────────
 * Rotas HTTP não têm `identifier` — são endpoints, não funções chamáveis por
 * nome, e ficam de fora.
 *
 * As INTERNAS também. A primeira versão as incluía, e o resultado foi a
 * ferramenta anunciar "50 publicadas que não existem mais no código" num
 * deployment perfeitamente em dia: ela comparava as públicas do código contra
 * públicas E internas do deployment, e a diferença eram exatamente as 50
 * internas.
 *
 * Um resíduo falso é pior do que nenhum aviso: quem lê aprende que aquela
 * linha não significa nada.
 *
 * @param {{functions?: Array<{identifier?: string, visibility?: {kind?: string}}>}} spec
 * @returns {string[]}
 */
export function funcoesPublicadas(spec) {
  const fs = spec?.functions ?? [];
  return fs
    .filter((f) => typeof f?.identifier === "string")
    // `visibility` ausente é tratado como pública: o spec sempre a traz, e na
    // dúvida é melhor considerar publicada do que acusar falta que não existe.
    .filter((f) => (f.visibility?.kind ?? "public") === "public")
    .map((f) => f.identifier)
    .sort();
}

/**
 * O veredicto.
 *
 * ── POR QUE "SOBRANDO" NÃO É ERRO ───────────────────────────────────────────
 * Uma função publicada que não está mais no código é resíduo de um deploy
 * anterior. Ela não quebra tela nenhuma — no máximo ocupa espaço — e some no
 * próximo `convex dev`. Reportar como falha faria a ferramenta gritar sobre
 * algo inofensivo, e gritar sobre o inofensivo é como se ensina alguém a
 * ignorar o grito.
 *
 * O que quebra a tela é o contrário: a tela chamar o que não está lá.
 *
 * @param {{codigo: string[], publicadas: string[], chamadas: string[]}} entrada
 */
export function compararSincronia({ codigo, publicadas, chamadas }) {
  const noAr = new Set(publicadas);
  const noCodigo = new Set(codigo);

  const faltandoNoDeployment = codigo.filter((f) => !noAr.has(f));
  const chamadasQuebradas = chamadas.filter((c) => !noAr.has(c));
  const sobrandoNoDeployment = publicadas.filter((f) => !noCodigo.has(f));

  return {
    faltandoNoDeployment,
    /** O subconjunto que a TELA chama — é o que o usuário veria quebrar. */
    chamadasQuebradas,
    sobrandoNoDeployment,
    emDia: faltandoNoDeployment.length === 0 && chamadasQuebradas.length === 0,
    total: { codigo: codigo.length, publicadas: publicadas.length, chamadas: chamadas.length },
  };
}

/** O relatório, em linhas prontas para imprimir. */
export function relatorio(r, url) {
  const linhas = [];
  linhas.push(`Deployment: ${url}`);
  linhas.push(
    `Funções públicas no código: ${r.total.codigo} · publicadas: ${r.total.publicadas} · chamadas pela tela: ${r.total.chamadas}`,
  );
  linhas.push("");

  if (r.emDia) {
    linhas.push("✔ O deployment está em dia com o código.");
  } else {
    if (r.chamadasQuebradas.length > 0) {
      linhas.push(
        `✖ ${r.chamadasQuebradas.length} chamada(s) da TELA não existem no deployment —`,
      );
      linhas.push("  estas quebram a interface na cara de quem abrir:");
      for (const c of r.chamadasQuebradas) linhas.push(`    ${c}`);
      linhas.push("");
    }
    const soCodigo = r.faltandoNoDeployment.filter((f) => !r.chamadasQuebradas.includes(f));
    if (soCodigo.length > 0) {
      linhas.push(`⚠ ${soCodigo.length} função(ões) do código não publicadas (nenhuma tela chama):`);
      for (const f of soCodigo) linhas.push(`    ${f}`);
      linhas.push("");
    }
    linhas.push("Publique com:  npx convex dev --once");
    linhas.push("(`npx convex codegen` NÃO publica, apesar de imprimir \"Uploading functions\".)");
  }

  if (r.sobrandoNoDeployment.length > 0) {
    linhas.push("");
    linhas.push(
      `· ${r.sobrandoNoDeployment.length} publicada(s) que não existem mais no código (resíduo, some no próximo deploy)`,
    );
  }
  return linhas.join("\n");
}
