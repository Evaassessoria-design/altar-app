import { globSync, readFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// AS TRAVAS DE LEITURA DE FONTE PRECISAM RODAR NOS DOIS SISTEMAS
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// Seis travas enumeravam arquivos chamando `find` e `grep` por `execSync`, e
// uma sétima comparava caminhos com barra normal. No Linux e no CI isso passa;
// no Windows, `find` e `grep` não existem no `cmd.exe` e o separador é `\`.
//
// O resultado não era um teste vermelho — era pior: SETE ARQUIVOS DE TESTE
// que nem chegavam a carregar. A pessoa rodava `pnpm test` no PC dela, via
// "6 failed" de infraestrutura no meio do relatório e parava de ler. As travas
// que protegem campo longo, data na tela, upload duplicado e o caminho de
// volta de cada tela do evento estavam DESLIGADAS na máquina onde o produto é
// de fato conferido antes de subir.
//
// ── POR QUE AQUI, E NÃO UM HELPER POR ARQUIVO ───────────────────────────────
// Quatro travas pediam exatamente a mesma lista ("as telas do app"), e quatro
// cópias da enumeração divergiriam na primeira pasta nova — uma trava passaria
// a cobrir um diretório que a outra ignora, e ninguém notaria.
//
// Mora ao lado de `vitest.setup.ts` de propósito: é infraestrutura de teste,
// não código de produto. Não está em `src/lib/`, que é varrido pelas travas de
// arquitetura, e não termina em `.test.ts`, então o vitest não o executa.
//
// ── O QUE ESTE MÓDULO NÃO É ─────────────────────────────────────────────────
// Não é framework de teste. São três funções que devolvem lista de caminho, e
// nenhuma delas sabe o que as travas fazem com eles.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caminho sempre com barra normal, em qualquer sistema.
 *
 * `globSync` devolve `src\pages\app\funil\page.tsx` no Windows, e as travas
 * comparam com literais escritos à mão (`"src/pages/app/funil/page.tsx"`). Sem
 * isto, uma delas falhava só no PC da Eva — dizendo que a palavra "lead" tinha
 * escapado para outra tela, quando o que escapara era a barra invertida.
 */
export function comBarraNormal(caminho: string): string {
  return caminho.split("\\").join("/");
}

/** Ordena para a lista não depender da ordem do sistema de arquivos. */
function normalizar(caminhos: readonly string[]): string[] {
  return caminhos.map(comBarraNormal).sort();
}

/**
 * As telas e componentes do aplicativo — `.tsx`, sem os arquivos de teste.
 *
 * É a lista que `campos-longos`, `date-rendering`, `estados-e-submits` e
 * `upload-telas` usavam via `find src/pages src/components`.
 */
export function arquivosDeTela(): string[] {
  return normalizar(
    globSync(["src/pages/**/*.tsx", "src/components/**/*.tsx"]).filter(
      (f) => !f.includes(".test."),
    ),
  );
}

/**
 * As páginas internas de um evento — `src/pages/app/events/[id]/algo/page.tsx`.
 *
 * O `find` original usava `-mindepth 2` para deixar de fora a própria página
 * do evento, que é o DESTINO do caminho de volta e não precisa de um para si
 * mesma. Os dois níveis do padrão fazem o mesmo recorte.
 *
 * ── POR QUE CURINGA E DEPOIS FILTRO, EM VEZ DE ESCAPAR OS COLCHETES ─────────
 * Em glob, colchete é classe de caracteres: `[id]` casaria as letras `i` e
 * `d`, nunca a pasta chamada `[id]`. Escapar também não resolve — medido nesta
 * máquina, a versão escapada devolve ZERO arquivo.
 *
 * E zero é o pior resultado possível aqui: uma trava que enumera lista vazia
 * passa calada, sem nunca acusar nada. É por isso que `evento-no-centro` exige
 * um mínimo de páginas antes de conferir qualquer uma delas.
 */
export function paginasInternasDoEvento(): string[] {
  return normalizar(globSync("src/pages/app/events/*/*/page.tsx")).filter((f) =>
    f.includes("/[id]/"),
  );
}

/**
 * Os arquivos de `src` que contêm um termo — o `grep -rl` das travas.
 *
 * Ignora os próprios arquivos de teste: uma trava que proíbe um termo precisa
 * CITÁ-LO para proibi-lo, e sem esta exclusão ela acusaria a si mesma. É a
 * quinta vez que uma leitura de fonte neste repositório tropeça no próprio
 * texto, e agora a regra mora num lugar só.
 */
export function arquivosQueContem(termo: string): string[] {
  return normalizar(
    globSync("src/**/*.{ts,tsx}")
      .filter((f) => !f.includes(".test."))
      .filter((f) => readFileSync(f, "utf-8").includes(termo)),
  );
}
