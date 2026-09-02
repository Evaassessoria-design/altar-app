import { useState } from "react";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import {
  Building2,
  Plus,
  Pencil,
  Search,
  Archive,
  ArchiveRestore,
  Phone,
  AtSign,
  MapPin,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Link } from "react-router-dom";
import {
  CATEGORIAS_DA_DECORACAO,
  CATEGORIAS_DO_EVENTO,
  filtrarFornecedores,
  labelDaCategoria,
} from "@/lib/supplier-categories.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO CENTRAL DE FORNECEDORES
//
// O backend deste catálogo (convex/supplierCatalog.ts) já existia por inteiro —
// listar, criar, editar, arquivar e "em quais eventos este fornecedor já
// trabalhou" — e NENHUMA tela o utilizava. Era possível cadastrar o mesmo
// fornecedor de novo a cada evento, sem nunca enxergar a agenda dele.
//
// Relação preservada: fornecedor da empresa → vínculo no evento → evento.
// Editar aqui altera o CADASTRO CENTRAL. Os dados específicos de um evento
// continuam vivendo no vínculo (`eventSuppliers`), editáveis dentro do evento.
//
// Arquivar, nunca excluir: o fornecedor continua nomeando os eventos passados.
// ─────────────────────────────────────────────────────────────────────────────

type Supplier = Doc<"suppliers">;

function erroDe(e: unknown, padrao: string): string {
  return e instanceof ConvexError ? (e.data as { message: string }).message : padrao;
}

type FormValues = {
  companyName: string;
  category: string;
  contactName: string;
  phone: string;
  email: string;
  instagram: string;
  city: string;
  notes: string;
};

const VAZIO: FormValues = {
  companyName: "",
  category: "",
  contactName: "",
  phone: "",
  email: "",
  instagram: "",
  city: "",
  notes: "",
};

