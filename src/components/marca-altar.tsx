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
// ── O ARQUIVO ───────────────────────────────────────────────────────────────
// `/brand/altar-simbolo-192.png` é a ARTE OFICIAL recortada no símbolo, com o
// bege da própria arte preenchendo o quadrado. Recorte técnico: nada foi
// redesenhado, e a proporção do desenho é a original.
//
// O fundo bege faz parte da identidade e vem junto — por isso o `rounded`, que
// transforma o quadrado num selo em vez de um retângulo solto sobre o tema
// escuro.
// ─────────────────────────────────────────────────────────────────────────────

/** O selo do ALTAR. `className` controla só o tamanho e o arredondamento. */
export function MarcaAltar({ className }: { className?: string }) {
  return (
    <img
      src="/brand/altar-simbolo-192.png"
      alt="ALTAR"
      width={192}
      height={192}
      // `width`/`height` declarados evitam o pulo do layout enquanto a imagem
      // carrega — no cabeçalho fixo da landing isso empurra o menu inteiro.
      className={cn("object-contain", className)}
    />
  );
}
