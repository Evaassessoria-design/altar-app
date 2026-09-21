import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { paraOCampo, valorDigitado } from "@/lib/valor-digitado.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";
import { ROTULO_DO_STATUS } from "@/convex/lib/propostaComercial.ts";
import { VisaoDoCliente } from "../_components/visao-do-cliente.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// A PROPOSTA — ESCREVER, VER COMO A CLIENTE VÊ, REGISTRAR
//
// ── O QUE ESTA TELA DELIBERADAMENTE NÃO TEM ─────────────────────────────────
// Editor visual, assinatura, cobrança e envio. O ALTAR não manda e-mail nem
// WhatsApp, e "Marcar como enviada" é um REGISTRO do que aconteceu fora do
// sistema — não um botão que envia.
//
// ── POR QUE O VALOR É TEXTO ─────────────────────────────────────────────────
// `valorDigitado` lê "1.500,00" como mil e quinhentos. Foi um defeito real em
// cinco telas: `parseFloat` devolvia 1.5, e o número entrava dividido por mil
// sem nenhum aviso. Aqui seria pior ainda — é o que a cliente lê.
// ─────────────────────────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type ItemEditavel = { descricao: string; detalhe: string; valor: string };

export default function PropostaPage() {
  const { id } = useParams<{ id: string }>();
  const propostaId = id as Id<"proposals">;
  const navigate = useNavigate();

  const proposta = useQuery(api.propostas.get, { id: propostaId });
  // A visão do cliente é uma consulta PRÓPRIA. A tela nunca monta o documento
  // a partir do registro que ela tem na mão: quem decide o que a cliente lê é
  // `paraOCliente`, no servidor, e não a renderização daqui.
  const clienteVe = useQuery(api.propostas.comoOClienteVe, { id: propostaId });
  const empresa = useQuery(api.users.getCurrentUser);
  const salvar = useMutation(api.propostas.update);
  const registrarEnvio = useMutation(api.propostas.registrarEnvio);
  const registrarDecisao = useMutation(api.propostas.registrarDecisao);
  const trazerDoOrcamento = useMutation(api.propostas.trazerDoOrcamento);
  const remover = useMutation(api.propostas.remove);

  const [titulo, setTitulo] = useState("");
  const [apresentacao, setApresentacao] = useState("");
  const [itens, setItens] = useState<ItemEditavel[]>([]);
  const [condicoes, setCondicoes] = useState("");
  const [validade, setValidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [vendo, setVendo] = useState(false);

  // Carrega UMA vez: recarregar por reatividade descartaria o que ela está
  // digitando neste instante.
  useEffect(() => {
    if (carregado || !proposta) return;
    setTitulo(proposta.titulo);
    setApresentacao(proposta.apresentacao ?? "");
    setItens(
      proposta.itens.map((i) => ({
        descricao: i.descricao,
        detalhe: i.detalhe ?? "",
        valor: paraOCampo(i.valor),
      })),
    );
    setCondicoes(proposta.condicoesPagamento ?? "");
    setValidade(proposta.validadeAte ?? "");
    setObservacoes(proposta.observacoes ?? "");
    setCarregado(true);
  }, [proposta, carregado]);

  if (proposta === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  // `null` cobre inexistente E de outra empresa, sem distinguir.
  if (proposta === null) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link to="/propostas" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 inline size-4" /> Propostas
        </Link>
        <p className="mt-3 text-sm text-muted-foreground">Proposta não encontrada.</p>
      </div>
    );
  }

  /** O total do que está NA TELA, em centavos — a mesma unidade do servidor. */
  const total = itens.reduce((s, i) => s + (valorDigitado(i.valor) ?? 0), 0);
  const emCentavos = (v: number) => Math.round(v * 100);

  const comErro = (e: unknown) =>
    toast.error(
      e instanceof ConvexError
        ? (e.data as { message: string }).message
        : "Não foi possível salvar.",
    );

  /** Lê os valores digitados. Devolve `null` quando algum não dá para ler. */
  const itensParaSalvar = () => {
    const prontos: { descricao: string; detalhe?: string; valor: number }[] = [];
    for (const [i, item] of itens.entries()) {
      if (!item.descricao.trim()) {
        toast.error(`O item ${i + 1} precisa de uma descrição.`);
        return null;
      }
      const valor = item.valor.trim() ? valorDigitado(item.valor) : 0;
      if (valor === null || valor < 0) {
        toast.error(`Valor não reconhecido no item ${i + 1}. Ex.: 38.000,00`);
        return null;
      }
      prontos.push({
        descricao: item.descricao.trim(),
        detalhe: item.detalhe.trim() || undefined,
        valor,
      });
    }
    return prontos;
  };

  const handleSalvar = async () => {
    const prontos = itensParaSalvar();
    if (!prontos) return;
    setSalvando(true);
    try {
      await salvar({
        id: propostaId,
        titulo: titulo.trim() || undefined,
        apresentacao: apresentacao.trim() || null,
        itens: prontos,
        condicoesPagamento: condicoes.trim() || null,
        validadeAte: validade.trim() || null,
        observacoes: observacoes.trim() || null,
      });
      toast.success("Proposta salva.");
    } catch (e) {
      comErro(e);
    } finally {
      setSalvando(false);
    }
  };

  /**
   * O documento pronto — ou o recado do que impede de mostrá-lo.
   *
   * `comoOClienteVe` reflete o que está SALVO. Gerar o PDF do que está na tela
   * mandaria para a cliente um número que o ALTAR não guardou; avisar é melhor
   * do que escolher em silêncio qual das duas versões vale.
   */
  const documentoSalvo = () => {
    if (clienteVe === undefined) {
      toast.error("Ainda carregando a proposta.");
      return null;
    }
    if (clienteVe === null) return null;
    if (emCentavos(clienteVe.investimento) !== emCentavos(total)) {
      toast.error("Há alterações não salvas. Salve para ver o que a cliente vai receber.");
      return null;
    }
    return clienteVe;
  };

  const handlePdf = async () => {
    const doc = documentoSalvo();
    if (!doc) return;
    try {
      const { generatePropostaPDF } = await import("@/lib/generate-proposta-pdf.ts");
      // O PDF sai do MESMO objeto da pré-visualização — `comoOClienteVe`, que
      // passou pela fronteira de audiência. Dois caminhos, um documento.
      generatePropostaPDF({ proposta: doc, empresa: empresa ?? null });
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    }
  };

  const abrirVisao = () => {
    if (documentoSalvo()) setVendo(true);
  };

  const decidir = async (
    decisao: "aceita" | "recusada" | "rascunho",
    pergunta: string,
  ) => {
    if (!window.confirm(pergunta)) return;
    try {
      await registrarDecisao({ id: propostaId, decisao });
      toast.success("Registrado.");
    } catch (e) {
      comErro(e);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link
        to="/propostas"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Propostas
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{proposta.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {proposta.clienteNome}
            {" · "}
            {ROTULO_DO_STATUS[proposta.status]}
            {proposta.vencida && " · venceu"}
          </p>
        </div>
        <span className="text-lg font-semibold">{brl.format(total)}</span>
      </div>

      {/* A proposta já foi enviada e mudou depois: a cliente tem outro número
          na mão, e discutir sem saber disso é o erro que este aviso evita. */}
      {proposta.versaoEnviada && (
        <div className="mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <p>
            Enviada em {formatEventDayOnly(proposta.versaoEnviada.enviadaEm)} por{" "}
            {brl.format(proposta.versaoEnviada.investimento)}.
          </p>
          {emCentavos(proposta.versaoEnviada.investimento) !== emCentavos(total) && (
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              A versão atual está em {brl.format(total)} — diferente da que a cliente recebeu.
              Reenvie para atualizar o que vale.
            </p>
          )}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <Label htmlFor="p-titulo" className="text-xs">
            Título
          </Label>
          <Input
            id="p-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="p-apresentacao" className="text-xs">
            Apresentação
          </Label>
          <AutoTextarea
            id="p-apresentacao"
            minRows={3}
            value={apresentacao}
            onChange={(e) => setApresentacao(e.target.value)}
            placeholder="O conceito, o que você entendeu do desejo dela, o que torna este evento este evento."
            className="mt-1"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">O que está incluído</Label>
            {proposta.eventId && (
              <button
                type="button"
                onClick={() =>
                  void trazerDoOrcamento({ id: propostaId })
                    .then((r) => {
                      toast.success(
                        r.acrescentados === 0
                          ? "O orçamento deste evento ainda não tem receitas."
                          : `${r.acrescentados} linha(s) trazida(s). Ajuste os textos para a cliente.`,
                      );
                      setCarregado(false);
                    })
                    .catch(comErro)
                }
                className="cursor-pointer text-xs text-primary hover:underline"
              >
                Trazer receitas do orçamento
              </button>
            )}
          </div>

          <div className="mt-1 space-y-2">
            {itens.map((item, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5">
                <div className="flex gap-2">
                  <Input
                    value={item.descricao}
                    onChange={(e) =>
                      setItens((a) =>
                        a.map((x, idx) => (idx === i ? { ...x, descricao: e.target.value } : x)),
                      )
                    }
                    placeholder="Projeto floral da cerimônia"
                    className="flex-1"
                  />
                  <Input
                    inputMode="decimal"
                    value={item.valor}
                    onChange={(e) =>
                      setItens((a) =>
                        a.map((x, idx) => (idx === i ? { ...x, valor: e.target.value } : x)),
                      )
                    }
                    placeholder="38.000,00"
                    className="w-32"
                  />
                  <button
                    type="button"
                    onClick={() => setItens((a) => a.filter((_, idx) => idx !== i))}
                    aria-label={`Remover item ${i + 1}`}
                    className="flex-shrink-0 cursor-pointer rounded-lg p-2.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <Input
                  value={item.detalhe}
                  onChange={(e) =>
                    setItens((a) =>
                      a.map((x, idx) => (idx === i ? { ...x, detalhe: e.target.value } : x)),
                    )
                  }
                  placeholder="Uma linha de detalhe (opcional)"
                  className="mt-2 text-sm"
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setItens((a) => [...a, { descricao: "", detalhe: "", valor: "" }])}
              className="cursor-pointer gap-1.5"
            >
              <Plus className="size-4" /> Item
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="p-condicoes" className="text-xs">
            Condições de pagamento
          </Label>
          <AutoTextarea
            id="p-condicoes"
            minRows={2}
            value={condicoes}
            onChange={(e) => setCondicoes(e.target.value)}
            placeholder="30% na assinatura e o saldo em 3 parcelas, a última até 10 dias antes do evento."
            className="mt-1"
          />
          {/* Texto livre de propósito: condição de pagamento é decisão
              comercial dela, e um formulário de parcelas imporia uma regra que
              o ALTAR não tem por que ter. */}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-validade" className="text-xs">
              Válida até
            </Label>
            <Input
              id="p-validade"
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="p-obs" className="text-xs">
            Observações
          </Label>
          <AutoTextarea
            id="p-obs"
            minRows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button onClick={() => void handleSalvar()} disabled={salvando} className="cursor-pointer">
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
          <Button variant="outline" onClick={abrirVisao} className="cursor-pointer gap-1.5">
            <Eye className="size-4" /> Ver como a cliente vê
          </Button>
          <Button variant="outline" onClick={() => void handlePdf()} className="cursor-pointer gap-1.5">
            <Download className="size-4" /> PDF
          </Button>
        </div>
      </div>

      {/* ── REGISTRO DO QUE ACONTECEU FORA DO SISTEMA ──────────────────── */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Acompanhamento</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          O ALTAR não envia nada e não assina nada. Aqui você registra o que já aconteceu.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void registrarEnvio({ id: propostaId })
                .then(() => toast.success("Registrado como enviada. O valor foi congelado."))
                .catch(comErro)
            }
            className="cursor-pointer gap-1.5"
          >
            <Send className="size-4" />
            {proposta.versaoEnviada ? "Registrar novo envio" : "Marcar como enviada"}
          </Button>

          {proposta.status !== "aceita" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void decidir(
                  "aceita",
                  "Registrar que a cliente aceitou esta proposta? É um registro seu, não uma assinatura dela — e dá para desfazer.",
                )
              }
              className="cursor-pointer gap-1.5"
            >
              <Check className="size-4" /> Aceita
            </Button>
          )}
          {proposta.status !== "recusada" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void decidir("recusada", "Registrar que esta proposta foi recusada?")
              }
              className="cursor-pointer gap-1.5"
            >
              <X className="size-4" /> Recusada
            </Button>
          )}
          {(proposta.status === "aceita" || proposta.status === "recusada") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void decidir(
                  "rascunho",
                  "Desfazer o registro e voltar a proposta para rascunho? O que foi enviado continua guardado.",
                )
              }
              className="cursor-pointer"
            >
              Desfazer
            </Button>
          )}
        </div>

        {proposta.decididaEm && (
          <p className="mt-3 text-xs text-muted-foreground">
            {ROTULO_DO_STATUS[proposta.status]} em {formatEventDayOnly(proposta.decididaEm)}
            {proposta.decididaPor && ` · registrado por ${proposta.decididaPor}`}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            if (
              !window.confirm(
                `Excluir a proposta "${proposta.titulo}"? O registro do que foi enviado some junto. Não há como desfazer.`,
              )
            ) {
              return;
            }
            void remover({ id: propostaId })
              .then(() => {
                toast.success("Proposta excluída.");
                navigate("/propostas");
              })
              .catch(comErro);
          }}
          className={cn(
            "mt-4 inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground",
            "cursor-pointer hover:text-destructive hover:underline sm:min-h-0",
          )}
        >
          <Trash2 className="size-3.5" /> Excluir proposta
        </button>
      </div>

      {vendo && clienteVe && (
        <VisaoDoCliente documento={clienteVe} onClose={() => setVendo(false)} />
      )}
    </div>
  );
}
