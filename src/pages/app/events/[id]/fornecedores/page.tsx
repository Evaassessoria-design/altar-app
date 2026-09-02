import { useMemo, useRef, useState } from "react";
import { useEnvioDeArquivo } from "@/hooks/use-upload.ts";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { SupplierCatalogPicker } from "../_components/supplier-catalog-picker.tsx";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  Mail,
  Phone,
  Globe,
  AtSign,
  MapPin,
  ChevronDown,
  X,
  ImagePlus,
  Handshake,
  UtensilsCrossed,
  Wine,
  Cake,
  Lightbulb,
  Building2,
  CalendarDays,
  Star,
  Search,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateInput, formatEventDayOnly } from "@/lib/event-date.ts";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils.ts";
import {
  CATEGORIAS_DA_DECORACAO,
  CATEGORIAS_DO_EVENTO,
  labelDaCategoria,
} from "@/convex/lib/escopoDecoradora.ts";
import {
  CATEGORIAS_COM_META,
  ERRO_CATEGORIA_OBRIGATORIA,
  iconeDaCategoria,
  PLACEHOLDER_CATEGORIA,
  templateDaCategoria,
} from "@/lib/supplier-metadata.ts";

type SupplierRow = Doc<"eventSuppliers"> & { logoUrl: string | null };
type OpItem = { label: string; value: string; group?: string };
type Alignment = { date: string; note: string; by?: string; nextAction?: string };
type SupplierStatus =
  | "cotacao"
  | "em_negociacao"
  | "contratado"
  | "confirmado"
  | "finalizado";

// ── Categorias + templates de campos operacionais (só UI) ─────────────────────

const GROUP_LABELS: Record<string, string> = {
  operacional: "Informações operacionais",
  operacao: "Operação / Montagem",
  mesa_posta: "Mesa Posta",
  extra: "Informações adicionais",
};
const GROUP_ORDER = ["operacional", "operacao", "mesa_posta", "extra"];

