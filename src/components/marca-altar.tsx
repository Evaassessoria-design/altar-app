import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A MARCA, EM UM LUGAR SÓ
//
// ── POR QUE COMPONENTE, PARA UMA `<img>` ────────────────────────────────────
// Porque eram CINCO cópias da mesma linha — barra lateral, cabeçalho do
// celular, cabeçalho da landing, rodapé da landing e, agora, o login. Todas
// apontando para `/icon/icon-192.png`, que era um PRINT de tela inicial de
// iPhone (860×1600, fundo branco, com a palavra "Altar" embaixo) espremido
// dentro de um quadrado de 32 pixels.
//
// Este repositório já aprendeu essa lição com o mapa de tipos de evento: cinco
// cópias, uma envelheceu, e um slug em inglês foi parar no PDF da cliente.
// Marca em cinco lugares é a mesma armadilha — a próxima tela copia a linha
// errada, e ninguém repara.
//
// ── O DEFEITO QUE O IPHONE MOSTROU ──────────────────────────────────────────
// A versão anterior usava `/brand/altar-simbolo-192.png`: o símbolo sobre a
// PLACA BEGE da arte. Dentro de uma caixa arredondada por CSS, isso produzia
// TRÊS molduras encaixadas —
//
//   caixa do CSS  →  placa bege  →  arco (que é parte do desenho)
//
// e a 32 px o olho lê aquilo como "uma telinha dentro de uma bolinha", não
// como uma marca. Foi exatamente o que a captura do aparelho registrou.
//
// A placa não estava errada: ela está CERTA no ícone instalado, onde o
// sistema operacional precisa de fundo opaco. Estava no lugar errado. Na
// interface, a superfície do produto já é o fundo.
//
// ── O ARQUIVO ───────────────────────────────────────────────────────────────
// `/brand/altar-simbolo.png` é a MESMA arte oficial recortada na tinta, com
// fundo transparente e 4% de margem técnica para o arco não encostar na borda.
// Nada foi redesenhado: mesmo traço, mesma espessura, mesma proporção. Ver
// `scripts/brand/gerar-icones.py`.
//
// ── POR QUE `dark:invert` ───────────────────────────────────────────────────
// A tinta da arte é oklch ≈ 0,2 — o MESMO valor do `--foreground` do tema
// claro. No claro, portanto, a marca aparece exatamente na cor dela.
//
// No tema escuro o `--card` é oklch 0,21: tinta escura sobre superfície
// escura desaparece. `invert` leva a tinta para ~oklch 0,95, que é o
// `--foreground` de lá. É o tratamento monocromático de sempre — a alternativa
// é uma marca invisível metade do tempo.
// ─────────────────────────────────────────────────────────────────────────────

/** O símbolo do ALTAR. `className` controla só o tamanho. */
export function MarcaAltar({ className }: { className?: string }) {
  return (
    <img
      src="/brand/altar-simbolo.png"
      alt="ALTAR"
      width={512}
      height={512}
      // `width`/`height` declarados evitam o pulo do layout enquanto a imagem
      // carrega — no cabeçalho fixo da landing isso empurra o menu inteiro.
      className={cn("object-contain dark:invert", className)}
    />
  );
}
