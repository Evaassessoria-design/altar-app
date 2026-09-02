import { useCallback, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  validarArquivo,
  type ArquivoParaValidar,
  type TipoDeEnvio,
} from "@/lib/upload.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ENVIO DE ARQUIVO — os três passos, num lugar só
//
// Toda tela que anexa arquivo fazia exatamente a mesma dança:
//
//   1. pedir uma URL de upload ao Convex;
//   2. POST do arquivo nela;
//   3. ler o `storageId` da resposta e passar para a mutation da tela.
//
// Estava copiada em sete telas — galeria, documentos do evento, documentos do
// lead, planta, item de montagem, logo do fornecedor e logo da empresa. E as
// cópias já tinham divergido: algumas conferiam `res.ok`, outras não. A que
// não conferia seguia em frente com um `storageId` indefinido e o erro
// aparecia depois, longe da causa, como se fosse problema do formulário.
//
// O passo 3 continua com cada tela: o que se faz com o arquivo depois de
// guardado é diferente em cada uma, e um "salvador genérico" só empurraria
// essa diferença para dentro de um `if`.
//
// TRAVA DE CLIQUE REPETIDO: `enviando` é uma ref, não só estado. Estado do
// React só muda no próximo render — dois toques rápidos no mesmo botão
// passariam os dois pela checagem e o arquivo subiria duas vezes.
// ─────────────────────────────────────────────────────────────────────────────

export type EnvioOpcoes = {
  /** Decide o teto de tamanho (ver lib/upload.ts). */
  tipo: TipoDeEnvio;
  /** Tipos MIME aceitos. Vazio = o que o seletor da tela já restringiu. */
  aceitos?: readonly string[];
};

export type ResultadoDoEnvio =
  | { ok: true; storageId: Id<"_storage"> }
  | { ok: false; motivo: string };

export function useEnvioDeArquivo(
  gerarUrlDeUpload: () => Promise<string>,
  opcoes: EnvioOpcoes,
) {
  const [enviando, setEnviando] = useState(false);
  const emCurso = useRef(false);

  const enviar = useCallback(
    async (arquivo: File): Promise<ResultadoDoEnvio> => {
      if (emCurso.current) {
        return { ok: false, motivo: "Já há um envio em andamento." };
      }

      const check = validarArquivo(arquivo as ArquivoParaValidar, opcoes);
      if (!check.ok) return check;

      emCurso.current = true;
      setEnviando(true);
      try {
        const url = await gerarUrlDeUpload();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": arquivo.type || "application/octet-stream" },
          body: arquivo,
        });
        // Conferir aqui é o que impede o `storageId` indefinido de viajar para
        // a mutation e explodir longe da causa.
        if (!res.ok) {
          return { ok: false, motivo: `Não foi possível enviar "${arquivo.name}".` };
        }
        const { storageId } = (await res.json()) as { storageId?: Id<"_storage"> };
        if (!storageId) {
          return { ok: false, motivo: `O envio de "${arquivo.name}" não foi concluído.` };
        }
        return { ok: true, storageId };
      } catch {
        // Rede caiu no meio. Mensagem de gente, e o botão volta no `finally`.
        return {
          ok: false,
          motivo: `Não foi possível enviar "${arquivo.name}". Verifique a conexão e tente de novo.`,
        };
      } finally {
        emCurso.current = false;
        setEnviando(false);
      }
    },
    [gerarUrlDeUpload, opcoes],
  );

  return { enviar, enviando };
}
