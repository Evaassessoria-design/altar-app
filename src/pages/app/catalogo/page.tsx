import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { BookMarked, Layers, Pencil, Search } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { abreviarUnidade, TIPOS_DE_MATERIAL } from "@/convex/lib/materiais.ts";
import {
  categoriasPresentes,
  filtrarComposicoes,
  filtrarMateriais,
} from "@/lib/catalogo.ts";
import { MaterialDialog, type MaterialEditavel } from "@/components/catalogo/material-dialog.tsx";
import { ComposicaoDialog } from "@/components/catalogo/composicao-dialog.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO — O CONHECIMENTO DO ESTÚDIO
//
// ── O QUE FALTAVA ──────────────────────────────────────────────────────────
// Materiais e composições sempre existiram no servidor, com tudo: criar,
// corrigir, arquivar, ver onde é usado. Mas o ÚNICO caminho até eles era
// abrir um evento → Ficha Técnica → um item → o diálogo da receita.
//
// Ou seja: para revisar a própria biblioteca antes da temporada, a decoradora
// precisava entrar num evento — geralmente um que não tinha nada a ver com o
// que ela queria arrumar. Não havia lugar nenhum onde ela pudesse olhar para
// o que sabe fazer.
//
// ── POR QUE UMA TELA COM DUAS ABAS, E NÃO DUAS TELAS ────────────────────────
// Material e composição são a mesma pergunta em dois níveis: "do que eu faço
// as coisas" e "o que eu faço com isso". Quem vem arrumar uma, arruma a
// outra na sequência — e dois itens de menu para um assunto só empurrariam
// Acervo e Compras para baixo da dobra no celular.
//
// ── ESTA TELA NÃO SABE NADA ────────────────────────────────────────────────
// Nenhuma regra nasce aqui. Criar e corrigir são os MESMOS diálogos que a
// receita usa (`src/components/catalogo/`), a busca é de `src/lib/catalogo.ts`
// e "onde é usado" vem do servidor. Uma segunda fonte de verdade sobre o
// catálogo é exatamente o que faria a ficha e esta tela discordarem.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = "materiais" | "composicoes";

function Vazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: React.ElementType;
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icone />
        </EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        <EmptyDescription>{descricao}</EmptyDescription>
      </EmptyHeader>
      {acao && <EmptyContent>{acao}</EmptyContent>}
    </Empty>
  );
}

/** "onde é usado", sob demanda: uma consulta por item aberto, nunca por linha. */
function OndeEUsado({ materialId }: { materialId: Id<"materials"> }) {
  const uso = useQuery(api.materials.ondeEUsado, { id: materialId });
  if (uso === undefined) return <Skeleton className="h-4 w-40" />;
  if (uso === null) return null;
  if (uso.composicoes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Ainda não aparece em nenhuma composição da biblioteca.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">Aparece em</p>
      <ul className="space-y-0.5">
        {uso.composicoes.map((c) => (
          <li key={c._id} className="text-xs text-muted-foreground">
            <span className="text-foreground">{c.nome}</span> · {c.quantidade}
            {c.archived && " · arquivada"}
          </li>
        ))}
      </ul>
      {/* A tela diz que parou no teto em vez de somar um total que não contou. */}
      {uso.temMais && (
        <p className="text-xs text-muted-foreground">
          {uso.composicoes.length} listadas — há mais.
        </p>
      )}
    </div>
  );
}

