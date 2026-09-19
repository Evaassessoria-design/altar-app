import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowLeft, Filter, Search, ShieldAlert, X } from "lucide-react";
import { formatTimestampComHora } from "@/lib/safe-date.ts";
import {
  CLASSE_DA_PRIORIDADE,
  ROTULO_DA_CATEGORIA,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_DEPARTAMENTO,
  type Departamento,
  type Prioridade,
} from "@/lib/central-fila.ts";
import {
  buscaAtiva,
  contarFiltrosAtivos,
  descreverResultado,
  OPCOES_DE_CANAL,
  OPCOES_DE_STATUS,
  ROTULO_DO_CANAL,
  TODOS,
  type Canal,
  type StatusDeConversa,
} from "@/lib/central-inbox.ts";
import { Conversa } from "./conversa.tsx";
import { PainelDoContato } from "./painel-do-contato.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// CAIXA DE ENTRADA — três colunas: lista · conversa · quem é a pessoa
//
// No celular as três viram uma só, em profundidade: a lista abre a conversa,
// e a conversa abre a ficha. Atender pelo telefone é caso real (o número
// comercial do ALTAR não espera o Matheus estar na mesa), então nenhuma ação
// desta tela pode existir só no desktop.
//
// ── OS FILTROS SÃO DO BANCO, NÃO DA PÁGINA ──────────────────────────────────
// Todo filtro daqui vai como argumento para `communications.listarConversas`,
// que os aplica na consulta e pagina o conjunto inteiro. Nada é filtrado
// depois de carregado: "3 urgentes entre as 25 que couberam na tela" seria
// lido como "3 urgentes", e a quarta ficaria sem resposta.
// ─────────────────────────────────────────────────────────────────────────────

const POR_PAGINA = 25;

const CLASSE_DO_SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

type ConversaSelecionada = Id<"communicationConversations"> | null;