const STATUSES: { value: SupplierStatus; label: string; cls: string }[] = [
  { value: "cotacao", label: "Cotação", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "em_negociacao", label: "Em negociação", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "contratado", label: "Contratado", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "confirmado", label: "Confirmado", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "finalizado", label: "Finalizado", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

// A lista conceitual vive em convex/lib/escopoDecoradora.ts; os enfeites
// (ícone e roteiro) em src/lib/supplier-metadata.ts. Esta tela não mantém mais
// lista própria — era a terceira cópia do mesmo conceito, e a única que não
// oferecia nenhuma categoria da operação da decoradora.
const CATEGORIES = CATEGORIAS_COM_META;
const categoryConfig = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
const categoryLabel = (slug: string) => labelDaCategoria(slug);
const categoryIcon = (slug: string) => iconeDaCategoria(slug);
const statusConfig = (s?: string) => STATUSES.find((x) => x.value === s);

function templateFor(slug: string): OpItem[] {
  return templateDaCategoria(slug).map((t) => ({ label: t.label, value: "", group: t.group }));
}

// ── Links clicáveis ───────────────────────────────────────────────────────────

function whatsappHref(phone?: string) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 8 ? `https://wa.me/55${d}` : null;
}
function telHref(phone?: string) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d ? `tel:${d}` : null;
}
function instagramHref(v?: string) {
  if (!v?.trim()) return null;
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : `https://instagram.com/${t.replace(/^@/, "")}`;
}
function websiteHref(v?: string) {
  if (!v?.trim()) return null;
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function mapsHref(...parts: (string | undefined)[]) {
  const q = parts.filter((p) => p && p.trim()).join(", ").trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

function groupOperational(items: OpItem[] | undefined) {
  const filled = (items ?? []).filter((i) => i.value.trim() !== "");
  const groups: { key: string; items: OpItem[] }[] = [];
  for (const it of filled) {
    const key = it.group && GROUP_LABELS[it.group] ? it.group : "extra";
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  groups.sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a.key); const ib = GROUP_ORDER.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return groups;
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const cfg = statusConfig(status);
  if (!cfg) return null;
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  } catch {
    toast.error("Não foi possível copiar");
  }
}

// Linha "rótulo: valor" com botão de copiar (útil no desktop).
function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>
        <span className="text-muted-foreground">{label}: </span>
        {value}
      </span>
      <button
        onClick={() => void copyToClipboard(value)}
        className="p-1 rounded hover:bg-accent text-muted-foreground cursor-pointer flex-shrink-0"
        title={`Copiar ${label.toLowerCase()}`}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

function QuickContact({ s, onlyIcons }: { s: SupplierRow; onlyIcons?: boolean }) {
  const wa = whatsappHref(s.phone);
  const tel = telHref(s.phone);
  const ig = instagramHref(s.instagram);
  const site = websiteHref(s.website);
  const base = "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors";
  if (!wa && !tel && !s.email && !ig && !site) return null;
  return (
    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(base, "bg-green-600 text-white hover:bg-green-700")}>
          <MessageCircle className="size-3.5" />{!onlyIcons && "WhatsApp"}
        </a>
      )}
      {tel && (
        <a href={tel} className={cn(base, "border border-border hover:bg-accent")}>
          <Phone className="size-3.5" />{!onlyIcons && "Ligar"}
        </a>
      )}
      {s.email && (
        <a href={`mailto:${s.email}`} className={cn(base, "border border-border hover:bg-accent")}>
          <Mail className="size-3.5" />{!onlyIcons && "E-mail"}
        </a>
      )}
      {ig && (
        <a href={ig} target="_blank" rel="noopener noreferrer" className={cn(base, "border border-border hover:bg-accent")}>
          <AtSign className="size-3.5" />{!onlyIcons && "Instagram"}
        </a>
      )}
      {site && (
        <a href={site} target="_blank" rel="noopener noreferrer" className={cn(base, "border border-border hover:bg-accent")}>
          <Globe className="size-3.5" />{!onlyIcons && "Site"}
        </a>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between cursor-pointer"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

// ── Formulário ────────────────────────────────────────────────────────────────

type SupplierValues = {
  category: string;
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  differentials?: string;
  commercialInfo?: string;
  bankInfo?: string;
  status?: SupplierStatus;
  notes?: string;
  logoStorageId?: Id<"_storage">;
  operational: OpItem[];
};

function SupplierForm({
  open,
  onClose,
  initial,
  presetCategory,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  initial?: SupplierRow;
  presetCategory?: string;
  onSubmit: (values: SupplierValues) => Promise<void>;
}) {
  const isEdit = !!initial;
  // SEM padrão: a categoria nascia "assessoria", então cadastrar o fornecedor
  // de flores já vinha marcado como o fornecedor do cliente. Fornecedor que já
  // existe continua abrindo com a categoria salva; um novo começa vazio.
  const initialCategory = initial?.category ?? presetCategory ?? "";
  const isKnown = !!initialCategory && !!categoryConfig(initialCategory);

  const generateUpload = useMutation(api.suppliers.generateUploadUrl);
  const { enviar } = useEnvioDeArquivo(generateUpload, { tipo: "imagem", aceitos: ["image/"] });

  const [category, setCategory] = useState(
    initialCategory ? (isKnown ? initialCategory : "outro") : "",
  );
  const [customCategory, setCustomCategory] = useState(isKnown ? "" : initialCategory);
  const [erroCategoria, setErroCategoria] = useState(false);
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [instagram, setInstagram] = useState(initial?.instagram ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [stateUf, setStateUf] = useState(initial?.state ?? "");
  const [differentials, setDifferentials] = useState(initial?.differentials ?? "");
  const [commercialInfo, setCommercialInfo] = useState(initial?.commercialInfo ?? "");
  const [bankInfo, setBankInfo] = useState(initial?.bankInfo ?? "");
  const [status, setStatus] = useState<SupplierStatus | "">(initial?.status ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [operational, setOperational] = useState<OpItem[]>(
    initial?.operational ?? templateFor(initialCategory),
  );
  const [logoStorageId, setLogoStorageId] = useState<Id<"_storage"> | undefined>(initial?.logoStorageId);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial?.logoUrl ?? null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const handleCategoryChange = (slug: string) => {
    setCategory(slug);
    if (!isEdit) setOperational(slug === "outro" ? [] : templateFor(slug));
  };

  const handleLogo = async (file: File) => {
    setLogoUploading(true);
    try {
      const envio = await enviar(file);
      if (!envio.ok) {
        toast.error(envio.motivo);
        return;
      }
      const storageId = envio.storageId;
      setLogoStorageId(storageId);
      setLogoPreview(URL.createObjectURL(file));
    } catch {
      toast.error("Erro ao enviar a logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<OpItem>) =>
    setOperational((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx: number) => setOperational((rows) => rows.filter((_, i) => i !== idx));
  const addRow = () => setOperational((rows) => [...rows, { label: "", value: "", group: "extra" }]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, { idx: number; item: OpItem }[]>();
    operational.forEach((item, idx) => {
      const key = item.group && GROUP_LABELS[item.group] ? item.group : "extra";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push({ idx, item });
    });
    return GROUP_ORDER.filter((k) => byGroup.has(k)).map((k) => ({ key: k, rows: byGroup.get(k)! }));
  }, [operational]);

  const submit = async () => {
    const finalCategory = category === "outro" ? customCategory.trim() : category;
    if (!finalCategory) {
      // O erro aparece NO CAMPO. Só o aviso flutuante deixaria a pessoa sem
      // saber qual campo faltou — a falha silenciosa que evitamos no tipo de
      // evento e que valeria igual aqui.
      setErroCategoria(true);
      return toast.error(ERRO_CATEGORIA_OBRIGATORIA);
    }
    if (!companyName.trim()) return toast.error("Informe o nome do fornecedor");
    setSaving(true);
    try {
      await onSubmit({
        category: finalCategory,
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        instagram: instagram.trim() || undefined,
        website: website.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: stateUf.trim() || undefined,
        differentials: differentials.trim() || undefined,
        commercialInfo: commercialInfo.trim() || undefined,
        bankInfo: bankInfo.trim() || undefined,
        status: status || undefined,
        notes: notes.trim() || undefined,
        logoStorageId,
        operational: operational
          .filter((r) => r.value.trim() !== "" && r.label.trim() !== "")
          .map((r) => ({ label: r.label.trim(), value: r.value.trim(), group: r.group })),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="size-16 rounded-xl border border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/40 cursor-pointer hover:border-primary/40 flex-shrink-0"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="logo" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-5 text-muted-foreground" />
              )}
            </button>
            <div className="text-xs text-muted-foreground">
              {logoUploading ? "Enviando..." : "Logo do fornecedor (opcional)"}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleLogo(f);
              }}
            />
          </div>

          {/* Principais */}
          <div className="space-y-1.5">
            <Label htmlFor="fornecedor-categoria">Categoria *</Label>
            <select
              id="fornecedor-categoria"
              value={category}
              onChange={(e) => {
                setErroCategoria(false);
                handleCategoryChange(e.target.value);
              }}
              aria-invalid={erroCategoria}
              aria-describedby={erroCategoria ? "fornecedor-categoria-erro" : undefined}
              className={cn(
                "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                erroCategoria ? "border-destructive" : "border-input",
              )}
            >
              <option value="">{PLACEHOLDER_CATEGORIA}</option>
              {/* Dois grupos: o que a decoradora contrata e paga vem primeiro;
                  os fornecedores do cliente ficam como contexto. */}
              <optgroup label="Da sua operação">
                {CATEGORIAS_DA_DECORACAO.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Do evento (contexto)">
                {CATEGORIAS_DO_EVENTO.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.label}</option>
                ))}
              </optgroup>
              <option value="outro">Personalizado…</option>
            </select>
            {erroCategoria && (
              <p id="fornecedor-categoria-erro" className="text-xs text-destructive">
                {ERRO_CATEGORIA_OBRIGATORIA}
              </p>
            )}
            {category === "outro" && (
              <Input placeholder="Nome da categoria" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Nome da empresa / profissional *</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ex.: Bella Decorações" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Ex.: Kely" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp / Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SupplierStatus | "")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">—</option>
                {STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
              </select>
            </div>
          </div>

          {/* Redes e endereço */}
          <Section title="Redes & endereço">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Instagram</Label>
                <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@empresa" />
              </div>
              <div className="space-y-1.5">
                <Label>Site</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="empresa.com.br" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Endereço</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Input value={stateUf} onChange={(e) => setStateUf(e.target.value)} placeholder="UF" />
              </div>
            </div>
          </Section>

          {/* Comercial */}
          <Section title="Diferenciais & comercial">
            <div className="space-y-1.5">
              <Label>Diferenciais</Label>
              <textarea value={differentials} onChange={(e) => setDifferentials(e.target.value)} rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Informações comerciais</Label>
              <textarea value={commercialInfo} onChange={(e) => setCommercialInfo(e.target.value)} rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Dados bancários / Pix</Label>
              <textarea value={bankInfo} onChange={(e) => setBankInfo(e.target.value)} rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
          </Section>

          {/* Operação do evento */}
          <div className="space-y-3 pt-1 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operação do evento</p>
            {grouped.map((g) => (
              <div key={g.key} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{GROUP_LABELS[g.key]}</p>
                {g.key === "mesa_posta" && (
                  <p className="text-xs text-muted-foreground -mt-1">Itens fornecidos pelo buffet — confira o que já está incluso.</p>
                )}
                {g.rows.map(({ idx, item }) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input value={item.label} onChange={(e) => updateRow(idx, { label: e.target.value })} placeholder="Título" className="flex-1 h-9 text-sm" />
                    <Input value={item.value} onChange={(e) => updateRow(idx, { value: e.target.value })} placeholder="Valor / informação" className="flex-1 h-9 text-sm" />
                    <button type="button" onClick={() => removeRow(idx)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-destructive cursor-pointer">
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={addRow} className="cursor-pointer gap-1.5">
              <Plus className="size-3.5" /> Adicionar informação
            </Button>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancelar</Button>
          <Button type="button" onClick={() => void submit()} disabled={saving || logoUploading} className="cursor-pointer">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detalhe ───────────────────────────────────────────────────────────────────

function SupplierDetail({
  supplier,
  onClose,
  onEdit,
  onChangeStatus,
  onAddAlignment,
}: {
  supplier: SupplierRow;
  onClose: () => void;
  onEdit: () => void;
  onChangeStatus: (status: SupplierStatus) => void;
  onAddAlignment: (a: Alignment) => void;
}) {
  const Icon = categoryIcon(supplier.category);
  const groups = groupOperational(supplier.operational);
  const alignments = [...(supplier.alignments ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const last = alignments[0];
  const maps = mapsHref(supplier.address, supplier.city, supplier.state);

  const [addingAlign, setAddingAlign] = useState(false);
  const [alignDate, setAlignDate] = useState(new Date().toISOString().slice(0, 10));
  const [alignNote, setAlignNote] = useState("");
  const [alignBy, setAlignBy] = useState("");
  const [alignNext, setAlignNext] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Cabeçalho + logo */}
        <DialogHeader>
          <div className="flex items-center gap-3">
            {supplier.logoUrl ? (
              <img src={supplier.logoUrl} alt="logo" className="size-12 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
                <Icon className="size-6 text-primary" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="truncate">{supplier.companyName}</DialogTitle>
                <StatusBadge status={supplier.status} />
              </div>
              <p className="text-xs text-muted-foreground">{categoryLabel(supplier.category)}</p>
              {supplier.contactName && (
                <p className="text-xs text-muted-foreground">{supplier.contactName} · Responsável</p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* 2. Contato rápido */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contato rápido</p>
            <QuickContact s={supplier} />
            <div className="mt-2 space-y-1">
              {supplier.phone && <CopyRow label="Telefone" value={supplier.phone} />}
              {supplier.email && <CopyRow label="E-mail" value={supplier.email} />}
            </div>
          </div>

          {/* 3. Situação neste evento (status + próxima ação + alinhamentos) */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Situação neste evento</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => onChangeStatus(s.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer border transition-colors",
                    supplier.status === s.value ? s.cls + " border-transparent" : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {supplier.nextAction && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm mb-2">
                <p className="text-xs font-medium text-primary">Próxima ação</p>
                <p>{supplier.nextAction}</p>
              </div>
            )}

            {last ? (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  Último alinhamento · {formatDateInput(last.date)}
                  {last.by ? ` · ${last.by}` : ""}
                </p>
                <p>{last.note}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum alinhamento registrado.</p>
            )}

            {alignments.length > 1 && (
              <Section title="Histórico de alinhamentos">
                <div className="space-y-2">
                  {alignments.slice(1).map((a, i) => (
                    <div key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <p className="text-xs text-muted-foreground">
                        {formatDateInput(a.date)}{a.by ? ` · ${a.by}` : ""}
                      </p>
                      <p>{a.note}</p>
                      {a.nextAction && <p className="text-xs text-primary mt-1">→ {a.nextAction}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {addingAlign ? (
              <div className="space-y-2 rounded-lg border border-border p-3 mt-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={alignDate} onChange={(e) => setAlignDate(e.target.value)} className="h-9" />
                  <Input value={alignBy} onChange={(e) => setAlignBy(e.target.value)} placeholder="Responsável" className="h-9" />
                </div>
                <textarea value={alignNote} onChange={(e) => setAlignNote(e.target.value)} rows={2} placeholder="O que foi alinhado?"
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                <Input value={alignNext} onChange={(e) => setAlignNext(e.target.value)} placeholder="Próxima ação (opcional)" className="h-9" />
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setAddingAlign(false)} className="cursor-pointer">Cancelar</Button>
                  <Button size="sm" className="cursor-pointer" onClick={() => {
                    if (!alignNote.trim()) return;
                    onAddAlignment({
                      date: alignDate,
                      note: alignNote.trim(),
                      by: alignBy.trim() || undefined,
                      nextAction: alignNext.trim() || undefined,
                    });
                    setAlignNote(""); setAlignBy(""); setAlignNext(""); setAddingAlign(false);
                  }}>Salvar</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setAddingAlign(true)} className="cursor-pointer gap-1.5 mt-1">
                <Plus className="size-3.5" /> Adicionar alinhamento
              </Button>
            )}
          </div>

          {/* 4. Operação / Montagem */}
          {groups.length > 0 && (
            <Section title="Operação / Montagem" defaultOpen>
              {groups.map((g) => (
                <div key={g.key} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{GROUP_LABELS[g.key] ?? "Informações"}</p>
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {g.items.map((it, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{it.label}</span>
                        <span className="font-medium text-right">{it.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* 5. Informações complementares */}
          {(supplier.address || supplier.city || supplier.state || supplier.differentials || supplier.commercialInfo || supplier.bankInfo) && (
            <Section title="Informações complementares">
              {(supplier.address || supplier.city || supplier.state) && (
                <p className="text-sm flex gap-2"><span className="text-muted-foreground">Endereço:</span>
                  {maps ? (
                    <a href={maps} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {[supplier.address, supplier.city, supplier.state].filter(Boolean).join(", ")}
                    </a>
                  ) : (
                    <span>{[supplier.address, supplier.city, supplier.state].filter(Boolean).join(", ")}</span>
                  )}
                </p>
              )}
              {supplier.differentials && (
                <div className="text-sm"><span className="text-muted-foreground">Diferenciais:</span><p className="whitespace-pre-wrap">{supplier.differentials}</p></div>
              )}
              {supplier.commercialInfo && (
                <div className="text-sm"><span className="text-muted-foreground">Comercial:</span><p className="whitespace-pre-wrap">{supplier.commercialInfo}</p></div>
              )}
              {supplier.bankInfo && (
                <div className="text-sm"><span className="text-muted-foreground">Dados bancários / Pix:</span><p className="whitespace-pre-wrap">{supplier.bankInfo}</p></div>
              )}
            </Section>
          )}

          {supplier.notes && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Observações</p>
              <p className="text-sm whitespace-pre-wrap">{supplier.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onEdit} className="cursor-pointer gap-1.5 ml-auto">
            <Pencil className="size-4" /> Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function FornecedoresPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { id: eventId });
  const suppliers = useQuery(api.suppliers.listByEvent, { eventId }) as SupplierRow[] | undefined;
  const createSupplier = useMutation(api.suppliers.create);
  const updateSupplier = useMutation(api.suppliers.update);
  const removeSupplier = useMutation(api.suppliers.remove);
  // Vincula um fornecedor JÁ existente no catálogo da empresa a este evento.
  const createFromCatalog = useMutation(api.suppliers.createFromCatalog);
  // Seletor do catálogo — primeiro passo ao adicionar um fornecedor.
  const [picking, setPicking] = useState<{ category?: string } | null>(null);

  const [form, setForm] = useState<
    { mode: "create"; category?: string } | { mode: "edit"; supplier: SupplierRow } | null
  >(null);
  const [detail, setDetail] = useState<SupplierRow | null>(null);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Mantém o detalhe sincronizado com os dados reativos após editar/atualizar.
  const detailLive = detail ? suppliers?.find((s) => s._id === detail._id) ?? null : null;

  // Ordena favoritos primeiro, depois pela ordem original.
  const sortFav = (a: SupplierRow, b: SupplierRow) =>
    (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, SupplierRow[]>();
    for (const s of suppliers ?? []) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    for (const list of map.values()) list.sort(sortFav);
    return map;
  }, [suppliers]);

  const customCategories = useMemo(
    () => [...byCategory.keys()].filter((c) => !categoryConfig(c)),
    [byCategory],
  );

  const filtersActive = search.trim() !== "" || catFilter !== "all" || statusFilter !== "all";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (suppliers ?? [])
      .filter((s) => {
        if (q) {
          const hay = `${s.companyName} ${s.contactName ?? ""} ${categoryLabel(s.category)}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (catFilter !== "all") {
          if (catFilter === "outros") { if (categoryConfig(s.category)) return false; }
          else if (s.category !== catFilter) return false;
        }
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        return true;
      })
      .sort(sortFav);
  }, [suppliers, search, catFilter, statusFilter]);

  const handleSubmit = async (values: SupplierValues) => {
    try {
      if (form?.mode === "edit") {
        await updateSupplier({ id: form.supplier._id, ...values });
        toast.success("Fornecedor atualizado!");
      } else {
        await createSupplier({ eventId, ...values });
        toast.success("Fornecedor adicionado!");
      }
    } catch {
      toast.error("Erro ao salvar fornecedor");
    }
  };

  const handleChangeStatus = async (supplier: SupplierRow, status: SupplierStatus) => {
    try {
      await updateSupplier({ id: supplier._id, status });
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleAddAlignment = async (supplier: SupplierRow, a: Alignment) => {
    try {
      await updateSupplier({
        id: supplier._id,
        alignments: [...(supplier.alignments ?? []), a],
        // Uma nova "próxima ação" no alinhamento vira a pendência atual do card.
        ...(a.nextAction ? { nextAction: a.nextAction } : {}),
      });
      toast.success("Alinhamento adicionado!");
    } catch {
      toast.error("Erro ao adicionar alinhamento");
    }
  };

  const handleToggleFavorite = async (s: SupplierRow) => {
    try {
      await updateSupplier({ id: s._id, favorite: !s.favorite });
    } catch {
      toast.error("Erro ao favoritar");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await removeSupplier({ id: deleting._id });
      toast.success("Fornecedor removido.");
      setDeleting(null);
    } catch {
      toast.error("Erro ao remover");
    }
  };

  const renderCard = (s: SupplierRow) => {
    const Icon = categoryIcon(s.category);
    const lastAlign = [...(s.alignments ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
    return (
      <div
        key={s._id}
        onClick={() => setDetail(s)}
        className="rounded-xl border border-border bg-background p-3 hover:border-primary/40 transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-3">
          {s.logoUrl ? (
            <img src={s.logoUrl} alt="" className="size-10 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
              <Icon className="size-5 text-primary" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{s.companyName}</p>
              <StatusBadge status={s.status} />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {categoryLabel(s.category)}{s.contactName ? ` · ${s.contactName}` : ""}
            </p>
            {lastAlign && (
              <p className="text-xs text-muted-foreground truncate">
                Última interação: {formatDateInput(lastAlign.date)}
              </p>
            )}
            {s.nextAction && (
              <p className="text-xs text-primary truncate">⏭ Próxima: {s.nextAction}</p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); void handleToggleFavorite(s); }}
              className={cn(
                "p-1.5 rounded-lg cursor-pointer hover:bg-accent",
                s.favorite ? "text-amber-500" : "text-muted-foreground",
              )}
              title={s.favorite ? "Remover dos favoritos" : "Favoritar"}
            >
              <Star className={cn("size-4", s.favorite && "fill-current")} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeleting(s); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
              title="Remover"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        <div className="mt-2">
          <QuickContact s={s} />
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link to={`/eventos/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer mb-4">
        <ArrowLeft className="size-4" /> Voltar ao evento
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Fornecedores</h1>
        {event ? (
          <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2">
            <span className="font-medium text-foreground">{event.name}</span>
            {event.date && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {formatEventDayOnly(event.date)}
              </span>
            )}
            {event.location && <span>· {event.location}</span>}
          </p>
        ) : (
          <Skeleton className="h-4 w-48 mt-1" />
        )}
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="all">Todas categorias</option>
          {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          <option value="outros">Outros</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="all">Todos status</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {suppliers === undefined ? (
        <div className="space-y-3">
          {CATEGORIES.map((c) => <Skeleton key={c.slug} className="h-20 rounded-xl" />)}
        </div>
      ) : filtersActive ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhum fornecedor encontrado.</p>
          ) : (
            filtered.map(renderCard)
          )}
          <Button variant="secondary" onClick={() => setPicking({})} className="w-full cursor-pointer gap-2 mt-2">
            <Plus className="size-4" /> Adicionar fornecedor
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.map((cat) => {
            const items = byCategory.get(cat.slug) ?? [];
            const Icon = cat.icone;
            return (
              <div key={cat.slug} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="size-4 text-primary" />
                    </span>
                    <p className="font-semibold text-sm">{cat.label}</p>
                  </div>
                  <button onClick={() => setForm({ mode: "create", category: cat.slug })}
                    className="p-1 rounded-lg hover:bg-accent cursor-pointer text-muted-foreground" title="Adicionar">
                    <Plus className="size-4" />
                  </button>
                </div>
                {items.length > 0 ? (
                  <div className="space-y-2">{items.map(renderCard)}</div>
                ) : (
                  <button onClick={() => setForm({ mode: "create", category: cat.slug })}
                    className="w-full border-2 border-dashed border-border rounded-lg py-3 text-center text-xs text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer">
                    + Adicionar {cat.label.toLowerCase()}
                  </button>
                )}
              </div>
            );
          })}

          {customCategories.map((slug) => (
            <div key={slug} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="size-4 text-primary" />
                </span>
                <p className="font-semibold text-sm">{slug}</p>
              </div>
              <div className="space-y-2">{(byCategory.get(slug) ?? []).map(renderCard)}</div>
            </div>
          ))}

          <Button variant="secondary" onClick={() => setPicking({})} className="w-full cursor-pointer gap-2">
            <Plus className="size-4" /> Adicionar fornecedor
          </Button>
        </div>
      )}

      {picking && (
        <SupplierCatalogPicker
          open
          onClose={() => setPicking(null)}
          presetCategory={picking.category}
          alreadyLinked={(suppliers ?? [])
            .map((s) => s.supplierId)
            .filter((id): id is NonNullable<typeof id> => id !== undefined)}
          onPick={async (supplierId) => {
            await createFromCatalog({ eventId, supplierId, category: picking.category });
          }}
          onCreateNew={() => {
            // Segue exatamente para o formulário de sempre.
            const category = picking.category;
            setPicking(null);
            setForm({ mode: "create", category });
          }}
        />
      )}

      {form && (
        <SupplierForm
          open
          onClose={() => setForm(null)}
          initial={form.mode === "edit" ? form.supplier : undefined}
          presetCategory={form.mode === "create" ? form.category : undefined}
          onSubmit={handleSubmit}
        />
      )}

      {detailLive && (
        <SupplierDetail
          supplier={detailLive}
          onClose={() => setDetail(null)}
          onEdit={() => { setForm({ mode: "edit", supplier: detailLive }); setDetail(null); }}
          onChangeStatus={(status) => void handleChangeStatus(detailLive, status)}
          onAddAlignment={(a) => void handleAddAlignment(detailLive, a)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.companyName} será removido deste evento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
