import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id, Doc } from "@/convex/_generated/dataModel.d.ts";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { ArrowLeft, Save, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils.ts";

type BriefingDoc = Doc<"briefings">;
type BriefingFields = Omit<BriefingDoc, "_id" | "_creationTime" | "eventId" | "userId">;

type Section = {
  key: string;
  label: string;
  emoji: string;
  fields: { key: keyof BriefingFields; label: string; type?: "textarea" | "text" }[];
};

const SECTIONS: Section[] = [
  {
    key: "general",
    label: "Informações Gerais",
    emoji: "📋",
    fields: [
      { key: "guestCount", label: "Número de Convidados" },
      { key: "theme", label: "Tema do Evento" },
      { key: "ceremonyTime", label: "Horário da Cerimônia" },
      { key: "receptionTime", label: "Horário da Recepção" },
      { key: "venueContact", label: "Contato do Espaço" },
      { key: "venueRules", label: "Regras do Espaço", type: "textarea" },
    ],
  },
  {
    key: "decor",
    label: "Decoração",
    emoji: "✨",
    fields: [
      { key: "colorPalette", label: "Paleta de Cores" },
      { key: "decorStyle", label: "Estilo da Decoração" },
      { key: "atmosphereDescription", label: "Descrição da Atmosfera", type: "textarea" },
      { key: "referenceImages", label: "Links de Referências (URLs)" },
      { key: "tableClothColor", label: "Cor da Toalha de Mesa" },
      { key: "napkinStyle", label: "Estilo do Guardanapo" },
      { key: "centerpiece", label: "Arranjo Central" },
      { key: "ceremony_arch", label: "Arco da Cerimônia" },
      { key: "aisle_decor", label: "Decoração do Corredor" },
    ],
  },
  {
    key: "flowers",
    label: "Flores",
    emoji: "🌸",
    fields: [
      { key: "flowerTypes", label: "Tipos de Flores" },
      { key: "flowerColors", label: "Cores das Flores" },
      { key: "bouquetStyle", label: "Estilo do Buquê" },
      { key: "boutonniere", label: "Boutonnière / Lapela" },
      { key: "corsage", label: "Corsage" },
      { key: "flowerSupplier", label: "Fornecedor de Flores" },
      { key: "flowerBudget", label: "Orçamento de Flores (R$)" },
      { key: "flowersNotes", label: "Observações sobre Flores", type: "textarea" },
    ],
  },
  {
    key: "furniture",
    label: "Mobiliário",
    emoji: "🪑",
    fields: [
      { key: "guestTableType", label: "Tipo das Mesas dos Convidados" },
      { key: "guestTableCount", label: "Quantidade de Mesas" },
      { key: "guestChairType", label: "Tipo das Cadeiras" },
      { key: "guestChairCount", label: "Quantidade de Cadeiras" },
      { key: "sweetTableIncluded", label: "Mesa de Doces? (Sim/Não)" },
      { key: "sweetTableStyle", label: "Estilo da Mesa de Doces" },
      { key: "loungeIncluded", label: "Lounge? (Sim/Não)" },
      { key: "loungeDescription", label: "Descrição do Lounge", type: "textarea" },
      { key: "signTable", label: "Mesa de Assinar / Welcome Table" },
      { key: "furnitureSupplier", label: "Fornecedor de Móveis" },
      { key: "furnitureNotes", label: "Observações", type: "textarea" },
    ],
  },
  {
    key: "lighting",
    label: "Iluminação",
    emoji: "💡",
    fields: [
      { key: "lightingType", label: "Tipo de Iluminação" },
      { key: "lightingEffects", label: "Efeitos de Iluminação" },
      { key: "uplighting", label: "Uplighting (cor/intensidade)" },
      { key: "stringLights", label: "Cordões de Luz?" },
      { key: "candleUse", label: "Uso de Velas?" },
      { key: "lightingSupplier", label: "Fornecedor de Iluminação" },
      { key: "lightingNotes", label: "Observações", type: "textarea" },
    ],
  },
  {
    key: "cake",
    label: "Bolo e Doces",
    emoji: "🎂",
    fields: [
      { key: "cakeSupplier", label: "Fornecedor do Bolo" },
      { key: "cakeFlavor", label: "Sabor do Bolo" },
      { key: "cakeLayers", label: "Andares / Camadas" },
      { key: "cakeDesign", label: "Design / Decoração do Bolo" },
      { key: "sweetsIncluded", label: "Inclui Docinhos? (Sim/Não)" },
      { key: "sweetsDescription", label: "Descrição dos Docinhos" },
      { key: "weddingFavors", label: "Lembranças para Convidados" },
      { key: "drinkService", label: "Serviço de Bebidas" },
      { key: "cakeNotes", label: "Observações", type: "textarea" },
    ],
  },
  {
    key: "notes",
    label: "Observações",
    emoji: "📝",
    fields: [
      { key: "generalNotes", label: "Notas Gerais", type: "textarea" },
      { key: "specialRequests", label: "Pedidos Especiais", type: "textarea" },
      { key: "restrictions", label: "Restrições / Limitações", type: "textarea" },
      { key: "vendorContacts", label: "Contatos dos Fornecedores", type: "textarea" },
      { key: "setupTime", label: "Horário de Montagem" },
      { key: "teardownTime", label: "Horário de Desmontagem" },
      { key: "parkingInfo", label: "Informações de Estacionamento" },
      { key: "accessibilityNeeds", label: "Necessidades de Acessibilidade" },
      { key: "emergencyContact", label: "Contato de Emergência" },
      { key: "otherNotes", label: "Outras Observações", type: "textarea" },
    ],
  },
];

export default function EventBriefingPage() {
  const { id } = useParams<{ id: string }>();
  const [activeSection, setActiveSection] = useState(0);

  const event = useQuery(api.events.get, { id: id as Id<"events"> });
  const briefing = useQuery(api.briefing.getBriefing, { eventId: id as Id<"events"> });
  const upsertBriefing = useMutation(api.briefing.upsertBriefing);

  const { register, handleSubmit, reset, formState: { isDirty, isSubmitting } } = useForm<BriefingFields>({
    defaultValues: {},
  });

  useEffect(() => {
    if (briefing !== undefined) {
      if (briefing) {
        const { _id, _creationTime, eventId, userId, ...fields } = briefing;
        reset(fields);
      } else {
        reset({});
      }
    }
  }, [briefing, reset]);

  const onSave = async (data: BriefingFields) => {
    try {
      await upsertBriefing({ eventId: id as Id<"events">, ...data });
      toast.success("Briefing salvo!");
      reset(data); // reset dirty state
    } catch {
      toast.error("Erro ao salvar briefing");
    }
  };

  const section = SECTIONS[activeSection];

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] md:max-h-screen">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 pb-3 border-b border-border bg-background flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <Link
            to={`/eventos/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 cursor-pointer"
          >
            <ArrowLeft className="size-4" />
            {event?.name ?? "Evento"}
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Briefing</h1>
            <Button
              onClick={handleSubmit(onSave)}
              disabled={!isDirty || isSubmitting}
              size="sm"
              className="cursor-pointer flex items-center gap-1.5"
            >
              <Save className="size-3.5" />
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden max-w-3xl mx-auto w-full">
        {/* Sidebar tabs — desktop */}
        <aside className="hidden md:flex flex-col w-48 border-r border-border flex-shrink-0 overflow-y-auto py-3 px-2">
          {SECTIONS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(i)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-left transition-colors cursor-pointer w-full",
                activeSection === i
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <span>{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </aside>

        {/* Mobile tabs */}
        <div className="md:hidden flex gap-2 overflow-x-auto px-4 py-2 border-b border-border flex-shrink-0 absolute left-0 right-0" style={{ top: "calc(var(--header-height, 120px))" }}>
          {SECTIONS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(i)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer flex-shrink-0",
                activeSection === i
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground",
              )}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {/* Mobile section tabs inline */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
            {SECTIONS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(i)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer flex-shrink-0",
                  activeSection === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground",
                )}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          {briefing === undefined ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSave)}>
              <div className="mb-5 flex items-center gap-2">
                <span className="text-2xl">{section.emoji}</span>
                <h2 className="text-lg font-semibold">{section.label}</h2>
              </div>
              <div className="space-y-4">
                {section.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    {field.type === "textarea" ? (
                      <Textarea
                        id={field.key}
                        rows={3}
                        placeholder={`${field.label}...`}
                        {...register(field.key)}
                      />
                    ) : (
                      <Input
                        id={field.key}
                        placeholder={field.label}
                        {...register(field.key)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Navigation between sections */}
              <div className="flex justify-between mt-8 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActiveSection((s) => Math.max(0, s - 1))}
                  disabled={activeSection === 0}
                  className="cursor-pointer"
                >
                  Anterior
                </Button>
                {activeSection < SECTIONS.length - 1 ? (
                  <Button
                    type="button"
                    onClick={async () => {
                      if (isDirty) await handleSubmit(onSave)();
                      setActiveSection((s) => s + 1);
                    }}
                    className="cursor-pointer flex items-center gap-1.5"
                  >
                    Próximo <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!isDirty || isSubmitting}
                    className="cursor-pointer flex items-center gap-1.5"
                  >
                    <Save className="size-4" />
                    {isSubmitting ? "Salvando..." : "Salvar Briefing"}
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
