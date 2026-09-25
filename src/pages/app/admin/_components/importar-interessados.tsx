import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Upload } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { LIVE_ALTAR, ORIGENS } from "@/convex/lib/campanha.ts";

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR UMA LISTA — COM O QUE VAI ACONTECER NA TELA ANTES
//
// ── POR QUE O PREVIEW NÃO É OPCIONAL ────────────────────────────────────────
// Uma importação que grava primeiro e mostra o resultado depois transforma um
// arquivo errado em duzentos registros errados, e limpar isso à mão é pior do
// que ter digitado tudo. O botão de importar só aparece depois de o servidor
// dizer quantas linhas entram, quantas são repetidas e quantas não valem.
//
// ── ISTO NÃO COLETA NADA ────────────────────────────────────────────────────
// A tela lê um arquivo que a pessoa já tem. Não acessa Instagram, não varre
// site, não raspa lista de ninguém. De onde veio o arquivo é responsabilidade
// de quem o trouxe.
// ─────────────────────────────────────────────────────────────────────────────

const ROTULO_DA_SITUACAO: Record<string, string> = {
  nova: "entra",
  duplicada: "repetida",
  invalida: "não entra",
};

export function ImportarInteressados({ onFechar }: { onFechar: () => void }) {
  const [conteudo, setConteudo] = useState("");
  const [campanha, setCampanha] = useState(LIVE_ALTAR.slug);
  const [origem, setOrigem] = useState("live");
  const [importando, setImportando] = useState(false);

  // `skip` enquanto não há arquivo: sem isto a consulta rodaria com string
  // vazia e voltaria "arquivo vazio" antes de a pessoa escolher nada.
  const preview = useQuery(
    api.admin.previewDeImportacao,
    conteudo ? { conteudo } : "skip",
  );
  const importar = useMutation(api.admin.importarInteressados);

  const lerArquivoEscolhido = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    try {
      setConteudo(await arquivo.text());
    } catch {
      toast.error("Não foi possível ler o arquivo.");
    }
  };

  const confirmar = async () => {
    setImportando(true);
    try {
      const r = await importar({
        conteudo,
        campanha: campanha || undefined,
        origem: origem as never,
      });
      toast.success(
        `${r.criados} ${r.criados === 1 ? "interessado importado" : "interessados importados"}.` +
          (r.duplicadas > 0 ? ` ${r.duplicadas} já existiam.` : "") +
          (r.invalidas > 0 ? ` ${r.invalidas} sem dados suficientes.` : ""),
      );
      onFechar();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível importar.",
      );
    } finally {
      setImportando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar lista de interessados</DialogTitle>
          <DialogDescription>
            CSV com uma coluna de <strong>nome</strong> e pelo menos e-mail ou telefone.
            Empresa, cidade, estado, Instagram, site e segmento entram quando existem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => {
              void lerArquivoEscolhido(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="block w-full cursor-pointer rounded-md border border-input bg-background p-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              Campanha
              <select
                value={campanha}
                onChange={(e) => setCampanha(e.target.value)}
                className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Nenhuma</option>
                <option value={LIVE_ALTAR.slug}>{LIVE_ALTAR.nome}</option>
              </select>
            </label>
            <label className="text-xs">
              Origem
              <select
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
              >
                {ORIGENS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {preview && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              {preview.erro ? (
                <p className="text-sm text-destructive">{preview.erro}</p>
              ) : (
                <>
                  <p className="text-sm">
                    <strong>{preview.resumo.novas}</strong> entram ·{" "}
                    <strong>{preview.resumo.duplicadas}</strong> já existem ·{" "}
                    <strong>{preview.resumo.invalidas}</strong> sem dados suficientes
                  </p>
                  {preview.ignoradas.length > 0 && (
                    // Dizer o que foi ignorado é melhor do que descartar
                    // calado: quem exportou a planilha reconhece a coluna.
                    <p className="text-xs text-muted-foreground">
                      Colunas ignoradas: {preview.ignoradas.join(", ")}
                    </p>
                  )}
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {preview.amostra.map((s) => (
                      <p key={s.dados.linha} className="text-xs">
                        <span className="text-muted-foreground">linha {s.dados.linha}</span>{" "}
                        {s.dados.name || "(sem nome)"}{" "}
                        <span
                          className={
                            s.tipo === "nova" ? "text-primary" : "text-muted-foreground"
                          }
                        >
                          — {ROTULO_DA_SITUACAO[s.tipo]}
                          {"motivo" in s ? `: ${s.motivo}` : ""}
                        </span>
                      </p>
                    ))}
                  </div>
                  {preview.resumo.total > preview.amostra.length && (
                    <p className="text-xs text-muted-foreground">
                      Mostrando as {preview.amostra.length} primeiras de{" "}
                      {preview.resumo.total}.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Quem já está cadastrado é <strong>pulado</strong>, nunca sobrescrito — a etapa
            e as anotações de quem já foi trabalhado continuam como estão. Nada é enviado:
            os importados entram na fila de contato, que continua esperando você.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar} className="cursor-pointer">
            Cancelar
          </Button>
          <Button
            onClick={() => void confirmar()}
            disabled={importando || !preview || !!preview.erro || preview.resumo.novas === 0}
            className="cursor-pointer gap-1.5"
          >
            <Upload className="size-4" />
            {importando
              ? "Importando…"
              : preview && !preview.erro
                ? `Importar ${preview.resumo.novas}`
                : "Importar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
