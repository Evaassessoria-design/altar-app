import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import { Users, Plus, Pencil, Trash2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConvexError } from "convex/values";

const ROLES = [
  "Montador(a)",
  "Auxiliar",
  "Florista",
  "Motorista",
  "Coordenador(a)",
  "Fotógrafo(a)",
  "Cozinheiro(a)",
  "Garçom/Garçonete",
  "Segurança",
  "DJ",
  "Outros",
];

const memberSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  role: z.string().min(1, "Função obrigatória"),
  phone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
});

type MemberFormValues = z.infer<typeof memberSchema>;

function MemberDialog({
  open,
  onClose,
  defaultValues,
  title,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultValues?: Partial<MemberFormValues>;
  title: string;
  onSubmit: (values: MemberFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: defaultValues ?? {},
  });

  const submit = async (values: MemberFormValues) => {
    await onSubmit(values);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input placeholder="João Silva" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Função *</Label>
            <select
              {...register("role")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione...</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input placeholder="(11) 99999-9999" {...register("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input placeholder="joao@email.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input placeholder="Notas adicionais..." {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EquipePage() {
  const members = useQuery(api.team.listMembers);
  const createMember = useMutation(api.team.createMember);
  const updateMember = useMutation(api.team.updateMember);
  const deleteMember = useMutation(api.team.deleteMember);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Doc<"teamMembers"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"teamMembers"> | null>(null);

  const handleCreate = async (values: MemberFormValues) => {
    try {
      await createMember({ ...values, email: values.email || undefined });
      toast.success("Membro adicionado!");
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao adicionar membro");
    }
  };

  const handleUpdate = async (values: MemberFormValues) => {
    if (!editing) return;
    try {
      await updateMember({ id: editing._id, ...values, email: values.email || undefined });
      toast.success("Membro atualizado!");
      setEditing(null);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao atualizar membro");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMember({ id: deleting._id });
      toast.success("Membro removido.");
      setDeleting(null);
    } catch (e) {
      if (e instanceof ConvexError) toast.error((e.data as { message: string }).message);
      else toast.error("Erro ao remover membro");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground">
            {members === undefined ? "..." : `${members.length} membro${members.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="cursor-pointer gap-2">
          <Plus className="size-4" /> Novo Membro
        </Button>
      </div>

      {members === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>Nenhum membro cadastrado</EmptyTitle>
            <EmptyDescription>Adicione os profissionais da sua equipe</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setCreating(true)} className="cursor-pointer">
              <Plus className="size-4 mr-1" /> Adicionar Membro
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member._id}
              className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{member.name}</p>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {member.role}
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    {member.phone && (
                      <a
                        href={`tel:${member.phone}`}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Phone className="size-3" /> {member.phone}
                      </a>
                    )}
                    {member.email && (
                      <a
                        href={`mailto:${member.email}`}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Mail className="size-3" /> {member.email}
                      </a>
                    )}
                  </div>
                  {member.notes && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{member.notes}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => setEditing(member)}
                  className="p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => setDeleting(member)}
                  className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <MemberDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Novo Membro"
        onSubmit={handleCreate}
      />

      {editing && (
        <MemberDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          title="Editar Membro"
          defaultValues={editing}
          onSubmit={handleUpdate}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} será removido da equipe. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
