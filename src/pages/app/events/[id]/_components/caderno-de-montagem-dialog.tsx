import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { FileDown, Loader2, Info, ArrowRight, Check } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { resolveIdentidade } from "@/lib/brand.ts";
import { montarCaderno, type CadernoMontado, type AvisoDoCaderno } from "@/lib/caderno/montar-caderno.ts";
import { fontesDoCaderno } from "@/lib/caderno/fontes-do-caderno.ts";
import type { VersaoDoCaderno } from "@/lib/audiencia-do-caderno.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PRÉVIA DO CADERNO — o que vai para o papel, antes de ir
//
// A prévia e o PDF desenham o MESMO `CadernoMontado` (`montarCaderno`). Se a
// prévia escondesse algo que o PDF imprime, ela mentiria exatamente no momento
// em que a decoradora confere antes de mandar.
//
// O que só existe aqui, e não no papel: os AVISOS de completude ("sem planta",
// "nenhuma foto liberada") com o caminho para completar na origem. O PDF não
// tem botão de "adicionar foto" — quem completa é a tela de cada módulo, e o
// próximo caderno já sai com o que ela mudou.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logo em data URL para o jsPDF. Falha de rede ou imagem inválida NÃO impede
 * o caderno: devolve null e o cabeçalho sai sem logo.
 */
