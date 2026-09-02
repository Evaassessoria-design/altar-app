import { useRef, useState } from "react";
import { formatTimestamp } from "@/lib/safe-date.ts";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  TIPOS_DE_DOCUMENTO_DO_LEAD,
  motivoParaRecusarArquivo,
  ordenarDocumentosDoLead,
  rotuloDoTipo,
  tamanhoLegivel,
  type TipoDeDocumentoDoLead,
} from "@/convex/lib/tiposDeDocumento.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ExternalLink, FileWarning, Loader2, Paperclip, Trash2, Upload } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTOS DO LEAD
//
// A papelada da negociação (proposta enviada, contrato assinado, comprovante
// do sinal) existia antes de o evento existir e não tinha onde morar: a "Pasta
// do evento" exige `eventId`. Na prática ficava no WhatsApp.
//
// Decisões visíveis nesta tela:
//  · o arquivo que sumiu do storage NÃO some da lista — aparece marcado, com o
//    botão de remover, para a decoradora limpar a linha morta;
//  · converter o lead em evento não move nada: o evento passa a ENXERGAR estes
//    mesmos arquivos (uma cópia criaria dois donos para o mesmo arquivo);
//  · excluir é imediato e definitivo, então o botão pergunta antes.
// ─────────────────────────────────────────────────────────────────────────────

export function LeadDocumentsDialog({
  leadId,
  clientName,
  open,
  onClose,
}: {
  leadId: Id<"leads">;
  clientName: string;
  open: boolean;
  onClose: () => void;
}) {
  const documentos = useQuery(api.leadDocuments.list, open ? { leadId } : "skip");
  const generateUploadUrl = useMutation(api.leadDocuments.generateUploadUrl);
  const save = useMutation(api.leadDocuments.save);
  const remove = useMutation(api.leadDocuments.remove);

  const inputRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<TipoDeDocumentoDoLead>("proposta");
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const handleUpload = async (arquivo: File | undefined) => {
    // A recusa acontece ANTES de gastar uma URL de upload: um arquivo de 300 MB
    // falharia no meio da transferência, sem mensagem que ajude.
    const recusa = motivoParaRecusarArquivo(arquivo ?? null);
    if (recusa) {
      if (arquivo) toast.error(recusa);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const file = arquivo!;

    setEnviando(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("upload");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await save({
        leadId,
        storageId,
        fileName: file.name,
        documentType: tipo,
        mimeType: file.type || undefined,
        fileSize: file.size,
      });
      toast.success(`${rotuloDoTipo(tipo)} anexado à negociação.`);
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

  const handleRemove = async (id: Id<"leadDocuments">, nome: string) => {
    if (!window.confirm(`Excluir "${nome}"? O arquivo é apagado definitivamente.`)) return;
    setRemovendo(id);
    try {
      const r = await remove({ id });
      toast.success(r.removido ? "Documento excluído." : "Este documento já havia sido excluído.");
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível excluir.",
      );
    } finally {
      setRemovendo(null);
    }
  };

  const lista = documentos ? ordenarDocumentosDoLead(documentos) : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="size-4 text-primary" /> Documentos — {clientName}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Proposta, contrato assinado e comprovantes desta negociação. Ao converter em evento,
          eles continuam aqui e aparecem também na página do evento.
        </p>

        {lista === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : lista.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium">Nenhum documento anexado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Anexe a proposta enviada para não depender do histórico do WhatsApp.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-72 overflow-y-auto">
            {lista.map((doc) => {
              const rotulo = rotuloDoTipo(doc.documentType);
              const tamanho = tamanhoLegivel(doc.fileSize);
              return (
                <div key={doc._id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {rotulo && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                          {rotulo}
                        </span>
                      )}
                      <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTimestamp(doc.uploadedAt)}
                      {tamanho && ` · ${tamanho}`}
                    </p>
                    {/* O arquivo pode ter sumido do storage (upload interrompido,
                        exclusão pela metade). A linha continua visível para poder
                        ser removida — esconder viraria lixo invisível e cobrado. */}
                    {!doc.arquivoDisponivel && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                        <FileWarning className="size-3" /> Arquivo indisponível
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {doc.url && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                        aria-label={`Abrir ${doc.fileName}`}
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                    <button
                      onClick={() => void handleRemove(doc._id, doc.fileName)}
                      disabled={removendo === doc._id}
                      aria-label={`Excluir ${doc.fileName}`}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      {removendo === doc._id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-border pt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeDocumentoDoLead)}
            aria-label="Tipo do documento"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm cursor-pointer sm:w-44"
          >
            {TIPOS_DE_DOCUMENTO_DO_LEAD.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
