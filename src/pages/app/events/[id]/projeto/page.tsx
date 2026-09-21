import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Layers, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { formatEventDateLong } from "@/lib/event-date.ts";
import { PROJECT_SCOPES, scopeMeta, AVISO_REFERENCIA, type ProjectScope } from "@/lib/photo-scope.ts";
import {
  agruparPorAmbiente,
  fotoDoItem,
  type ItemDoProjeto,
} from "@/lib/decoration-project.ts";
import {
  montarProjetoVisual,
  totalDeImagens,
  type FotoDoProjeto,
} from "@/lib/projeto-visual.ts";
import { PrateleiraDeFotos } from "@/components/projeto/prateleira-de-fotos.tsx";
import { labelDoTipoDeEvento } from "@/lib/event-types.ts";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// PROJETO DE DECORAÇÃO
//
// É uma LEITURA de `assemblyItems` organizada por ambiente — não um cadastro
// paralelo. O mesmo item que a equipe monta é o que o projeto mostra; cadastrar
// duas vezes garantiria que as duas versões divergissem na primeira semana.
//
// A única coisa que se edita aqui é o ESCOPO: se aquele item é contratado,
// referência estética ou algo que ficou de fora. É a distinção que evita a
// confusão mais cara da decoração — o cliente achar que a inspiração foi
// contratada.
// ─────────────────────────────────────────────────────────────────────────────

function SeloEscopo({ scope }: { scope?: string }) {
  const meta = scopeMeta(scope);
  // Item sem classificação não recebe selo: cadastro incompleto não vira
  // promessa ao cliente.
  if (!meta) return null;
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", meta.classe)}>
      {meta.label}
    </span>
  );
}