function SupplierDialog({
  titulo,
  inicial,
  onClose,
  onSave,
}: {
  titulo: string;
  inicial: FormValues;
  onClose: () => void;
  onSave: (v: FormValues) => Promise<void>;
}) {
  const [v, setV] = useState<FormValues>(inicial);
  const [salvando, setSalvando] = useState(false);
  // Serve a <Input> e a <AutoTextarea>: so le `value`, que os dois tem.
  const set =
    (campo: keyof FormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((atual) => ({ ...atual, [campo]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.companyName.trim() || !v.category.trim()) return;
    setSalvando(true);
    try {
      await onSave(v);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Nome da empresa *</Label>
            <Input value={v.companyName} onChange={set("companyName")} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria *</Label>
            <select
              value={v.category}
              onChange={(e) => setV((a) => ({ ...a, category: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione...</option>
              {/* Dois grupos, de propósito: o que a decoradora contrata e paga
                  vem primeiro; os fornecedores do cliente ficam separados, como
                  contexto. É a mesma distinção que o Dashboard e o financeiro
                  usam (convex/lib/escopoDecoradora.ts). */}
              <optgroup label="Da sua operação">
                {CATEGORIAS_DA_DECORACAO.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Do evento (contexto)">
                {CATEGORIAS_DO_EVENTO.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Input value={v.contactName} onChange={set("contactName")} placeholder="Nome" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={v.phone} onChange={set("phone")} placeholder="(11) 99999-9999" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Instagram</Label>
              <Input value={v.instagram} onChange={set("instagram")} placeholder="@perfil" />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input value={v.city} onChange={set("city")} placeholder="São Paulo" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input value={v.email} onChange={set("email")} placeholder="contato@empresa.com.br" />
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <AutoTextarea
              minRows={2}
              value={v.notes}
              onChange={set("notes")}
              placeholder="Ex.: entrega só até as 14h"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando || !v.companyName.trim() || !v.category.trim()}
              className="cursor-pointer"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Em quais eventos este fornecedor já trabalhou — `listEventsForSupplier`. */
function HistoricoDoFornecedor({ supplierId }: { supplierId: Id<"suppliers"> }) {
  const eventos = useQuery(api.supplierCatalog.listEventsForSupplier, { supplierId });
  if (eventos === undefined) return <Skeleton className="h-4 w-32" />;
  if (eventos.length === 0) {
    return <p className="text-xs text-muted-foreground">Ainda não usado em nenhum evento</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {eventos.slice(0, 3).map((e) => (
        <Link
          key={e.eventId}
          to={`/eventos/${e.eventId}`}
          className="text-xs bg-muted px-2 py-0.5 rounded-full hover:bg-accent cursor-pointer inline-flex items-center gap-1"
        >
          <CalendarDays className="size-3" /> {e.name}
        </Link>
      ))}
      {eventos.length > 3 && (
        <span className="text-xs text-muted-foreground self-center">
          +{eventos.length - 3}
        </span>
      )}
    </div>
  );
}

export default function CatalogoFornecedoresPage() {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [verArquivados, setVerArquivados] = useState(false);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Supplier | null>(null);

  const fornecedores = useQuery(api.supplierCatalog.list, {
    category: categoria || undefined,
    includeArchived: verArquivados,
  });
  const criar = useMutation(api.supplierCatalog.create);
  const atualizar = useMutation(api.supplierCatalog.update);
  const arquivar = useMutation(api.supplierCatalog.setArchived);

  const visiveis = filtrarFornecedores(fornecedores ?? [], busca);

  const handleCriar = async (v: FormValues) => {
    try {
      await criar({
        companyName: v.companyName.trim(),
        category: v.category,
        contactName: v.contactName.trim() || undefined,
        phone: v.phone.trim() || undefined,
        email: v.email.trim() || undefined,
        instagram: v.instagram.trim() || undefined,
        city: v.city.trim() || undefined,
        notes: v.notes.trim() || undefined,
      });
      toast.success("Fornecedor adicionado ao catálogo.");
      setCriando(false);
    } catch (e) {
      toast.error(erroDe(e, "Não foi possível salvar o fornecedor."));
    }
  };

  const handleEditar = async (v: FormValues) => {
    if (!editando) return;
    try {
      await atualizar({
        supplierId: editando._id,
        companyName: v.companyName.trim(),
        category: v.category,
        contactName: v.contactName.trim() || undefined,
        phone: v.phone.trim() || undefined,
        email: v.email.trim() || undefined,
        instagram: v.instagram.trim() || undefined,
        city: v.city.trim() || undefined,
        notes: v.notes.trim() || undefined,
      });
      toast.success("Cadastro atualizado.");
      setEditando(null);
    } catch (e) {
      toast.error(erroDe(e, "Não foi possível salvar as alterações."));
    }
  };

  const handleArquivar = async (f: Supplier) => {
    const arquivando = !f.archivedAt;
    try {
      await arquivar({ supplierId: f._id, archived: arquivando });
      toast.success(
        arquivando
          ? "Fornecedor arquivado. Ele continua nos eventos em que já trabalhou."
          : "Fornecedor reativado.",
      );
    } catch (e) {
      toast.error(erroDe(e, "Não foi possível arquivar o fornecedor."));
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">
            {fornecedores === undefined
              ? "..."
              : `${fornecedores.length} no catálogo da sua empresa`}
          </p>
        </div>
        <Button onClick={() => setCriando(true)} className="cursor-pointer gap-2 flex-shrink-0">
          <Plus className="size-4" /> Novo
        </Button>
      </div>

      {/* Busca e filtro */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, contato, telefone ou cidade..."
            className="pl-9"
          />
        </div>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todas as categorias</option>
          <optgroup label="Da sua operação">
            {CATEGORIAS_DA_DECORACAO.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Do evento (contexto)">
            {CATEGORIAS_DO_EVENTO.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground mb-4 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={verArquivados}
          onChange={(e) => setVerArquivados(e.target.checked)}
          className="cursor-pointer"
        />
        Mostrar arquivados
      </label>

      {fornecedores === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : fornecedores.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>Seu catálogo de fornecedores está vazio</EmptyTitle>
            <EmptyDescription>
              Cadastre aqui quem você já contrata: floricultura, buffet, som, bolo. Depois é só
              escolher da lista em cada evento, sem digitar tudo de novo.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setCriando(true)} className="cursor-pointer">
              <Plus className="size-4 mr-1" /> Cadastrar fornecedor
            </Button>
          </EmptyContent>
        </Empty>
      ) : visiveis.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm font-medium">Nenhum fornecedor encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tente outro termo ou limpe o filtro de categoria.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiveis.map((f) => (
            <div
              key={f._id}
              className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{f.companyName}</p>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {labelDaCategoria(f.category)}
                  </span>
                  {f.archivedAt && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      Arquivado
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap gap-3">
                  {f.contactName && (
                    <span className="text-xs text-muted-foreground">{f.contactName}</span>
                  )}
                  {f.phone && (
                    <a
                      href={`tel:${f.phone}`}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Phone className="size-3" /> {f.phone}
                    </a>
                  )}
                  {f.instagram && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AtSign className="size-3" /> {f.instagram}
                    </span>
                  )}
                  {f.city && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {f.city}
                    </span>
                  )}
                </div>

                {f.notes && (
                  <p className="text-xs text-muted-foreground mt-1.5">{f.notes}</p>
                )}

                <div className="mt-2">
                  <HistoricoDoFornecedor supplierId={f._id} />
                </div>
              </div>

              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => setEditando(f)}
                  aria-label={`Editar ${f.companyName}`}
                  className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => handleArquivar(f)}
                  aria-label={
                    f.archivedAt ? `Reativar ${f.companyName}` : `Arquivar ${f.companyName}`
                  }
                  className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                >
                  {f.archivedAt ? (
                    <ArchiveRestore className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {criando && (
        <SupplierDialog
          titulo="Novo fornecedor"
          inicial={VAZIO}
          onClose={() => setCriando(false)}
          onSave={handleCriar}
        />
      )}

      {editando && (
        <SupplierDialog
          titulo="Editar cadastro central"
          inicial={{
            companyName: editando.companyName,
            category: editando.category,
            contactName: editando.contactName ?? "",
            phone: editando.phone ?? "",
            email: editando.email ?? "",
            instagram: editando.instagram ?? "",
            city: editando.city ?? "",
            notes: editando.notes ?? "",
          }}
          onClose={() => setEditando(null)}
          onSave={handleEditar}
        />
      )}
    </div>
  );
}
