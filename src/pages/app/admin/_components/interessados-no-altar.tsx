import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Sparkles, Upload } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { formatTimestamp } from "@/lib/safe-date.ts";
import { FilaDeContato } from "./fila-de-contato.tsx";
import { ImportarInteressados } from "./importar-interessados.tsx";
import {
  ESTAGIOS,
  LIVE_ALTAR,
  ORIGENS,
  rotuloDaOrigem,
  type EstagioDoInteressado,
} from "@/convex/lib/campanha.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERESSADOS NO ALTAR — E O FUNIL DE UMA CAMPANHA
//
// ── DOIS PÚBLICOS QUE NUNCA SE MISTURAM ─────────────────────────────────────
// Esta tela é de quem se interessou PELO ALTAR: decoradoras. O funil em
// `/funil` é das clientes DELA — noivas, aniversariantes. São tabelas
// diferentes (`landingLeads` e `leads`), telas diferentes e públicos
// diferentes, e continuam assim de propósito: a decoradora piloto abrir o
// funil dela e encontrar concorrentes no meio das noivas seria o pior efeito
// possível de uma economia de tabela.
//
// ── O QUE ESTA TELA PASSOU A RESPONDER ──────────────────────────────────────
// Antes ela listava nome, e-mail e uma situação de quatro valores. Não dava
// para perguntar quantas pessoas a campanha trouxe, quantas foram contatadas,
// quantas confirmaram. Essas contagens iam para uma planilha — e uma planilha
// paralela é exatamente o que este produto existe para acabar.
// ─────────────────────────────────────────────────────────────────────────────

/** Cores por etapa: do cinza de quem chegou ao verde de quem assinou. */
const TOM_DO_ESTAGIO: Record<EstagioDoInteressado, string> = {
  novo: "bg-muted text-muted-foreground",
  contato_preparado:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  contatado: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  interessado:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  confirmou:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  participou: "bg-primary/10 text-primary",
  testando: "bg-primary/10 text-primary",
  convertido:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  descartado: "bg-muted text-muted-foreground line-through",
};

/** Um número do funil. Sem ícone: são sete lado a lado, e ícone vira ruído. */
function Contagem({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-border px-3 py-2">
      <p className="text-lg font-bold leading-tight">{valor}</p>
      <p className="text-[11px] leading-tight text-muted-foreground break-words">{rotulo}</p>
    </div>
  );
}

/**
 * O que se descobre CONVERSANDO — aberto só quando ela quer.
 *
 * Doze campos abertos em cada linha fariam uma lista de cem pessoas virar uma
 * tela impossível. Fechado, a linha continua sendo nome, contato e etapa.
 */