export default function ProjetoDecoracaoPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;

  const event = useQuery(api.events.get, { id: eventId });
  const itens = useQuery(api.assemblyItems.listByEvent, { eventId });
  // As fotos da GALERIA, que é a biblioteca. Esta tela não sobe nem guarda
  // imagem nenhuma: ela LÊ o mesmo registro, então classificar uma foto lá
  // muda o projeto aqui, sem cópia e sem divergência.
  const fotos = useQuery(api.gallery.listPhotos, { eventId });
  // A planta já existe; o que faltava era ela estar perto do projeto.
  const plantas = useQuery(api.layoutRenders.listByEvent, { eventId });
  const atualizar = useMutation(api.assemblyItems.update);

  const lista = (itens ?? []) as unknown as ItemDoProjeto[];
  const projeto = montarProjetoVisual(
    agruparPorAmbiente(lista),
    (fotos ?? []) as unknown as FotoDoProjeto[],
  );
  const totalItens = lista.length;
  const totalFotos = totalDeImagens(projeto);
  const carregando = itens === undefined || fotos === undefined;
  const vazio = totalItens === 0 && totalFotos === 0;

  // A planta pronta mais recente. `listByEvent` já vem da mais nova para a
  // mais antiga; render sem saída ainda está processando ou falhou.
  const planta = (plantas ?? []).find((r) => r.outputUrl) ?? null;

  /**
   * Quantas fotos ainda não dizem o que são.
   *
   * Inclui as que TÊM ambiente: uma foto situada no Salão de vidro mas sem
   * "inspiração ou contratada" não é menos pendente que uma foto solta.
   */
  const semClassificacao =
    projeto.ambientes.reduce((n, a) => n + a.semClassificacao.length, 0) +
    projeto.semAmbiente.semClassificacao.length;

  const galeria = `/eventos/${id}/fotos`;
  /**
   * A galeria JÁ FILTRADA no ambiente do bloco.
   *
   * O "+N na Galeria" levava para setenta fotos e deixava a decoradora
   * procurar. A galeria já sabia filtrar por ambiente — o filtro só não tinha
   * endereço. Agora tem, e é o MESMO filtro do servidor: nada é reclassificado
   * aqui, nada é editado aqui.
   */
  const galeriaDo = (ambiente: string) =>
    ambiente ? `${galeria}?ambiente=${encodeURIComponent(ambiente)}` : galeria;

  const mudarEscopo = async (itemId: Id<"assemblyItems">, scope: ProjectScope | "") => {
    try {
      // `null`, e não `undefined`: `undefined` é descartado no transporte e o
      // pedido de limpar nunca chegaria ao servidor.
      await atualizar({ id: itemId, projectScope: scope === "" ? null : scope });
      toast.success("Classificação atualizada.");
    } catch {
      toast.error("Não foi possível salvar a classificação.");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Link
        to={`/eventos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <ArrowLeft className="size-4" />
        {event?.name ?? "Evento"}
      </Link>

      {/* ── CAPA ──────────────────────────────────────────────────────────
          Tipográfica, sem imagem de capa. Escolher "a primeira foto" ou "a
          primeira referência" como capa seria uma regra inventada em silêncio
          — e a capa de um casamento é decisão dela, não de um `[0]`. Enquanto
          não houver como ESCOLHER, a tela não escolhe. */}
      <header className="space-y-1">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Projeto visual
        </p>
        <h1 className="font-serif text-2xl leading-tight md:text-3xl">
          {event?.name ?? "Evento"}
        </h1>
        {event && (
          <p className="text-sm text-muted-foreground">
            {[
              formatEventDateLong(event.date),
              labelDoTipoDeEvento(event.type),
              event.location,
            ]
              .filter((v) => v && v !== "—")
              .join("  ·  ")}
          </p>
        )}
      </header>

      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : vazio ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>O projeto ainda não tem nada para mostrar</EmptyTitle>
            <EmptyDescription>
              Esta tela não guarda nada por conta própria: ela mostra as FOTOS da Galeria
              classificadas por ambiente e os ITENS do Caderno de Montagem, lado a lado.
              Comece por qualquer um dos dois.
            </EmptyDescription>
          </EmptyHeader>
          {/* Dizer DE ONDE vêm as coisas não basta: o Caderno de Montagem mora
              dentro do Questionário, em cada área, e não é um lugar que alguém
              adivinhe na primeira semana. */}
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild size="sm" className="cursor-pointer">
                <Link to={galeria}>
                  Enviar referências <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="cursor-pointer">
                <Link to={`/eventos/${id}/briefing`}>Abrir o Questionário</Link>
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-4">
          {/* ── O QUE FALTA PARA A TELA FICAR BOA ─────────────────────────
              Esta tela só mostra o casamento se a galeria estiver organizada,
              e isso é uma verdade do produto, não um defeito a esconder. Diz
              o número e o caminho — e não classifica nada aqui: a Galeria
              continua sendo o único lugar que edita foto. */}
          {semClassificacao > 0 && (
            <Link
              to={galeria}
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20"
            >
              <span className="text-amber-900 dark:text-amber-200">
                <strong className="font-semibold">
                  {semClassificacao}{" "}
                  {semClassificacao === 1 ? "foto ainda não diz" : "fotos ainda não dizem"}
                </strong>{" "}
                se {semClassificacao === 1 ? "é" : "são"} inspiração ou contratado.
              </span>
              <span className="flex flex-shrink-0 items-center gap-1 font-medium text-amber-800 dark:text-amber-300">
                Classificar <ArrowRight className="size-4" />
              </span>
            </Link>
          )}

          {/* ── REFERÊNCIAS DO EVENTO ────────────────────────────────────
              As fotos que ainda não têm ambiente. Não são erro: é o estado
              natural de quem acabou de subir vinte imagens. Ficam no topo,
              como o conceito geral, com o convite a classificar. */}
          {(projeto.semAmbiente.referencias.length > 0 ||
            projeto.semAmbiente.semClassificacao.length > 0) && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-5">
              <PrateleiraDeFotos
                titulo="Referências do evento"
                descricao="A direção estética geral, ainda sem ambiente."
                tom="inspiracao"
                destaque
                fotos={projeto.semAmbiente.referencias}
                verTodasEm={galeria}
              />
              <PrateleiraDeFotos
                titulo="Ainda sem classificação"
                descricao="Diga na Galeria se cada uma é inspiração ou contratada, e de que ambiente — elas passam a aparecer no lugar certo."
                fotos={projeto.semAmbiente.semClassificacao}
                verTodasEm={galeria}
              />
            </section>
          )}

          {projeto.ambientes.map((ambiente) => (
            <section
              key={ambiente.key}
              className="bg-card rounded-xl border border-border overflow-hidden"
            >
              {/* O nome do ambiente é o protagonista do bloco: é por ele que
                  ela procura quando está pensando "como vai ficar a mesa do
                  bolo?". */}
              <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  {/* `break-words`: ambiente é texto livre, e um nome longo
                      sem espaço ("Jardimdasoliveiras...") estouraria a caixa
                      num telefone de 320px. */}
                  <h2 className="font-serif text-lg leading-tight break-words">
                    {ambiente.emoji ? `${ambiente.emoji} ` : ""}
                    {ambiente.label}
                  </h2>
                  {/* A categoria do briefing não some quando ela dá nome ao
                      espaço: "Entrada" continua sendo Mobiliário, e é assim
                      que ela vai achar o item no Questionário. */}
                  {ambiente.categoria && (
                    <p className="text-xs text-muted-foreground">{ambiente.categoria}</p>
                  )}
                </div>
                <p className="flex-shrink-0 text-xs text-muted-foreground">
                  {ambiente.itens.length > 0 &&
                    `${ambiente.itens.length} ${ambiente.itens.length === 1 ? "item" : "itens"}`}
                </p>
              </div>

              {/* ── AS PRATELEIRAS DO AMBIENTE ────────────────────────────
                  Separadas e rotuladas: inspiração, decisão, resultado e o que
                  ficou de fora são coisas diferentes, e misturá-las é a
                  confusão mais cara da decoração. Prateleira vazia some. */}
              {(ambiente.referencias.length > 0 ||
                ambiente.contratadas.length > 0 ||
                ambiente.execucao.length > 0 ||
                ambiente.foraDoEscopo.length > 0 ||
                ambiente.semClassificacao.length > 0) && (
                <div className="space-y-4 border-b border-border px-5 py-4">
                  <PrateleiraDeFotos
                    titulo="Contratado"
                    descricao="O que foi definido para execução."
                    tom="contratado"
                    destaque={ambiente.execucao.length === 0}
                    fotos={ambiente.contratadas}
                    verTodasEm={galeriaDo(ambiente.label)}
                  />
                  <PrateleiraDeFotos
                    titulo="Inspiração"
                    descricao="Direção estética — não é obrigação de montagem."
                    tom="inspiracao"
                    destaque={ambiente.contratadas.length === 0 && ambiente.execucao.length === 0}
                    fotos={ambiente.referencias}
                    verTodasEm={galeriaDo(ambiente.label)}
                  />
                  <PrateleiraDeFotos
                    titulo="Como ficou"
                    descricao="Registro da execução."
                    tom="execucao"
                    destaque
                    fotos={ambiente.execucao}
                    verTodasEm={galeriaDo(ambiente.label)}
                  />
                  <PrateleiraDeFotos
                    titulo="Ficou de fora"
                    descricao="Foi mostrado e não entrou no projeto."
                    fotos={ambiente.foraDoEscopo}
                    verTodasEm={galeriaDo(ambiente.label)}
                  />
                  {/* Estas estavam INVISÍVEIS: a foto tinha ambiente, caía no
                      bloco certo e não era desenhada em prateleira nenhuma —
                      o bloco podia aparecer vazio. Situada não é o mesmo que
                      classificada. */}
                  <PrateleiraDeFotos
                    titulo="Ainda sem classificação"
                    descricao="Diga na Galeria se é inspiração ou contratada."
                    fotos={ambiente.semClassificacao}
                    verTodasEm={galeriaDo(ambiente.label)}
                  />
                </div>
              )}

              <div className="divide-y divide-border">
                {ambiente.itens.map((item) => {
                  const foto = fotoDoItem(item);
                  const detalhes = [
                    item.model,
                    item.ambiente,
                    item.supplierName,
                  ].filter(Boolean) as string[];

                  return (
                    <div key={item._id} className="px-5 py-3 flex gap-3">
                      {/* Referência visual do item. Sem foto, um marcador
                          discreto — nada de espaço vazio sem explicação. */}
                      <div className="flex-shrink-0">
                        {foto.url ? (
                          <div className="relative">
                            <img
                              src={foto.url}
                              alt={item.name}
                              loading="lazy"
                              className="size-16 rounded-lg object-cover bg-muted"
                            />
                            {foto.ehReferencia && (
                              <span className="absolute -bottom-1 left-0 right-0 text-[8px] font-bold text-center bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 rounded-b-lg py-0.5">
                                REFERÊNCIA
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="size-16 rounded-lg bg-muted flex items-center justify-center">
                            <ImageOff className="size-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="text-sm font-medium">
                            {item.quantity
                              ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""} · `
                              : ""}
                            {item.name}
                          </p>
                          <SeloEscopo scope={item.projectScope} />
                        </div>

                        {detalhes.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {detalhes.join(" · ")}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                        )}

                        <select
                          value={item.projectScope ?? ""}
                          onChange={(e) =>
                            void mudarEscopo(
                              item._id as Id<"assemblyItems">,
                              e.target.value as ProjectScope | "",
                            )
                          }
                          aria-label={`Classificação de ${item.name}`}
                          className="mt-1.5 h-7 rounded-md border border-input bg-background px-2 text-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Sem classificação</option>
                          {PROJECT_SCOPES.map((sc) => (
                            <option key={sc.value} value={sc.value}>
                              {sc.label}
                            </option>
                          ))}
                        </select>

                        {item.projectScope === "referencia" && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                            {AVISO_REFERENCIA}. Não entra como obrigação de montagem.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* ── PLANTA ───────────────────────────────────────────────────
              A planta já existia, na tela dela. O que faltava era estar perto
              do projeto: a organização espacial é parte de "como vai ficar".

              Só a VISUALIZAÇÃO. Marcar posição sobre a planta exigiria
              coordenadas por ambiente — o começo de um editor, e decisão de
              produto que não é desta rodada. */}
          {planta?.outputUrl && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
                <h2 className="font-serif text-lg leading-tight">Planta</h2>
                <Link
                  to={`/eventos/${id}/planta`}
                  className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Abrir planta
                </Link>
              </div>
              <img
                src={planta.outputUrl}
                alt="Planta do evento"
                loading="lazy"
                decoding="async"
                className="w-full bg-muted object-contain"
              />
            </section>
          )}

          {/* A tela concentra imagem de propósito — e diz quando está pesada.
              Não há miniatura no envio: cada foto aqui é o ORIGINAL. */}
          {totalFotos > 40 && (
            <p className="text-center text-xs text-muted-foreground">
              {totalFotos} fotos classificadas neste evento. As prateleiras mostram as
              primeiras de cada grupo — a Galeria tem todas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