async function carregarLogo(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const ONDE: Record<NonNullable<AvisoDoCaderno["onde"]>, { rota: string; rotulo: string }> = {
  fotos: { rota: "fotos", rotulo: "Abrir a Galeria" },
  planta: { rota: "planta", rotulo: "Abrir a Planta" },
  projeto: { rota: "projeto", rotulo: "Abrir o Projeto Visual" },
  briefing: { rota: "briefing", rotulo: "Abrir o Briefing" },
  acervo: { rota: "acervo", rotulo: "Abrir o Acervo do evento" },
};

function Secao({ titulo, origem, children }: { titulo: string; origem?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{titulo}</h3>
        {origem && <span className="text-[10px] text-muted-foreground">vem de {origem}</span>}
      </div>
      {children}
    </section>
  );
}

function Chips({ nomes }: { nomes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {nomes.map((n) => (
        <span key={n} className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs">
          {n}
        </span>
      ))}
    </div>
  );
}

function Imagens({ lista }: { lista: { url: string; legenda?: string; ehReferencia: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {lista.map((im, i) => (
        <figure key={`${im.url}-${i}`} className="min-w-0">
          <img src={im.url} alt={im.legenda ?? ""} className="aspect-[4/3] w-full rounded-lg object-cover bg-muted" loading="lazy" />
          {(im.legenda || im.ehReferencia) && (
            <figcaption className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {[im.legenda, im.ehReferencia ? "referência visual" : undefined].filter(Boolean).join(" · ")}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

/** O corpo da prévia: só desenha o `CadernoMontado`, seção por seção. */
function Previa({ c }: { c: CadernoMontado }) {
  const equipe = c.versao === "equipe";
  return (
    <div className="space-y-5 text-sm">
      <div>
        <p className="font-serif text-xl leading-tight break-words">{c.titulo}</p>
        <p className="text-xs text-muted-foreground">{c.subtitulo}</p>
      </div>

      {c.resumo.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {c.resumo.map((r) => (
            <div key={r.rotulo} className="min-w-0 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-primary">{r.rotulo}</p>
              <p className="font-medium break-words leading-tight">{r.valor}</p>
            </div>
          ))}
        </div>
      )}

      {c.preencher.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {c.preencher.map((f) => (
            <div key={f.rotulo} className="border-b border-muted-foreground/40 pb-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.rotulo}</p>
              <p className="min-h-5 text-xs font-medium">{f.valor ?? ""}</p>
            </div>
          ))}
        </div>
      )}

      {!equipe && c.conceito && (
        <Secao titulo="Conceito" origem="Briefing">
          {c.conceito.destaque && <p className="font-serif italic">{c.conceito.destaque}</p>}
          {c.conceito.texto && <p className="text-xs text-muted-foreground">{c.conceito.texto}</p>}
        </Secao>
      )}

      {c.ambientes.length > 0 && (
        <Secao titulo={equipe ? "Ambientes a montar" : "Ambientes que vamos decorar"} origem="Briefing e itens">
          <Chips nomes={c.ambientes} />
        </Secao>
      )}

      {equipe && (c.conceito || c.atencao.confirmar.length + c.atencao.naoLevarSemConfirmar.length + c.atencao.naoIncluso.length > 0) && (
        <Secao titulo="Estilo e atenção">
          {(c.conceito || c.atencao.confirmar.length > 0) && (
            <div className="rounded-lg border-l-4 border-primary bg-muted/40 px-3 py-2 text-xs space-y-1">
              {c.conceito?.destaque && <p>{c.conceito.destaque}</p>}
              {c.conceito?.texto && <p>{c.conceito.texto}</p>}
              {c.atencao.confirmar.length > 0 && (
                <p><strong>Confirmar antes de montar:</strong> {c.atencao.confirmar.join("; ")}.</p>
              )}
            </div>
          )}
          {(c.atencao.naoLevarSemConfirmar.length > 0 || c.atencao.naoIncluso.length > 0) && (
            <div className="rounded-lg border-l-4 border-destructive bg-destructive/10 px-3 py-2 text-xs space-y-1">
              {c.atencao.naoLevarSemConfirmar.length > 0 && (
                <p><strong>Não levar nem montar sem confirmação:</strong> {c.atencao.naoLevarSemConfirmar.join(", ")}.</p>
              )}
              {c.atencao.naoIncluso.length > 0 && (
                <p><strong>Não estão inclusos:</strong> {c.atencao.naoIncluso.join(", ")}.</p>
              )}
            </div>
          )}
        </Secao>
      )}

      {!equipe && c.incluido.length > 0 && (
        <Secao titulo="O que está incluso" origem="Itens do projeto">
          <div className="grid gap-2 sm:grid-cols-2">
            {c.incluido.map((g) => (
              <div key={g.titulo} className="min-w-0 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-primary">{g.titulo}</p>
                {g.origem && <p className="text-[10px] italic text-muted-foreground">{g.origem}</p>}
                <ul className="mt-1 divide-y divide-dashed divide-border">
                  {g.linhas.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2 py-1 text-xs">
                      <span className="min-w-0 break-words">
                        {l.nome}
                        {l.detalhe && <span className="block text-[10px] text-muted-foreground">{l.detalhe}</span>}
                      </span>
                      {l.quantidade && <span className="shrink-0 font-semibold">{l.quantidade}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {c.informacoesDoLocal.length > 0 && (
        <Secao titulo="Informações do local" origem="Briefing">
          <dl className="space-y-1 text-xs">
            {c.informacoesDoLocal.map((l) => (
              <div key={l.rotulo} className="grid grid-cols-[8rem_1fr] gap-2">
                <dt className="text-muted-foreground">{l.rotulo}</dt>
                <dd className="min-w-0 break-words">{l.valor}</dd>
              </div>
            ))}
          </dl>
        </Secao>
      )}

      {[
        { titulo: "Prazos e responsáveis", origem: "Briefing", linhas: c.prazosEResponsaveis },
        { titulo: "Iluminação e conexão elétrica", origem: "Briefing", linhas: c.conexaoEletrica },
      ].map((bloco) =>
        bloco.linhas.length > 0 ? (
          <Secao key={bloco.titulo} titulo={bloco.titulo} origem={bloco.origem}>
            <dl className="space-y-1 text-xs">
              {bloco.linhas.map((l) => (
                <div key={l.rotulo} className="grid grid-cols-[8rem_1fr] gap-2">
                  <dt className="text-muted-foreground">{l.rotulo}</dt>
                  <dd className="min-w-0 break-words">{l.valor}</dd>
                </div>
              ))}
            </dl>
          </Secao>
        ) : null,
      )}

      {c.equipeEscalada.length > 0 && (
        <Secao titulo="Equipe escalada" origem="Equipe do evento">
          <ul className="text-xs space-y-0.5">
            {c.equipeEscalada.map((m, i) => (
              <li key={i}>
                {m.nome}
                {m.funcao ? ` · ${m.funcao}` : ""}
                {m.horario ? ` · chega ${m.horario}` : ""}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {c.layout && (
        <Secao titulo="Layout do espaço" origem="Planta">
          <img src={c.layout.url} alt={c.layout.legenda} className="max-h-72 w-full rounded-lg border border-border object-contain bg-white" />
          <p className="text-[10px] text-muted-foreground">{c.layout.legenda}</p>
        </Secao>
      )}

      {c.referencias.length > 0 && (
        <Secao titulo="Referências de decoração" origem="Galeria">
          <Imagens lista={c.referencias} />
        </Secao>
      )}

      {c.fichas.map((f) => (
        <Secao key={f.titulo} titulo={`Ficha do ambiente · ${f.titulo}`} origem="Projeto Visual">
          {f.imagens.length > 0 && <Imagens lista={f.imagens} />}
          <ul className="space-y-1 text-xs">
            {f.itens.map((it, i) => (
              <li key={i} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 break-words">
                  {it.nome}
                  {[it.detalhe, it.fornecedor && `Fornecedor: ${it.fornecedor}`, it.observacao && `Obs.: ${it.observacao}`, ...(it.operacional ?? [])]
                    .filter(Boolean)
                    .map((e) => (
                      <span key={String(e)} className="block text-[10px] text-muted-foreground">{e}</span>
                    ))}
                </span>
              </li>
            ))}
          </ul>
          {f.opcionais.length > 0 && <p className="text-xs text-destructive">Só montar se confirmado: {f.opcionais.join(", ")}.</p>}
          {f.naoLevar.length > 0 && <p className="text-xs text-destructive">Não levar: {f.naoLevar.join(", ")}.</p>}
        </Secao>
      ))}

      {!equipe && c.pendencias.length > 0 && (
        <Secao titulo="Decisões que faltam" origem="Leitura do contrato">
          <ul className="space-y-1 text-xs">
            {c.pendencias.map((p) => (
              <li key={p} className="flex gap-2"><span className="mt-0.5 size-3 shrink-0 rounded border border-primary" />{p}</li>
            ))}
          </ul>
        </Secao>
      )}

      {!equipe && c.opcionais.length > 0 && (
        <Secao titulo="Opcionais" origem="Projeto Visual">
          <ul className="divide-y divide-dashed divide-border rounded-lg border border-border px-3 text-xs">
            {c.opcionais.map((o) => (
              <li key={o.nome} className="flex justify-between gap-2 py-1.5">
                <span className="min-w-0 break-words">{o.nome}{o.ambiente ? ` · ${o.ambiente}` : ""}</span>
                {o.valor && <span className="shrink-0 font-semibold text-primary">{o.valor}</span>}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {equipe && c.carga.length > 0 && (
        <Secao titulo="Checklist de carga, montagem e retorno" origem="Itens do projeto">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] uppercase text-primary">
                  <th className="text-left font-semibold">Item</th>
                  <th className="w-9 font-semibold">Qtd.</th>
                  <th className="w-10 font-semibold">Carga</th>
                  <th className="w-12 font-semibold">Montado</th>
                  <th className="w-12 font-semibold">Retorno</th>
                </tr>
              </thead>
              <tbody>
                {c.carga.map((g) => [
                  <tr key={g.titulo} className="bg-muted/50">
                    <td colSpan={5} className="px-1 py-0.5 font-semibold text-primary">{g.titulo}{g.origem ? ` (${g.origem})` : ""}</td>
                  </tr>,
                  ...g.linhas.map((l, i) => (
                    <tr key={`${g.titulo}-${i}`} className="border-b border-border">
                      <td className="py-1 pr-2 break-words">{l.nome}</td>
                      <td className="text-center font-semibold">{l.quantidade ?? "—"}</td>
                      {[0, 1, 2].map((k) => (
                        <td key={k} className="text-center"><span className="inline-block size-3 rounded border border-primary" /></td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          {c.foraDaMontagem > 0 && (
            <p className="text-[11px] italic text-muted-foreground">
              {c.foraDaMontagem === 1
                ? "1 item não entra na montagem por ser só referência visual."
                : `${c.foraDaMontagem} itens não entram na montagem por serem só referência visual.`}
            </p>
          )}
        </Secao>
      )}

      {c.chegaNoLocal.length > 0 && (
        <Secao titulo="Chega no local — não carregar" origem="Origem dos itens">
          <ul className="text-xs space-y-0.5">
            {c.chegaNoLocal.map((l, i) => (
              <li key={i}>
                {l.quantidade ? `${l.quantidade} · ` : ""}
                {l.nome}
                {l.detalhe ? <span className="text-muted-foreground"> · {l.detalhe}</span> : null}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {c.pecasDoAcervo.length > 0 && (
        <Secao titulo="Peças do acervo" origem="Acervo do evento">
          <ul className="text-xs space-y-0.5">
            {c.pecasDoAcervo.map((p, i) => (
              <li key={i}>
                {p.nome} — reservado {p.reservado}
                {p.saiu !== undefined ? ` · saiu ${p.saiu}` : ""}
                {p.voltou !== undefined ? ` · voltou ${p.voltou}` : ""}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {c.checklist.length > 0 && (
        <Secao titulo="Checklist de montagem do evento" origem="Checklist">
          <ul className="text-xs space-y-0.5">
            {c.checklist.map((l, i) => (
              <li key={i}>{l.quantidade ? `${l.quantidade} · ` : ""}{l.nome}</li>
            ))}
          </ul>
        </Secao>
      )}

      {equipe && (
        <Secao titulo="Ocorrências e observações" origem="Acervo do evento">
          {c.ocorrencias.length > 0 ? (
            <ul className="text-xs list-disc pl-4">{c.ocorrencias.map((o) => <li key={o}>{o}</li>)}</ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma ocorrência registrada. O PDF traz linhas para anotar no local, e "Conferido por", data e assinatura.</p>
          )}
        </Secao>
      )}
    </div>
  );
}

export function CadernoDeMontagemDialog({
  eventId,
  versao,
  onClose,
}: {
  eventId: Id<"events">;
  versao: VersaoDoCaderno;
  onClose: () => void;
}) {
  const event = useQuery(api.events.get, { id: eventId });
  const briefing = useQuery(api.briefing.getBriefing, { eventId });
  const itens = useQuery(api.assemblyItems.listByEvent, { eventId });
  const fotos = useQuery(api.gallery.listPhotos, { eventId });
  const plantas = useQuery(api.layoutRenders.listByEvent, { eventId });
  const acervo = useQuery(api.acervo.doEvento, { eventId });
  const equipe = useQuery(api.team.listEventTeam, { eventId });
  const checklist = useQuery(api.briefing.getChecklist, { eventId, phase: "pre" });
  const saude = useQuery(api.health.getEventHealth, { eventId });
  const empresa = useQuery(api.users.getCurrentUser);
  const logoUrl = useQuery(api.users.getLogoUrl);
  const [incluirValores, setIncluirValores] = useState(false);
  const [gerando, setGerando] = useState(false);

  const carregando = [event, briefing, itens, fotos, plantas, acervo, equipe, checklist, saude].some((q) => q === undefined);
  const caderno =
    !carregando && event
      ? montarCaderno(
          fontesDoCaderno({ evento: event, briefing, itens, fotos, plantas, acervo, equipe, checklist, saude } as never),
          versao,
          { incluirValores },
        )
      : null;
  const temValorDeOpcional =
    versao === "cliente" &&
    (itens ?? []).some((i) => i.projectScope === "opcional" && typeof i.valorOpcional === "number");
  const identidade = resolveIdentidade(empresa ?? null);

  const baixar = async () => {
    if (!caderno) return;
    setGerando(true);
    try {
      await (await import("@/lib/generate-assembly-pdf.ts")).generateAssemblyPDF({
        caderno,
        empresa: empresa ?? null,
        logoDataUrl: await carregarLogo(logoUrl),
      });
      toast.success(`Caderno gerado — ${caderno.selo.toLowerCase()}.`);
    } catch {
      toast.error("Erro ao gerar o caderno de montagem.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            Caderno de montagem
            {caderno && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                {caderno.selo}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Prévia do que vai no PDF, com a marca de {identidade.nome}. Para mudar algo, edite na origem — o próximo caderno já sai atualizado.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4">
          {!caderno ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {caderno.avisos.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Info className="size-3.5" /> Para completar o caderno
                  </p>
                  <ul className="space-y-1">
                    {caderno.avisos.map((a) => (
                      <li key={a.texto} className="text-xs text-muted-foreground">
                        {a.texto}
                        {a.onde && (
                          <Link
                            to={`/eventos/${eventId}/${ONDE[a.onde].rota}`}
                            className="ml-1 inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                          >
                            {ONDE[a.onde].rotulo} <ArrowRight className="size-3" />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Previa c={caderno} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {temValorDeOpcional ? (
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={incluirValores} onCheckedChange={setIncluirValores} />
              Incluir os valores dos opcionais
            </label>
          ) : (
            <span />
          )}
          <Button onClick={() => void baixar()} disabled={!caderno || gerando} className="cursor-pointer gap-1.5">
            {gerando ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            Baixar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
