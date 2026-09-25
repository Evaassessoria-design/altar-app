// ─────────────────────────────────────────────────────────────────────────────
// "O DEV ESTÁ EM DIA COM O CÓDIGO?" — EM UM COMANDO
//
//     node scripts/sincronia/conferir.mjs
//
// Lê o código, pergunta ao deployment o que ele tem publicado, e compara. Sai
// com código 1 quando alguma tela chamaria função que não está lá — para poder
// entrar num passo de homologação sem ninguém precisar ler a saída.
//
// ── A TRAVA DE AMBIENTE ─────────────────────────────────────────────────────
// Recusa rodar contra produção. Este script não escreve nada, mas o hábito de
// apontar ferramenta para PROD é o que precede o comando que escreve.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  chamadasDoFrontend,
  compararSincronia,
  funcoesNoCodigo,
  funcoesPublicadas,
  relatorio,
} from "./comparar.mjs";

/** O deployment de PRODUÇÃO. Esta ferramenta nunca o consulta. */
const PROD = "mellow-goose-539";

function lerConvex() {
  return readdirSync("convex")
    .filter((a) => a.endsWith(".ts") && !a.includes(".test.") && a !== "schema.ts")
    .map((arquivo) => ({ arquivo, fonte: readFileSync(join("convex", arquivo), "utf-8") }));
}

function lerFrontend(dir = "src", acc = []) {
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) lerFrontend(caminho, acc);
    else if (/\.(tsx?|ts)$/.test(entrada) && !entrada.includes(".test.")) {
      acc.push({ arquivo: caminho, fonte: readFileSync(caminho, "utf-8") });
    }
  }
  return acc;
}

function main() {
  const alvo = process.env.CONVEX_DEPLOYMENT ?? "";
  if (alvo.includes(PROD) || alvo.startsWith("prod:")) {
    console.error(`RECUSADO: o alvo é produção (${alvo}). Esta ferramenta só olha DEV.`);
    process.exit(2);
  }

  let spec;
  try {
    const saida = execFileSync("npx", ["convex", "function-spec"], {
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
      shell: process.platform === "win32",
    });
    spec = JSON.parse(saida);
  } catch (e) {
    console.error("Não consegui perguntar ao deployment o que ele tem publicado.");
    console.error(String(e).slice(0, 400));
    process.exit(2);
  }

  if (String(spec.url ?? "").includes(PROD)) {
    console.error(`RECUSADO: o deployment respondeu como produção (${spec.url}).`);
    process.exit(2);
  }

  const r = compararSincronia({
    codigo: funcoesNoCodigo(lerConvex()),
    publicadas: funcoesPublicadas(spec),
    chamadas: chamadasDoFrontend(lerFrontend()),
  });

  console.log(relatorio(r, spec.url));
  // Só a quebra de TELA derruba o comando. Função do código sem chamador é
  // aviso: ela não estraga a experiência de ninguém hoje.
  process.exit(r.chamadasQuebradas.length > 0 ? 1 : 0);
}

main();