function AbaMateriais({ verArquivados }: { verArquivados: boolean }) {
  const materiais = useQuery(api.materials.list, { incluirArquivados: verArquivados });
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [editando, setEditando] = useState<MaterialEditavel | null>(null);
  const [aberto, setAberto] = useState<Id<"materials"> | null>(null);

  const categorias = useMemo(() => categoriasPresentes(materiais ?? []), [materiais]);
  const visiveis = useMemo(() => {
    const porCategoria = (materiais ?? []).filter(
      (m) => !categoria || (m.categoria ?? "") === categoria,
    );
    return filtrarMateriais(porCategoria, busca);
  }, [materiais, categoria, busca]);

  if (materiais === undefined) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (materiais.length === 0) {
    return (
      <Vazio
        icone={Layers}
        titulo="Seu catálogo de materiais está vazio"
        descricao="Os materiais nascem enquanto você escreve a receita de um item, na Ficha Técnica de um evento. A partir daí eles ficam aqui, para serem reaproveitados e corrigidos."
        acao={
          <Button asChild size="sm" variant="outline" className="cursor-pointer">
            <Link to="/eventos">Abrir um evento</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou categoria"
            className="pl-9"
          />
        </div>
        {categorias.length > 0 && (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            aria-label="Filtrar por categoria"
            className="h-10 cursor-pointer rounded-md border border-input bg-background px-2 text-sm sm:w-48"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {visiveis.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum material encontrado para “{busca || categoria}”.
        </p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((m) => (
            <div
              key={m._id}
              className={cn(
                "rounded-xl border border-border bg-card px-4 py-3",
                m.archived && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => setAberto(aberto === m._id ? null : m._id)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <p className="truncate text-sm font-medium">
                    {m.nome}
                    {m.archived && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        arquivado
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {abreviarUnidade(m.unidade)}
                    {m.categoria && ` · ${m.categoria}`}
                    {m.tipo &&
                      ` · ${TIPOS_DE_MATERIAL.find((t) => t.valor === m.tipo)?.rotulo ?? m.tipo}`}
                  </p>
                </button>
                {/* Alvo de 40px: a tela também se usa no celular. */}
                <button
                  onClick={() => setEditando(m as MaterialEditavel)}
                  aria-label={`Editar ${m.nome}`}
                  className="flex-shrink-0 cursor-pointer rounded-lg p-2.5 text-muted-foreground hover:bg-accent"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
              {aberto === m._id && (
                <div className="mt-2 border-t border-border pt-2">
                  <OndeEUsado materialId={m._id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <MaterialDialog material={editando} onClose={() => setEditando(null)} />
    </>
  );
}

function AbaComposicoes({ verArquivados }: { verArquivados: boolean }) {
  const composicoes = useQuery(api.compositions.list, {
    incluirArquivadas: verArquivados,
  });
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Id<"compositions"> | null>(null);
  const [aberta, setAberta] = useState<Id<"compositions"> | null>(null);

  const visiveis = useMemo(
    () => filtrarComposicoes(composicoes ?? [], busca),
    [composicoes, busca],
  );

  if (composicoes === undefined) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (composicoes.length === 0) {
    return (
      <Vazio
        icone={BookMarked}
        titulo="Sua biblioteca de receitas está vazia"
        descricao="Uma receita entra aqui quando você termina a ficha técnica de um item e clica em “Salvar na biblioteca”. Ela nasce do trabalho já feito — não de um formulário em branco."
        acao={
          <Button asChild size="sm" variant="outline" className="cursor-pointer">
            <Link to="/eventos">Abrir um evento</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, categoria ou material"
          className="pl-9"
        />
      </div>

      {visiveis.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma receita encontrada para “{busca}”.
        </p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((c) => (
            <div
              key={c._id}
              className={cn(
                "rounded-xl border border-border bg-card px-4 py-3",
                c.archived && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => setAberta(aberta === c._id ? null : c._id)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <p className="truncate text-sm font-medium">
                    {c.nome}
                    {c.archived && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        arquivada
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.receita.length}{" "}
                    {c.receita.length === 1 ? "material" : "materiais"}
                    {c.categoria && ` · ${c.categoria}`}
                  </p>
                </button>
                <button
                  onClick={() => setEditando(c._id)}
                  aria-label={`Editar ${c.nome}`}
                  className="flex-shrink-0 cursor-pointer rounded-lg p-2.5 text-muted-foreground hover:bg-accent"
                >
                  <Pencil className="size-4" />
                </button>
              </div>

              {/* A receita inteira, sem sair da tela: é o que ela veio ver. */}
              {aberta === c._id && (
                <ul className="mt-2 space-y-0.5 border-t border-border pt-2">
                  {c.receita.map((linha, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
                    >
                      <span className="truncate">{linha.nome}</span>
                      <span className="whitespace-nowrap">
                        {linha.quantidade} {abreviarUnidade(linha.unidade)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <ComposicaoDialog compositionId={editando} onClose={() => setEditando(null)} />
    </>
  );
}

export default function CatalogoPage() {
  const [aba, setAba] = useState<Aba>("materiais");
  const [verArquivados, setVerArquivados] = useState(false);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Layers className="size-5 text-primary" /> Catálogo
        </h1>
        <p className="text-sm text-muted-foreground">
          Os materiais que você usa e as receitas que já criou
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              ["materiais", "Materiais"],
              ["composicoes", "Composições"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setAba(valor)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors",
                aba === valor
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {/* Arquivar não é apagar: o que saiu do catálogo ativo continua
            alcançável, e é assim que se desfaz um arquivamento errado. */}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={verArquivados}
            onChange={(e) => setVerArquivados(e.target.checked)}
            className="cursor-pointer"
          />
          Ver arquivados
        </label>
      </div>

      {aba === "materiais" ? (
        <AbaMateriais verArquivados={verArquivados} />
      ) : (
        <AbaComposicoes verArquivados={verArquivados} />
      )}
    </div>
  );
}