export function CaixaDeEntrada() {
  const [busca, setBusca] = useState("");
  const [departamento, setDepartamento] = useState<Departamento | "">("");
  const [status, setStatus] = useState<StatusDeConversa | "">("");
  const [prioridade, setPrioridade] = useState<Prioridade | "">("");
  const [canal, setCanal] = useState<Canal | "">("");
  const [responsavel, setResponsavel] = useState<string>("");
  const [apenasEscaladas, setApenasEscaladas] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [selecionada, setSelecionada] = useState<ConversaSelecionada>(null);
  const [fichaAberta, setFichaAberta] = useState(false);

  // A busca espera a pessoa parar de digitar: sem isso, cada tecla vira uma
  // consulta nova e a lista pisca a cada letra.
  const [buscaAdiada] = useDebounce(busca, 350);

  const operadores = useQuery(api.admin.listarOperadores, {});

  const filtros = {
    departamento: departamento || undefined,
    status: status || undefined,
    prioridade: prioridade || undefined,
    canal: canal || undefined,
    responsavelUserId: (responsavel || undefined) as Id<"users"> | undefined,
    apenasEscaladas: apenasEscaladas || undefined,
    busca: buscaAtiva(buscaAdiada) ? buscaAdiada : undefined,
  };

  const { results, status: estadoDaLista, loadMore } = usePaginatedQuery(
    api.communications.listarConversas,
    filtros,
    { initialNumItems: POR_PAGINA },
  );

  const ativos = contarFiltrosAtivos({
    departamento,
    status,
    prioridade,
    canal,
    responsavelUserId: responsavel,
    apenasEscaladas,
    busca: buscaAdiada,
  });

  const resumo = descreverResultado({
    carregados: results.length,
    temMais: estadoDaLista === "CanLoadMore" || estadoDaLista === "LoadingMore",
    ordenadoPor: buscaAtiva(buscaAdiada) ? "relevancia" : "recencia",
    carregando: estadoDaLista === "LoadingFirstPage",
  });

  function limparFiltros() {
    setBusca("");
    setDepartamento("");
    setStatus("");
    setPrioridade("");
    setCanal("");
    setResponsavel("");
    setApenasEscaladas(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(280px,320px)]">
      {/* ── Coluna 1: lista ───────────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-xl border border-border bg-card overflow-hidden flex flex-col",
          // No celular, abrir a conversa esconde a lista.
          selecionada && "hidden lg:flex",
        )}
      >
        <div className="p-3 space-y-2 border-b border-border">
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, número ou assunto"
              className="pl-8"
              aria-label="Buscar conversas"
            />
            {busca.length > 0 && (
              <button
                type="button"
                onClick={() => setBusca("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFiltrosAbertos((v) => !v)}
              className="h-8"
            >
              <Filter className="size-3.5" /> Filtros
              {ativos > 0 && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5">
                  {ativos}
                </span>
              )}
            </Button>
            {ativos > 0 && (
              <Button size="sm" variant="ghost" className="h-8" onClick={limparFiltros}>
                Limpar
              </Button>
            )}
          </div>

          {filtrosAbertos && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <select
                aria-label="Departamento"
                className={CLASSE_DO_SELECT}
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value as Departamento | "")}
              >
                <option value={TODOS}>Todos os departamentos</option>
                {(Object.keys(ROTULO_DO_DEPARTAMENTO) as Departamento[]).map((d) => (
                  <option key={d} value={d}>
                    {ROTULO_DO_DEPARTAMENTO[d]}
                  </option>
                ))}
              </select>

              <select
                aria-label="Status"
                className={CLASSE_DO_SELECT}
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusDeConversa | "")}
              >
                <option value={TODOS}>Todos os status</option>
                {OPCOES_DE_STATUS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>

              <select
                aria-label="Prioridade"
                className={CLASSE_DO_SELECT}
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as Prioridade | "")}
              >
                <option value={TODOS}>Todas as prioridades</option>
                {(Object.keys(ROTULO_DA_PRIORIDADE) as Prioridade[]).map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_DA_PRIORIDADE[p]}
                  </option>
                ))}
              </select>

              <select
                aria-label="Canal"
                className={CLASSE_DO_SELECT}
                value={canal}
                onChange={(e) => setCanal(e.target.value as Canal | "")}
              >
                <option value={TODOS}>Todos os canais</option>
                {OPCOES_DE_CANAL.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>

              <select
                aria-label="Responsável"
                className={cn(CLASSE_DO_SELECT, "col-span-2")}
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              >
                <option value={TODOS}>Qualquer responsável</option>
                {(operadores ?? []).map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.name}
                  </option>
                ))}
              </select>

              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={apenasEscaladas}
                  onChange={(e) => setApenasEscaladas(e.target.checked)}
                  className="size-4"
                />
                Só escaladas para o CEO
              </label>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">{resumo}</p>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[70vh] divide-y divide-border">
          {estadoDaLista === "LoadingFirstPage" ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : results.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Nenhuma conversa com estes filtros.
            </p>
          ) : (
            results.map((c) => (
              <ItemDaLista
                key={c._id}
                conversa={c}
                selecionada={selecionada === c._id}
                onSelecionar={() => {
                  setSelecionada(c._id);
                  setFichaAberta(false);
                }}
              />
            ))
          )}
        </div>

        {(estadoDaLista === "CanLoadMore" || estadoDaLista === "LoadingMore") && (
          <div className="p-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={estadoDaLista === "LoadingMore"}
              onClick={() => loadMore(POR_PAGINA)}
            >
              {estadoDaLista === "LoadingMore" ? "Carregando…" : "Carregar mais"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Coluna 2: conversa ────────────────────────────────────────── */}
      <div className={cn(!selecionada && "hidden lg:block")}>
        {selecionada ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 lg:hidden">
              <Button size="sm" variant="ghost" onClick={() => setSelecionada(null)}>
                <ArrowLeft className="size-4" /> Conversas
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto xl:hidden"
                onClick={() => setFichaAberta((v) => !v)}
              >
                {fichaAberta ? "Ver conversa" : "Ver ficha"}
              </Button>
            </div>

            <div className="hidden lg:flex xl:hidden justify-end">
              <Button size="sm" variant="outline" onClick={() => setFichaAberta((v) => !v)}>
                {fichaAberta ? "Ver conversa" : "Ver ficha do contato"}
              </Button>
            </div>

            {fichaAberta ? (
              <PainelDoContato conversationId={selecionada} />
            ) : (
              <Conversa conversationId={selecionada} operadores={operadores ?? []} />
            )}
          </div>
        ) : (
          <div className="h-full rounded-xl border border-dashed border-border flex items-center justify-center p-10">
            <p className="text-sm text-muted-foreground text-center">
              Escolha uma conversa à esquerda para ver o histórico completo.
            </p>
          </div>
        )}
      </div>

      {/* ── Coluna 3: ficha do contato (só em telas largas) ───────────── */}
      <div className="hidden xl:block">
        {selecionada ? (
          <PainelDoContato conversationId={selecionada} />
        ) : (
          <div className="h-full rounded-xl border border-dashed border-border flex items-center justify-center p-6">
            <p className="text-xs text-muted-foreground text-center">
              A ficha de quem está do outro lado aparece aqui.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type ItemDaListaProps = {
  conversa: {
    _id: Id<"communicationConversations">;
    assunto: string;
    channel: Canal;
    departamento: string;
    categoria?: string;
    prioridade: Prioridade;
    status: string;
    escaladaParaCeo: boolean;
    naoLidas: number;
    ultimaMensagemEm: number;
    contato: { nome: string; tipo: string; temVinculo: boolean } | null;
  };
  selecionada: boolean;
  onSelecionar: () => void;
};

function ItemDaLista({ conversa, selecionada, onSelecionar }: ItemDaListaProps) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={cn(
        "w-full text-left px-3 py-3 hover:bg-muted/60 transition-colors",
        selecionada && "bg-muted",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm truncate">
          {conversa.contato?.nome ?? "Contato desconhecido"}
        </p>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">
          {formatTimestampComHora(conversa.ultimaMensagemEm)}
        </span>
      </div>

      <p className="text-xs text-muted-foreground truncate mt-0.5">{conversa.assunto}</p>

      <div className="flex items-center gap-1 flex-wrap mt-1.5">
        {conversa.naoLidas > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary text-primary-foreground">
            {conversa.naoLidas} nova{conversa.naoLidas === 1 ? "" : "s"}
          </span>
        )}
        {conversa.escaladaParaCeo && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-1">
            <ShieldAlert className="size-2.5" /> Escalada
          </span>
        )}
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            CLASSE_DA_PRIORIDADE[conversa.prioridade],
          )}
        >
          {ROTULO_DA_PRIORIDADE[conversa.prioridade]}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
          {ROTULO_DO_DEPARTAMENTO[conversa.departamento as Departamento]}
        </span>
        {conversa.categoria && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
            {ROTULO_DA_CATEGORIA[conversa.categoria] ?? conversa.categoria}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {ROTULO_DO_CANAL[conversa.channel]}
        </span>
      </div>
    </button>
  );
}
