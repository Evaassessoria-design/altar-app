import { useEffect, useState } from "react";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Loader2, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Extrai o texto de um documento (contrato) a partir da URL armazenada.
// PDF com texto selecionável → pdfjs. Arquivo texto (.txt) → decode direto.
// PDF digitalizado/imagem (sem texto) → retorna vazio (tratado como "precisa OCR").
async function extractDocumentText(url: string): Promise<{ text: string; scannedPdf: boolean }> {
  const buf = await (await fetch(url)).arrayBuffer();
  const isPdf = new TextDecoder().decode(buf.slice(0, 5)).startsWith("%PDF");
  if (!isPdf) {
    return { text: new TextDecoder().decode(buf).trim(), scannedPdf: false };
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  const trimmed = text.trim();
  return { text: trimmed, scannedPdf: trimmed.length === 0 };
}

// Marcadores de "informação indefinida" — viram pendências (não inventamos valor).
const UNDEFINED_MARKERS = ["a definir", "a confirmar", "não informado", "nao informado", "confirmar", "posteriormente", "a combinar"];
const isUndefinedVal = (v?: string) =>
  !!v && UNDEFINED_MARKERS.some((m) => v.toLowerCase().includes(m));

type Extracted = {
  client: { name?: string; phone?: string; email?: string };
  event: { name?: string; date?: string; location?: string };
  finance: {
    total?: number;
    downPayment?: number;
    installments: { description?: string; amount?: number; dueDate?: string }[];
    paymentMethod?: string;
  };
  contracted: { item: string; quantity?: number }[];
  addendum: { item: string; quantity?: number; change?: string }[];
  decor: {
    style?: string;
    colorPalette?: string;
    environments?: string;
    items: { category?: string; item: string; quantity?: number }[];
    notes?: string;
  };
};

const NI = "Não identificado";

export function ContractImportDialog({
  event,
  contractUrl,
  onClose,
}: {
  event: Doc<"events">;
  contractUrl: string;
  onClose: () => void;
}) {
  const extract = useAction(api.ai.extractContractData);
  const updateEvent = useMutation(api.events.update);
  const createReceivables = useMutation(api.financeiro.createReceivablesFromContract);
  const saveImport = useMutation(api.events.saveContractImport);
  const upsertBriefingFields = useMutation(api.briefing.upsertBriefingFields);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Extracted | null>(null);
  const [saving, setSaving] = useState(false);

  // Campos revisáveis (cliente + evento).
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");

  // Campos revisáveis (decoração/briefing).
  const [decorStyle, setDecorStyle] = useState("");
  const [decorColorPalette, setDecorColorPalette] = useState("");
  const [decorEnvironments, setDecorEnvironments] = useState("");
  const [decorNotes, setDecorNotes] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { text, scannedPdf } = await extractDocumentText(contractUrl);
        if (!active) return;
        if (scannedPdf) {
          setError("Este PDF parece ser digitalizado/imagem (sem texto selecionável). Envie um PDF com texto ou uma versão em texto para a IA conseguir ler.");
          setLoading(false);
          return;
        }
        if (!text) {
          setError("Não foi possível extrair texto do documento.");
          setLoading(false);
          return;
        }
        const result = (await extract({ eventId: event._id, contractText: text })) as Extracted;
        if (!active) return;
        setData(result);
        setClientName(result.client?.name ?? "");
        setClientPhone(result.client?.phone ?? "");
        setEventName(result.event?.name ?? "");
        setEventDate(result.event?.date ?? "");
        setEventLocation(result.event?.location ?? "");
        setDecorStyle(result.decor?.style ?? "");
        setDecorColorPalette(result.decor?.colorPalette ?? "");
        setDecorEnvironments(result.decor?.environments ?? "");
        setDecorNotes(result.decor?.notes ?? "");
      } catch {
        if (active) setError("Não foi possível ler o contrato com IA. Verifique se a chave de IA (ALTAR_AI_API_KEY) está configurada no Convex.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPendings = (d: Extracted): string[] => {
    const p: string[] = [];
    if (isUndefinedVal(d.event?.location)) p.push("Confirmar local do evento");
    if (isUndefinedVal(d.event?.date)) p.push("Confirmar data do evento");
    for (const it of d.contracted ?? []) if (isUndefinedVal(it.item)) p.push(`Definir: ${it.item}`);
    for (const it of d.addendum ?? []) if (isUndefinedVal(it.item)) p.push(`Confirmar (adendo): ${it.item}`);
    return p.slice(0, 12);
  };

  const handleConfirm = async () => {
    if (!data) return;
    setSaving(true);
    try {
      // 1) Atualiza cliente + evento (apenas campos preenchidos).
      const patch: {
        id: Id<"events">;
        clientName?: string;
        clientPhone?: string;
        name?: string;
        date?: string;
        location?: string;
      } = { id: event._id };
      if (clientName.trim()) patch.clientName = clientName.trim();
      if (clientPhone.trim()) patch.clientPhone = clientPhone.trim();
      if (eventName.trim()) patch.name = eventName.trim();
      if (eventDate.trim()) patch.date = eventDate.trim();
      if (eventLocation.trim() && !isUndefinedVal(eventLocation)) patch.location = eventLocation.trim();
      await updateEvent(patch);

      // 2) Contas a receber (entrada + parcelas), com dedup no backend.
      const entries: { description: string; amount: number; date: string }[] = [];
      if (data.finance?.downPayment && data.finance.downPayment > 0) {
        entries.push({ description: "Entrada", amount: data.finance.downPayment, date: eventDate || new Date().toISOString().slice(0, 10) });
      }
      for (const inst of data.finance?.installments ?? []) {
        if (inst.amount && inst.amount > 0) {
          entries.push({
            description: inst.description?.trim() || "Parcela",
            amount: inst.amount,
            date: inst.dueDate || eventDate || new Date().toISOString().slice(0, 10),
          });
        }
      }
      let financeMsg = "";
      if (entries.length > 0) {
        const r = (await createReceivables({ eventId: event._id, entries })) as { created: number; alreadyExists?: boolean };
        financeMsg = r.alreadyExists
          ? " Estas parcelas já parecem estar cadastradas."
          : ` ${r.created} conta(s) a receber criada(s).`;
      }

      // 3) Pendências + status de importação.
      const pendings = buildPendings(data);
      await saveImport({ id: event._id, analyzedAt: new Date().toISOString(), pendings });

      // 4) Decoração/briefing (só grava campos preenchidos — nada inventado).
      const itemsList = (data.decor?.items ?? [])
        .filter((it) => it.item?.trim())
        .map((it) => `${it.category ? `${it.category}: ` : ""}${it.item}${it.quantity ? ` (x${it.quantity})` : ""}`)
        .join("; ");
      const briefingFields: Record<string, string> = {};
      if (decorStyle.trim()) briefingFields.decorStyle = decorStyle.trim();
      if (decorColorPalette.trim()) briefingFields.colorPalette = decorColorPalette.trim();
      if (decorEnvironments.trim()) briefingFields.atmosphereDescription = decorEnvironments.trim();
      if (itemsList) briefingFields.furnitureNotes = itemsList;
      if (decorNotes.trim()) briefingFields.generalNotes = decorNotes.trim();
      if (Object.keys(briefingFields).length > 0) {
        await upsertBriefingFields({ eventId: event._id, fields: briefingFields });
      }

      toast.success(`Contrato importado!${financeMsg}`);
      onClose();
    } catch {
      toast.error("Erro ao aplicar as informações do contrato.");
    } finally {
      setSaving(false);
    }
  };

  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border-t border-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );

  const ReadRow = ({ label, value }: { label: string; value?: string }) => (
    <p className="text-sm flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? "font-medium text-right" : "text-muted-foreground italic text-right"}>{value || NI}</span>
    </p>
  );

  const brl = (n?: number) => (n ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : undefined);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Ler contrato com IA
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analisando contrato...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary" /> Confira e ajuste antes de confirmar. Nada é aplicado sem sua confirmação.
            </p>

            {/* Cliente */}
            <Block title="Cliente">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={NI} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder={NI} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input value={data.client?.email ?? ""} disabled placeholder={NI} />
                </div>
              </div>
            </Block>

            {/* Evento */}
            <Block title="Evento">
              <div className="space-y-1.5">
                <Label>Nome do evento</Label>
                <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder={NI} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input value={eventDate} onChange={(e) => setEventDate(e.target.value)} placeholder="AAAA-MM-DD" />
                </div>
                <div className="space-y-1.5">
                  <Label>Local</Label>
                  <Input value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder={NI} />
                </div>
              </div>
            </Block>

            {/* Financeiro */}
            <Block title="Financeiro">
              <ReadRow label="Valor total" value={brl(data.finance?.total)} />
              <ReadRow label="Entrada" value={brl(data.finance?.downPayment)} />
              <ReadRow label="Forma de pagamento" value={data.finance?.paymentMethod} />
              {(data.finance?.installments ?? []).length > 0 ? (
                <div className="rounded-lg border border-border divide-y divide-border">
                  {data.finance.installments.map((i, idx) => (
                    <div key={idx} className="flex justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{i.description || "Parcela"}{i.dueDate ? ` · ${i.dueDate}` : ""}</span>
                      <span className="font-medium">{brl(i.amount) ?? NI}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nenhuma parcela identificada</p>
              )}
              <p className="text-xs text-muted-foreground">Ao confirmar, entrada + parcelas viram contas a receber (sem duplicar se já existirem).</p>
            </Block>

            {/* Decoração */}
            <Block title="Decoração">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Estilo</Label>
                  <Input value={decorStyle} onChange={(e) => setDecorStyle(e.target.value)} placeholder={NI} />
                </div>
                <div className="space-y-1.5">
                  <Label>Paleta de cores</Label>
                  <Input value={decorColorPalette} onChange={(e) => setDecorColorPalette(e.target.value)} placeholder={NI} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Ambientes</Label>
                <Input value={decorEnvironments} onChange={(e) => setDecorEnvironments(e.target.value)} placeholder={NI} />
              </div>
              {(data.decor?.items ?? []).length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {data.decor.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{it.category ? `${it.category}: ` : ""}{it.item}</span>
                      {it.quantity ? <span className="text-muted-foreground">×{it.quantity}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nenhum item de decoração identificado</p>
              )}
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <AutoTextarea minRows={2} value={decorNotes} onChange={(e) => setDecorNotes(e.target.value)} placeholder={NI} />
              </div>
              <p className="text-xs text-muted-foreground">Ao confirmar, estas informações abastecem o briefing do evento.</p>
            </Block>

            {/* Decoração contratada */}
            <Block title="Decoração contratada">
              {(data.contracted ?? []).length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {data.contracted.map((c, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{c.item}</span>
                      {c.quantity ? <span className="text-muted-foreground">×{c.quantity}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground italic">{NI}</p>
              )}
            </Block>

            {/* Adendo */}
            {(data.addendum ?? []).length > 0 && (
              <Block title="Adendo">
                <ul className="space-y-1 text-sm">
                  {data.addendum.map((a, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{a.item}{a.change ? ` (${a.change})` : ""}</span>
                      {a.quantity ? <span className="text-muted-foreground">×{a.quantity}</span> : null}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            {error ? "Fechar" : "Revisar"}
          </Button>
          {data && !error && (
            <Button onClick={() => void handleConfirm()} disabled={saving} className="cursor-pointer gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirmar e adicionar ao evento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
