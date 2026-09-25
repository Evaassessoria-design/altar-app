import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api.js";
import { LIVE_ALTAR } from "@/convex/lib/campanha";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { UserPlus } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// + ADICIONAR INTERESSADO
//
// ── POR QUE ISTO NÃO É UM CADASTRO NOVO ─────────────────────────────────────
// Grava em `landingLeads`, a MESMA tabela do formulário público e da
// importação de lista. Um "cadastro rápido da campanha" em tabela própria
// criaria duas listas de decoradoras interessadas, e a primeira busca por
// telefone devolveria uma pessoa de cada.
//
// A deduplicação vem de graça por isso: `landingLeads.submit` já casa por
// e-mail e atualiza o registro existente em vez de criar outro.
//
// ── POR QUE A ORIGEM É ESCOLHIDA, E NÃO SUPOSTA ─────────────────────────────
// Quem digita aqui sabe de onde a pessoa veio — indicação, Instagram, um
// evento. Gravar "landing" para todo mundo seria inventar, e a origem é o que
// decide se a primeira mensagem abre com "você entrou em contato com a gente"
// ou com a verdade.
// ─────────────────────────────────────────────────────────────────────────────

/** As origens que fazem sentido para alguém digitado à mão, aqui. */
const ORIGENS_MANUAIS = [
  { id: "indicacao", rotulo: "Indicação" },
  { id: "instagram", rotulo: "Instagram" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "evento", rotulo: "Conheci num evento" },
  { id: "prospeccao", rotulo: "Prospecção" },
  { id: "outro", rotulo: "Outra" },
] as const;

export function AdicionarLead({ aoFechar }: { aoFechar: () => void }) {
  const criar = useMutation(api.admin.criarInteressado);
  const [salvando, setSalvando] = useState(false);
  const [c, setC] = useState({
    name: "",
    email: "",
    whatsapp: "",
    empresa: "",
    origem: "indicacao" as (typeof ORIGENS_MANUAIS)[number]["id"],
  });

  const campo = (k: keyof typeof c) => ({
    value: c[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setC((v) => ({ ...v, [k]: e.target.value })),
  });

  async function salvar() {
    if (!c.name.trim()) {
      toast.error("Escreva o nome.");
      return;
    }
    // Sem canal a pessoa entra e não tem como ser abordada. Barrar aqui é
    // melhor do que deixá-la cair na fila "Precisa de você" no mesmo minuto
    // em que foi digitada.
    if (!c.email.trim() && !c.whatsapp.trim()) {
      toast.error("Informe ao menos e-mail ou WhatsApp.");
      return;
    }
    setSalvando(true);
    try {
      const r = await criar({
        name: c.name.trim(),
        email: c.email.trim() || undefined,
        whatsapp: c.whatsapp.trim() || undefined,
        empresa: c.empresa.trim() || undefined,
        origem: c.origem,
        campanha: LIVE_ALTAR.slug,
      });
      if (r.resultado === "criado") {
        toast.success(`${c.name.trim()} entrou na campanha`);
      } else {
        // Não é erro: é a deduplicação funcionando. Dizer qual pessoa já
        // existia evita que alguém tente de novo com outra grafia.
        toast.info(`${r.nome} já estava cadastrada`, {
          description:
            r.resultado === "ja_na_campanha"
              ? "E já fazia parte desta campanha."
              : "Foi adicionada à campanha, com o histórico preservado.",
        });
      }
      aoFechar();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message)
          : "Não deu para salvar",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-primary" /> Adicionar interessado
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Nome</Label>
          <Input className="mt-1" placeholder="Marina Alves" {...campo("name")} />
        </div>
        <div>
          <Label className="text-xs">WhatsApp</Label>
          <Input className="mt-1" placeholder="(11) 99999-8888" {...campo("whatsapp")} />
        </div>
        <div>
          <Label className="text-xs">E-mail</Label>
          <Input className="mt-1" placeholder="marina@ateliê.com.br" {...campo("email")} />
        </div>
        <div>
          <Label className="text-xs">Empresa</Label>
          <Input className="mt-1" placeholder="Ateliê Flor de Lis" {...campo("empresa")} />
        </div>
        <div>
          <Label className="text-xs" htmlFor="origem-do-lead">
            Como chegou
          </Label>
          <select
            id="origem-do-lead"
            {...campo("origem")}
            className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
          >
            {ORIGENS_MANUAIS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Entra na {LIVE_ALTAR.nome}. Se esta pessoa já estiver cadastrada, o ALTAR
        reaproveita o registro dela em vez de criar outro.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={aoFechar} className="cursor-pointer">
          Cancelar
        </Button>
        <Button size="sm" disabled={salvando} onClick={() => void salvar()} className="cursor-pointer">
          {salvando ? "Salvando…" : "Adicionar à campanha"}
        </Button>
      </div>
    </div>
  );
}
