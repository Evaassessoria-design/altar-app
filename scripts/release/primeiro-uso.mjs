// ─────────────────────────────────────────────────────────────────────────────
// "O RELEASE DE OUTUBRO JÁ FOI USADO DE VERDADE?" — SÓ LEITURA
//
//     node scripts/release/primeiro-uso.mjs <deployment>
//     node scripts/release/primeiro-uso.mjs mellow-goose-539
//
// Conta, tabela por tabela, os registros que usam um campo ou valor que o
// backend anterior (50926a8) NÃO conhece. É a pergunta que decide se a volta
// do backend ainda é possível sem perder regra — ver
// docs/release-2026-10-candidato.md, seção 8.
//
//   · TUDO ZERO  → ninguém usou as novidades: o backend 50926a8 PURO volta,
//                  e não há regra nova para perder.
//   · ALGUM > 0  → houve uso real: voltar o backend faz o código antigo
//                  ignorar ou contrariar esses registros. Não volte o backend;
//                  volte só o frontend e corrija para a frente.
//
// Usa `convex run --inline-query`, que é SANDBOXED e só lê. Varre paginado:
// nenhuma consulta lê a tabela inteira de uma vez. Não imprime conteúdo de
// registro nenhum — só contagens.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const CLI = join(dirname(require.resolve("convex/package.json")), "bin", "main.js");

const deployment = process.argv[2];
if (!deployment) {
  console.error("Uso: node scripts/release/primeiro-uso.mjs <deployment>");
  process.exit(2);
}

/** Tabela → expressão JS (sobre `d`) que diz se o registro usa algo novo. */
const MARCAS = {
  events: "d.contractedValue !== undefined",
  transactions: "(d.recebimentos && d.recebimentos.length > 0) || d.chaveDoPlanejamento !== undefined",
  landingLeads: "d.descadastradoEm !== undefined",
  collectionItems:
    "d.emManutencao !== undefined || d.emLimpeza !== undefined || d.indisponivel !== undefined || d.emConferencia !== undefined",
  collectionAdjustments:
    '["manutencao_envio","manutencao_retorno","manutencao_descarte","condicao"].includes(d.tipo)' +
    " || d.manutencaoAntes !== undefined || d.manutencaoDepois !== undefined || d.condicaoDe !== undefined" +
    " || d.condicaoPara !== undefined || d.quantidadeMovida !== undefined || d.fotoStorageId !== undefined",
  collectionReservations: "d.conferidoEm !== undefined || d.retornoAConferir !== undefined",
};

function contar(tabela, marca) {
  let cursor = "null";
  let total = 0;
  let marcados = 0;
  for (let pagina = 0; pagina < 10_000; pagina++) {
    const q =
      `const p = await ctx.db.query("${tabela}").paginate({ cursor: ${cursor}, numItems: 500 }); ` +
      `return { n: p.page.length, m: p.page.filter((d) => ${marca}).length, fim: p.isDone, c: p.continueCursor };`;
    // O CLI do Convex chamado pelo próprio Node, SEM shell: com `npx` no
    // Windows o shell desmontava as aspas da consulta.
    const saida = execFileSync(
      process.execPath,
      [CLI, "run", "--deployment", deployment, "--inline-query", q],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    // A resposta vem em JSON de várias linhas, depois de eventuais avisos do CLI.
    const r = JSON.parse(saida.slice(saida.indexOf("{")));
    total += r.n;
    marcados += r.m;
    if (r.fim) break;
    cursor = JSON.stringify(r.c);
  }
  return { total, marcados };
}

let usado = false;
console.log(`Deployment: ${deployment}`);
for (const [tabela, marca] of Object.entries(MARCAS)) {
  const { total, marcados } = contar(tabela, marca);
  if (marcados > 0) usado = true;
  console.log(`  ${tabela.padEnd(24)} ${String(marcados).padStart(6)} com campo novo · ${total} lidos`);
}
console.log(
  usado
    ? "\n✖ HOUVE USO REAL. Não volte o backend: volte só o frontend e corrija para a frente."
    : "\n✔ Nenhum uso das novidades. O backend 50926a8 puro ainda pode voltar.",
);
