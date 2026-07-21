import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

const eventSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  type: z.enum(["wedding", "corporate", "birthday", "debutante", "baptism", "other"]),
  date: z.string().min(1, "Data obrigatória"),
  location: z.string().min(2, "Local obrigatório"),
  clientName: z.string().min(2, "Nome do cliente obrigatório"),
  clientPhone: z.string().optional(),
  budget: z.string().optional(),
  status: z.enum(["planning", "confirmed", "in_progress", "completed", "cancelled"]),
  notes: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

type EventSubmitValues = Omit<EventFormValues, "budget"> & { budget?: number };

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EventSubmitValues) => Promise<void>;
  defaultValues?: Partial<Doc<"events">>;
  title: string;
};

const EVENT_TYPES = [
  { value: "wedding", label: "Casamento" },
  { value: "corporate", label: "Corporativo" },
  { value: "birthday", label: "Aniversário" },
  { value: "debutante", label: "Debutante" },
  { value: "baptism", label: "Batizado" },
  { value: "other", label: "Outro" },
];

const EVENT_STATUSES = [
  { value: "planning", label: "Planejamento" },
  { value: "confirmed", label: "Confirmado" },
  { value: "in_progress", label: "Em Andamento" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

export default function EventFormDialog({ open, onClose, onSubmit, defaultValues, title }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      type: defaultValues?.type ?? "wedding",
      date: defaultValues?.date ? defaultValues.date.slice(0, 16) : "",
      location: defaultValues?.location ?? "",
      clientName: defaultValues?.clientName ?? "",
      clientPhone: defaultValues?.clientPhone ?? "",
      budget: defaultValues?.budget !== undefined ? String(defaultValues.budget) : "",
      status: defaultValues?.status ?? "planning",
      notes: defaultValues?.notes ?? "",
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFormSubmit = async (values: EventFormValues) => {
    const { budget: budgetStr, ...rest } = values;
    await onSubmit({
      ...rest,
      ...(budgetStr ? { budget: parseFloat(budgetStr) } : {}),
    });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome do Evento *</Label>
            <Input id="name" placeholder="Ex: Casamento Ana & Pedro" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select
                value={watch("type")}
                onValueChange={(v) => setValue("type", v as EventFormValues["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status *</Label>
              <Select
                value={watch("status")}
                onValueChange={(v) => setValue("status", v as EventFormValues["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Data e Hora *</Label>
            <Input id="date" type="datetime-local" {...register("date")} />
            {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">Local *</Label>
            <Input id="location" placeholder="Ex: Hotel Grand Hyatt - Sala Imperial" {...register("location")} />
            {errors.location && <p className="text-xs text-destructive">{errors.location.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="clientName">Nome do Cliente *</Label>
              <Input id="clientName" placeholder="João Silva" {...register("clientName")} />
              {errors.clientName && <p className="text-xs text-destructive">{errors.clientName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientPhone">Telefone</Label>
              <Input id="clientPhone" placeholder="(11) 99999-9999" {...register("clientPhone")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budget">Orçamento (R$)</Label>
            <Input id="budget" type="number" step="0.01" placeholder="0,00" {...register("budget")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" placeholder="Notas adicionais..." rows={3} {...register("notes")} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
