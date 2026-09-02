import { useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { FolderOpen, Upload, ExternalLink, Loader2, Handshake, FileWarning } from "lucide-react";
import {
  ordenarDocumentosDoLead,
  rotuloDoTipo,
  tamanhoLegivel,
} from "@/convex/lib/tiposDeDocumento.ts";
import {
  DOCUMENT_KINDS,
  labelDoTipo,
  ordenarDocumentos,
  type DocumentKind,
} from "@/lib/event-documents.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PASTA DO EVENTO
//
// `contracts.listDocuments` já existia no backend, comentada como "preparação
// para a Pasta do Evento", e nenhuma tela a chamava. O `saveContract` já
// aceitava cinco tipos de documento (contrato, aditivo, orçamento, referência,
// outro) — mas a interface só sabia anexar contrato, então os outros quatro
// eram inalcançáveis.
//
// Esta seção mostra SÓ o que existe de verdade: arquivos realmente anexados.
// Nada de pasta falsa com categorias vazias prometendo função futura.
// ─────────────────────────────────────────────────────────────────────────────

export function EventDocuments({ eventId }: { eventId: Id<"events"> }) {
  const documentos = useQuery(api.contracts.listDocuments, { eventId });
  // Documentos que vieram da NEGOCIAÇÃO (proposta, comprovante do sinal). Eles
  // continuam morando no lead — o evento só os enxerga. Ver
  // convex/leadDocuments.ts: copiar criaria dois donos para o mesmo arquivo.
  const daNegociacao = useQuery(api.leadDocuments.listForEvent, { eventId });
  const generateUploadUrl = useMutation(api.contracts.generateUploadUrl);
  const saveContract = useMutation(api.contracts.saveContract);

  const inputRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<DocumentKind>("contract");
  const [enviando, setEnviando] = useState(false);

  const jaTemDesteTipo = documentos?.some((d) => (d.kind ?? "contract") === tipo) ?? false;

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setEnviando(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("upload");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await saveContract({ eventId, storageId, filename: file.name, kind: tipo });
      toast.success(`${labelDoTipo(tipo)} anexado à pasta do evento.`);
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
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <FolderOpen className="size-4 text-primary" /> Pasta do evento
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Contrato, aditivos, orçamentos e referências deste evento em um lugar só
        </p>
      </div>

      {documentos === undefined ? (
        <div className="px-5 py-4 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : documentos.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm font-medium">Nenhum arquivo anexado ainda</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Guarde aqui o contrato assinado, os aditivos e o orçamento aprovado. No dia do
            evento a informação está com você, sem procurar no WhatsApp.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {ordenarDocumentos(documentos).map((doc) => (
            <div key={doc._id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {labelDoTipo(doc.kind)}
                  </span>
                  <p className="text-sm font-medium truncate">{doc.filename}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Anexado em {new Date(doc.uploadedAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground flex-shrink-0"
                  aria-label={`Abrir ${doc.filename}`}
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Vindos do funil: leitura apenas. Quem anexa e exclui é a tela da
          negociação — dois donos para o mesmo arquivo geraria exclusão órfã. */}
      {daNegociacao && daNegociacao.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 pt-3 pb-1 flex items-center gap-2">
            <Handshake className="size-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              Da negociação (funil) — anexados antes do evento existir
            </p>
          </div>
          <div className="divide-y divide-border">
            {ordenarDocumentosDoLead(daNegociacao).map((doc) => {
              const rotulo = rotuloDoTipo(doc.documentType);
              const tamanho = tamanhoLegivel(doc.fileSize);
              return (
                <div key={doc._id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {rotulo && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                          {rotulo}
                        </span>
                      )}
                      <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Anexado em {new Date(doc.uploadedAt).toLocaleDateString("pt-BR")}
                      {tamanho && ` · ${tamanho}`}
                    </p>
                    {!doc.arquivoDisponivel && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                        <FileWarning className="size-3" /> Arquivo indisponível
                      </p>
                    )}
                  </div>
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground flex-shrink-0"
                      aria-label={`Abrir ${doc.fileName}`}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 py-4 border-t border-border flex flex-col sm:flex-row gap-2 sm:items-center">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as DocumentKind)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm cursor-pointer sm:w-44"
        >
          {DOCUMENT_KINDS.map((d) => (
            <option key={d.kind} value={d.kind}>
              {d.label}
            </option>
          ))}
        </select>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer gap-1.5"
        >
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {enviando ? "Enviando..." : "Anexar arquivo"}
        </Button>

        {/* O backend substitui o documento do mesmo tipo. Avisar antes é mais
            honesto do que deixar a pessoa descobrir perdendo o anterior. */}
        {jaTemDesteTipo && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Já existe um arquivo de {labelDoTipo(tipo).toLowerCase()} — anexar outro substitui o
            atual.
          </p>
        )}
      </div>
    </div>
  );
}
