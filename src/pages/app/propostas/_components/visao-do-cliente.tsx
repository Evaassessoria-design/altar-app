import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import type { PropostaParaCliente } from "@/convex/lib/propostaComercial.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";

// ─────────────────────────────────────────────────────────────────────────────
// VER COMO A CLIENTE VÊ
//
// ── POR QUE ESTA TELA EXISTE ────────────────────────────────────────────────
// A decoradora escreve a proposta num formulário e manda um PDF. Entre os dois
// há uma transformação — e ninguém confere uma transformação que não consegue
// ver. A pergunta que ela faz antes de apertar "enviar" é "o que ela vai ler?",
// e até aqui a única resposta era gerar o PDF e abrir.
//
// ── A FRONTEIRA NÃO MORA AQUI ───────────────────────────────────────────────
// Esta tela NÃO sabe esconder nada, e é de propósito. Ela recebe um
// `PropostaParaCliente`, que é o que `paraOCliente` construiu campo a campo —
// custo, margem e fornecedor não estão escondidos, estão AUSENTES do objeto.
//
// O tipo é a trava: um campo interno acrescentado ao schema amanhã não compila
// aqui, porque `PropostaParaCliente` não o tem. Se a fronteira morasse na
// renderização, bastaria alguém esquecer um `{...item}` para vazar.
//
// Por isso também ela renderiza EXATAMENTE o mesmo objeto que vai para o PDF
// (`api.propostas.comoOClienteVe`): a pré-visualização que monta o documento
// por conta própria é a que mente.
// ─────────────────────────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  documento: PropostaParaCliente;
  onClose: () => void;
};

export function VisaoDoCliente({ documento, onClose }: Props) {
  const evento = documento.evento;
  // O bloco do evento só aparece com conteúdo: um cabeçalho "O evento" vazio
  // faria o documento parecer inacabado na frente de quem paga por ele.
  const temEvento =
    evento !== undefined &&
    (evento.tipo || evento.data || evento.local || evento.convidados !== undefined);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Como a cliente vê</DialogTitle>
        </DialogHeader>

        <p className="-mt-2 text-xs text-muted-foreground">
          É isto, e só isto, que sai no PDF. Custo, margem e fornecedor não estão
          escondidos aqui — eles não existem neste documento.
        </p>

        {/* O papel. Fundo claro fixo porque o PDF é branco: a pré-visualização
            que muda com o tema da decoradora não pré-visualiza nada. */}
        <div className="rounded-xl border border-border bg-white p-6 text-zinc-900 sm:p-8">
          <div className="border-b border-zinc-200 pb-4">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase">
              {documento.estudio.nome}
            </p>
            <h2 className="mt-2 font-serif text-2xl leading-tight">{documento.titulo}</h2>
            <p className="mt-1 text-sm text-zinc-600">Para {documento.cliente}</p>
          </div>

          {documento.apresentacao && (
            <p className="mt-5 text-sm leading-relaxed whitespace-pre-wrap text-zinc-700">
              {documento.apresentacao}
            </p>
          )}

          {temEvento && (
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {evento?.tipo && <Linha rotulo="Evento" valor={evento.tipo} />}
              {evento?.data && (
                <Linha rotulo="Data" valor={formatEventDayOnly(evento.data)} />
              )}
              {evento?.local && <Linha rotulo="Local" valor={evento.local} />}
              {evento?.convidados !== undefined && (
                <Linha rotulo="Convidados" valor={String(evento.convidados)} />
              )}
            </dl>
          )}

          <h3 className="mt-7 text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase">
            O que está incluído
          </h3>
          {documento.itens.length === 0 ? (
            // Não inventa "a combinar": a proposta sem escopo está incompleta, e
            // a tela diz isso em vez de disfarçar.
            <p className="mt-3 text-sm text-zinc-500 italic">
              Nenhum item ainda. A cliente receberia um documento sem escopo.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-200">
              {documento.itens.map((item, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.descricao}</p>
                    {item.detalhe && (
                      <p className="mt-0.5 text-sm text-zinc-600">{item.detalhe}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-sm tabular-nums">
                    {brl.format(item.valor)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-baseline justify-between rounded-lg bg-zinc-100 px-4 py-3">
            <span className="text-[11px] font-semibold tracking-[0.18em] text-zinc-600 uppercase">
              Investimento
            </span>
            <span className="font-serif text-xl tabular-nums">
              {brl.format(documento.investimento)}
            </span>
          </div>

          {documento.condicoesPagamento && (
            <Bloco titulo="Condições de pagamento" texto={documento.condicoesPagamento} />
          )}
          {documento.validadeAte && (
            <Bloco
              titulo="Validade"
              texto={`Esta proposta é válida até ${formatEventDayOnly(documento.validadeAte)}.`}
            />
          )}
          {documento.observacoes && (
            <Bloco titulo="Observações" texto={documento.observacoes} />
          )}

          {documento.estudio.contato && (
            <p className="mt-7 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
              {documento.estudio.nome} · {documento.estudio.contato}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wider text-zinc-500 uppercase">{rotulo}</dt>
      <dd className="text-sm">{valor}</dd>
    </div>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mt-5">
      <h3 className="text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase">
        {titulo}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-zinc-700">
        {texto}
      </p>
    </div>
  );
}