function DetalheDoInteressado({
  lead,
  onFechar,
}: {
  lead: {
    _id: Id<"landingLeads">;
    empresa?: string;
    instagram?: string;
    site?: string;
    cidade?: string;
    estado?: string;
    segmento?: string;
    eventosPorAno?: number;
    observacoes?: string;
    proximoContato?: string;
    campanha?: string;
    origem: string;
  };
  onFechar: () => void;
}) {
  const atualizar = useMutation(api.admin.atualizarInteressado);
  const [campos, setCampos] = useState({
    empresa: lead.empresa ?? "",
    instagram: lead.instagram ?? "",
    site: lead.site ?? "",
    cidade: lead.cidade ?? "",
    estado: lead.estado ?? "",
    segmento: lead.segmento ?? "",
    eventosPorAno: lead.eventosPorAno?.toString() ?? "",
    observacoes: lead.observacoes ?? "",
    proximoContato: lead.proximoContato ?? "",
    campanha: lead.campanha ?? "",
    origem: lead.origem,
  });
  const [salvando, setSalvando] = useState(false);

  const campo = (k: keyof typeof campos) => ({
    value: campos[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setCampos((c) => ({ ...c, [k]: e.target.value })),
  });

  const salvar = async () => {
    const porte = campos.eventosPorAno.trim();
    if (porte && !Number.isFinite(Number(porte))) {
      toast.error("Eventos por ano precisa ser um número.");
      return;
    }
    setSalvando(true);
    try {
      // `null` LIMPA, string mantém — a convenção de `limparCampos`. Mandar
      // `""` gravaria vazio em vez de apagar o campo.
      const ou = (t: string) => (t.trim() ? t.trim() : null);
      await atualizar({
        leadId: lead._id,
        empresa: ou(campos.empresa),
        instagram: ou(campos.instagram),
        site: ou(campos.site),
        cidade: ou(campos.cidade),
        estado: ou(campos.estado),
        segmento: ou(campos.segmento),
        eventosPorAno: porte ? Number(porte) : null,
        observacoes: ou(campos.observacoes),
        proximoContato: ou(campos.proximoContato),
        campanha: ou(campos.campanha),
        origem: campos.origem as never,
        registrarInteracao: true,
      });
      toast.success("Interessado atualizado.");
      onFechar();
    } catch {
      toast.error("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Empresa</Label>
          <Input className="mt-1 h-9" placeholder="Estúdio de decoração" {...campo("empresa")} />
        </div>
        <div>
          <Label className="text-xs">Instagram</Label>
          <Input className="mt-1 h-9" placeholder="@estudio" {...campo("instagram")} />
        </div>
        <div>
          <Label className="text-xs">Cidade</Label>
          <Input className="mt-1 h-9" {...campo("cidade")} />
        </div>
        <div>
          <Label className="text-xs">Estado</Label>
          <Input className="mt-1 h-9" placeholder="SP" {...campo("estado")} />
        </div>
        <div>
          <Label className="text-xs">Segmento</Label>
          <Input className="mt-1 h-9" placeholder="Casamento, corporativo…" {...campo("segmento")} />
        </div>
        <div>
          <Label className="text-xs">Eventos por ano</Label>
          <Input className="mt-1 h-9" inputMode="numeric" placeholder="40" {...campo("eventosPorAno")} />
        </div>
        <div>
          <Label className="text-xs">Site</Label>
          <Input className="mt-1 h-9" {...campo("site")} />
        </div>
        <div>
          <Label className="text-xs">Próximo contato</Label>
          <Input className="mt-1 h-9" type="date" {...campo("proximoContato")} />
        </div>
        <div>
          <Label className="text-xs">Origem</Label>
          <select
            {...campo("origem")}
            className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
          >
            {ORIGENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Campanha</Label>
          <select
            {...campo("campanha")}
            className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Nenhuma</option>
            <option value={LIVE_ALTAR.slug}>{LIVE_ALTAR.nome}</option>
          </select>
        </div>
      </div>

      <div>
        <Label className="text-xs">Observações</Label>
        {/* Campo de UMA LINHA aqui esconderia o que ela escreveu: "tem sócia,
            atende o litoral, pediu para ligar depois das 18h" não cabe num
            `<Input>`. A trava de `campos-longos` cobra isso do produto
            inteiro. */}
        <Textarea
          rows={2}
          className="mt-1"
          placeholder="O que ela contou"
          value={campos.observacoes}
          onChange={(e) => setCampos((c) => ({ ...c, observacoes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onFechar} className="cursor-pointer">
          Fechar
        </Button>
        <Button size="sm" disabled={salvando} onClick={() => void salvar()} className="cursor-pointer">
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

export function InteressadosNoAltar() {
  /** `""` = todas as campanhas. O filtro é do BANCO, por índice. */
  const [campanha, setCampanha] = useState("");
  /** `""` = todas as etapas. */
  const [etapa, setEtapa] = useState<EstagioDoInteressado | "">("");
  const dados = useQuery(api.admin.listLandingLeads, {
    ...(campanha ? { campanha } : {}),
    ...(etapa ? { status: etapa } : {}),
  });
  const funil = useQuery(
    api.admin.funilDaCampanha,
    campanha ? { campanha } : "skip",
  );
  const setStatus = useMutation(api.admin.setLandingLeadStatus);
  const [aberto, setAberto] = useState<Id<"landingLeads"> | null>(null);
  const [importando, setImportando] = useState(false);

  if (dados === undefined) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const { leads, temMais } = dados;
  const semContato = leads.filter(
    (l) => l.status === "novo" || l.status === "contato_preparado",
  ).length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" /> Interessados no ALTAR
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Decoradoras que pediram demonstração, entraram na lista beta ou vieram de uma
          campanha. Não confundir com o funil de /funil, que é das clientes da decoradora.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {[{ slug: "", nome: "Todas as origens" }, LIVE_ALTAR].map((c) => (
            <button
              key={c.slug || "todas"}
              onClick={() => setCampanha(c.slug)}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
                campanha === c.slug
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {c.nome}
              {"data" in c && ` · ${c.data.split("-").reverse().join("/")}`}
            </button>
          ))}
          {/* Cem pessoas digitadas uma a uma é a planilha voltando pela porta
              dos fundos. O preview vem antes de qualquer gravação. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportando(true)}
            className="ml-auto h-7 cursor-pointer gap-1.5 text-xs"
          >
            <Upload className="size-3.5" /> Importar lista
          </Button>
        </div>

        {/* ── O FILTRO POR ETAPA ─────────────────────────────────────────────
            "Quem ainda não foi abordado?" é a pergunta mais frequente de uma
            campanha, e ela não pode custar rolar duzentas linhas. O filtro é
            do BANCO: filtrar a página carregada devolveria "os não abordados
            ENTRE os 200 primeiros" e a tela leria isso como "os não
            abordados". */}
        <div className="mt-2">
          <select
            value={etapa}
            onChange={(e) => setEtapa(e.target.value as EstagioDoInteressado | "")}
            aria-label="Filtrar por etapa"
            className="h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-xs sm:w-56"
          >
            <option value="">Todas as etapas</option>
            {ESTAGIOS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {importando && <ImportarInteressados onFechar={() => setImportando(false)} />}

      {/* ── O FUNIL DA CAMPANHA ──────────────────────────────────────────────
          Sete contagens, calculadas no servidor a partir das etapas. Só
          aparece com uma campanha escolhida: "quantos confirmaram presença"
          não quer dizer nada somado sobre todas as origens. */}
      {funil && (
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Contagem rotulo="Leads" valor={funil.total} />
            <Contagem rotulo="Sem contato" valor={funil.semContato} />
            <Contagem rotulo="Interessados" valor={funil.interessados} />
            <Contagem rotulo="Confirmaram" valor={funil.confirmados} />
            <Contagem rotulo="Participaram" valor={funil.participaram} />
            <Contagem rotulo="Testando" valor={funil.testando} />
            <Contagem rotulo="Clientes" valor={funil.clientes} />
          </div>
          {/* A tela nunca afirma o que não contou. */}
          {!funil.completa && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              A campanha passou do teto de contagem — os números acima são parciais.
            </p>
          )}
        </div>
      )}

      {/* ── A FILA DE CONTATO ────────────────────────────────────────────
          Só com uma campanha escolhida: "quem falta abordar" é uma pergunta
          de campanha, não da caixa de entrada inteira. */}
      {campanha && (
        <div className="border-b border-border">
          <FilaDeContato campanha={campanha} />
        </div>
      )}

      {leads.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium">
            {etapa
              ? `Ninguém em "${ESTAGIOS.find((e) => e.id === etapa)?.rotulo}"`
              : campanha
                ? "Nenhum interessado nesta campanha ainda"
                : "Nenhum interessado ainda"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {etapa
              ? "Tire o filtro para ver as outras etapas."
              : campanha
                ? "Divulgue o link com ?campanha= para as inscrições chegarem já marcadas, ou importe uma lista."
                : "Quem pedir demonstração ou entrar na lista beta pelo site aparece aqui."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          <p className="px-5 py-2 text-xs text-muted-foreground">
            {/* Honesto sobre o que foi carregado — nunca um total inventado. */}
            {leads.length} {leads.length === 1 ? "carregado" : "carregados"}
            {temMais && " (há mais)"}
            {semContato > 0 && ` · ${semContato} ainda sem contato`}
          </p>

          {leads.map((lead) => (
            <div key={lead._id} className="px-5 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{lead.name}</p>
                    {lead.empresa && (
                      <span className="truncate text-xs text-muted-foreground">
                        {lead.empresa}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        lead.intent === "demo"
                          ? "bg-primary/10 text-primary"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                      )}
                    >
                      {lead.intent === "demo" ? "Demonstração" : "Lista beta"}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {rotuloDaOrigem(lead.origem)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-3">
                    <a
                      href={`mailto:${lead.email}`}
                      className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                    >
                      {lead.email}
                    </a>
                    {lead.whatsapp && (
                      <a
                        href={`https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                      >
                        {lead.whatsapp}
                      </a>
                    )}
                    {(lead.cidade || lead.estado) && (
                      <span className="text-xs text-muted-foreground">
                        {[lead.cidade, lead.estado].filter(Boolean).join("/")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(lead.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <select
                    value={lead.status}
                    aria-label={`Etapa de ${lead.name}`}
                    onChange={async (e) => {
                      try {
                        await setStatus({
                          leadId: lead._id,
                          status: e.target.value as EstagioDoInteressado,
                        });
                        toast.success("Etapa atualizada.");
                      } catch {
                        toast.error("Não foi possível atualizar a etapa.");
                      }
                    }}
                    className={cn(
                      "h-9 cursor-pointer rounded-md border border-input px-2 text-xs sm:w-44",
                      TOM_DO_ESTAGIO[lead.status],
                    )}
                  >
                    {ESTAGIOS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.rotulo}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setAberto(aberto === lead._id ? null : lead._id)}
                    aria-label={`Detalhes de ${lead.name}`}
                    className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-accent"
                  >
                    {aberto === lead._id ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {aberto === lead._id && (
                <DetalheDoInteressado lead={lead} onFechar={() => setAberto(null)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
