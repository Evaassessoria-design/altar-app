import { useCallback, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  validarArquivo,
  type ArquivoParaValidar,
  type TipoDeEnvio,
} from "@/lib/upload.ts";
import { motivoDaFalhaDoEnvio } from "@/convex/lib/arquivos.ts";

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
  /** Decide o teto de tamanho (ver convex/lib/arquivos.ts). */
  tipo: TipoDeEnvio;
  /** Tipos MIME aceitos. Vazio = o que o seletor da tela já restringiu. */
  aceitos?: readonly string[];
  /**
   * Extensões aceitas (".docx"). Vale em OU com o MIME: o do Office é
   * inconfiável e DOCX chega como `application/octet-stream` em máquina sem
   * Office. Sem isto, papelada legítima era recusada por palpite do sistema.
   */
  extensoes?: readonly string[];
};

export type ResultadoDoEnvio =
  | { ok: true; storageId: Id<"_storage"> }
  // `recuperavel`: vale oferecer "tentar de novo" com o MESMO arquivo? Rede e
  // prazo, sim. Arquivo grande demais ou de formato recusado, não — repetir
  // daria o mesmo não, e o botão seria uma promessa falsa.
  | { ok: false; motivo: string; recuperavel: boolean };

type RespostaDoPost = { ok: boolean; status: number; corpo: string; decorridoMs: number };

/**
 * O POST do arquivo, por XMLHttpRequest.
 *
 * ── POR QUE NÃO `fetch` ─────────────────────────────────────────────────────
 * `fetch` não informa progresso de SUBIDA. Com o teto de 20 MB isso passava;
 * com 100 MB, o envio pode levar um minuto inteiro, e um botão girando sem
 * dizer quanto falta é o que faz a pessoa clicar de novo, fechar a janela ou
 * achar que travou.
 *
 * Nunca rejeita: falha de rede vira `status: 0`, para quem chama decidir a
 * frase com o tempo decorrido em mãos (ver `motivoDaFalhaDoEnvio`).
 */
function postarArquivo(
  url: string,
  arquivo: File,
  aoProgredir: (fracao: number) => void,
): Promise<RespostaDoPost> {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) aoProgredir(e.loaded / e.total);
    };
    const terminar = () =>
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        corpo: xhr.responseText,
        decorridoMs: Date.now() - inicio,
      });
    xhr.onload = terminar;
    xhr.onerror = terminar;
    xhr.onabort = terminar;
    xhr.ontimeout = terminar;
    xhr.send(arquivo);
  });
}

export function useEnvioDeArquivo(
  gerarUrlDeUpload: () => Promise<string>,
  opcoes: EnvioOpcoes,
) {
  const [enviando, setEnviando] = useState(false);
  // Fração enviada, de 0 a 1. `null` fora de um envio — a tela não mostra
  // "0%" para quem nem escolheu arquivo.
  const [progresso, setProgresso] = useState<number | null>(null);
  const emCurso = useRef(false);

  const enviar = useCallback(
    async (arquivo: File): Promise<ResultadoDoEnvio> => {
      if (emCurso.current) {
        return { ok: false, motivo: "Já há um envio em andamento.", recuperavel: false };
      }

      const check = validarArquivo(arquivo as ArquivoParaValidar, opcoes);
      if (!check.ok) return { ...check, recuperavel: false };

      emCurso.current = true;
      setEnviando(true);
      setProgresso(0);
      try {
        // A URL é pedida AGORA, imediatamente antes do POST: ela expira em uma
        // hora, e reaproveitar a de uma tentativa anterior falharia no retry.
        const url = await gerarUrlDeUpload();
        const res = await postarArquivo(url, arquivo, setProgresso);
        // Conferir aqui é o que impede o `storageId` indefinido de viajar para
        // a mutation e explodir longe da causa.
        if (!res.ok) {
          return {
            ok: false,
            motivo: motivoDaFalhaDoEnvio({
              nome: arquivo.name,
              status: res.status,
              decorridoMs: res.decorridoMs,
            }),
            recuperavel: true,
          };
        }
        let storageId: Id<"_storage"> | undefined;
        try {
          storageId = (JSON.parse(res.corpo) as { storageId?: Id<"_storage"> }).storageId;
        } catch {
          storageId = undefined;
        }
        if (!storageId) {
          return {
            ok: false,
            motivo: `O envio de "${arquivo.name}" não foi concluído.`,
            recuperavel: true,
          };
        }
        return { ok: true, storageId };
      } catch {
        // `gerarUrlDeUpload` falhou (sessão caiu, paywall). Mensagem de gente,
        // e o botão volta no `finally`.
        return {
          ok: false,
          motivo: `Não foi possível enviar "${arquivo.name}". Verifique a conexão e tente de novo.`,
          recuperavel: true,
        };
      } finally {
        emCurso.current = false;
        setEnviando(false);
        setProgresso(null);
      }
    },
    [gerarUrlDeUpload, opcoes],
  );

  return { enviar, enviando, progresso };
}
