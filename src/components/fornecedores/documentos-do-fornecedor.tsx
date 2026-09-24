import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ExternalLink, Loader2, Upload } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { useEnvioDeArquivo } from "@/hooks/use-upload.ts";
import { formatTimestamp } from "@/lib/safe-date.ts";
import {
  DOCUMENT_KINDS,
  labelDoTipo,
  ordenarDocumentos,
  type DocumentKind,
} from "@/lib/event-documents.ts";

// ─────────────────────────────────────────────────────────────────────────────
// "CONTRATEI A EMPRESA X. ONDE GUARDO O QUE VEIO DELA?"
//
// ── O QUE NÃO EXISTIA ───────────────────────────────────────────────────────
// A Pasta do Evento guardava UM arquivo por tipo — e o tipo era do EVENTO, não
// de quem mandou. Um casamento com empresa de móveis, floricultura e
// iluminação, cada uma com contrato e orçamento, cabia em dois arquivos: o
// segundo orçamento apagava o primeiro. O resto ficava no WhatsApp e no Drive.
//
// ── POR QUE AQUI, E NÃO SÓ NA PASTA ─────────────────────────────────────────
// Porque é aqui que ela pensa. Ela não pensa "vou anexar um orçamento ao
// evento e depois lembrar de quem era" — ela pensa "contratei a empresa X".
// Anexar de dentro do fornecedor já carimba a origem, e ninguém precisa
// escolher duas coisas para guardar uma.
//
// ── UM ARQUIVO, UM DONO ─────────────────────────────────────────────────────
// Não há cópia: é a MESMA tabela `contracts` da Pasta do Evento, com um
// vínculo a mais. O documento aparece nos dois lugares porque é o mesmo
// registro — classificar aqui muda lá no mesmo instante.
// ─────────────────────────────────────────────────────────────────────────────

/** Os tipos que fazem sentido vindos de um fornecedor. */
const TIPOS_DO_FORNECEDOR: readonly DocumentKind[] = [
  "contract",
  "budget",
  "addendum",
  "reference",
  "other",
];

export function DocumentosDoFornecedor({
  eventId,
  supplierId,
  companyName,
}: {
  eventId: Id<"events">;
  supplierId: Id<"eventSuppliers">;
  companyName: string;
}) {
  // A pasta INTEIRA do evento, e o recorte deste fornecedor em memória. Não é
  // "filtrar a página carregada": `listDocuments` traz todos os documentos do
  // evento, sem teto, então a conta não mente. Uma consulta por fornecedor
  // seria uma assinatura reativa por cartão aberto.
  const documentos = useQuery(api.contracts.listDocuments, { eventId });
  const gerarUrl = useMutation(api.contracts.generateUploadUrl);
  const salvar = useMutation(api.contracts.saveContract);
  const { enviar } = useEnvioDeArquivo(gerarUrl, {
    tipo: "documento",
    aceitos: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/",
    ],
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<DocumentKind>("budget");
  const [enviando, setEnviando] = useState(false);

  const meus = ordenarDocumentos((documentos ?? []).filter((d) => d.supplierId === supplierId));
  const jaTem = meus.some((d) => d.kind === tipo);

  const anexar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const envio = await enviar(arquivo);
      if (!envio.ok) {
        toast.error(envio.motivo);
        return;
      }
      await salvar({
        eventId,
        supplierId,
        storageId: envio.storageId,
        filename: arquivo.name,
        kind: tipo,
      });
      toast.success(`${labelDoTipo(tipo)} de ${companyName} guardado no evento.`);
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível anexar o arquivo.",
      );
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="border-t border-border pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Documentos desta contratação
      </p>

      {meus.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum arquivo ainda. Guarde aqui o contrato e o orçamento que a empresa mandou —
          no dia do evento eles estão com você, sem procurar no WhatsApp.
        </p>
      ) : (
        <div className="space-y-1.5">
          {meus.map((doc) => (
            <div
              key={doc._id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {labelDoTipo(doc.kind)}
                  </span>
                  {/* `break-words` e não `truncate`: nome de arquivo de
                      fornecedor costuma ser longo ("Orçamento_Mobiliário_
                      Marina_v3_final.pdf") e cortá-lo num telefone esconde
                      justamente o que distingue um do outro. */}
                  <p className="min-w-0 text-sm font-medium break-words">{doc.filename}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Anexado em {formatTimestamp(doc.uploadedAt)}
                </p>
              </div>
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Abrir ${doc.filename}`}
                  className="flex-shrink-0 cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as DocumentKind)}
          aria-label="Tipo do documento"
          className="h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-sm sm:w-40"
        >
          {DOCUMENT_KINDS.filter((d) => TIPOS_DO_FORNECEDOR.includes(d.kind)).map((d) => (
            <option key={d.kind} value={d.kind}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => void anexar(e.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer gap-1.5"
        >
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {enviando ? "Enviando..." : "Anexar"}
        </Button>
      </div>

      {/* A substituição é por (tipo, fornecedor): o orçamento desta empresa
          substitui o DELA, nunca o da floricultura. Avisar antes é mais
          honesto do que deixar a pessoa descobrir perdendo o anterior. */}
      {jaTem && (
        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
          Já existe {labelDoTipo(tipo).toLowerCase()} desta empresa — anexar outro substitui o
          atual.
        </p>
      )}
    </div>
  );
}
