import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { resolverResponsavel, type Responsavel } from "@/convex/lib/responsavel.ts";

// ─────────────────────────────────────────────────────────────────────────────
// QUEM RESPONDE — seletor único.
//
// "Responsável" era texto livre em três telas (compra, lead) e, no evento,
// ninguém escolhia: o cartão mostrava o PRIMEIRO membro escalado. Digitar o
// nome à mão envelhece — a pessoa muda de função, sai da equipe, ou vira
// "Camila", "camila" e "Camila R." no mesmo sistema.
//
// Este seletor grava o VÍNCULO (`responsibleId`). A anotação livre continua
// existindo no banco e continua sendo mostrada quando não há vínculo — nenhum
// registro antigo vira lixo (ver convex/lib/responsavel.ts).
//
// A opção vazia é "Ninguém definido", e não um nome qualquer: o sistema não
// elege responsável.
// ─────────────────────────────────────────────────────────────────────────────

export function ResponsavelSelect({
  value,
  onChange,
  anotacao,
  id,
  className,
}: {
  value: Id<"teamMembers"> | undefined;
  onChange: (id: Id<"teamMembers"> | undefined) => void;
  /** Texto livre já gravado, quando existe. Mostrado como o que vale hoje. */
  anotacao?: string;
  id?: string;
  className?: string;
}) {
  const membros = useQuery(api.team.listMembers, {});

  if (membros !== undefined && membros.length === 0) {
    // Sem equipe cadastrada, um seletor vazio seria um beco sem saída.
    return (
      <p className="text-xs text-muted-foreground">
        Cadastre a sua equipe para escolher um responsável.
        {anotacao ? ` Hoje está anotado: ${anotacao}.` : ""}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || undefined) as Id<"teamMembers"> | undefined)}
        disabled={membros === undefined}
        className={
          className ??
          "h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer disabled:opacity-50"
        }
      >
        <option value="">Ninguém definido</option>
        {(membros ?? []).map((m) => (
          <option key={m._id} value={m._id}>
            {m.name}
            {m.role ? ` · ${m.role}` : ""}
          </option>
        ))}
      </select>

      {/* Sem vínculo, o que vale é a anotação — e a tela diz isso, em vez de
          fingir que não há responsável. */}
      {!value && anotacao && (
        <p className="text-xs text-muted-foreground">Anotado: {anotacao}</p>
      )}
    </div>
  );
}

/**
 * Responsável de um registro, já resolvido — com a ORIGEM.
 *
 * Devolve `null` quando não há resposta honesta, e quem chama simplesmente não
 * desenha nada, em vez de escrever "Sem responsável" como se fosse um
 * problema (a maior parte das compras não precisa de um).
 *
 * Usa a MESMA query da lista de membros: o Convex compartilha a assinatura
 * entre todos os componentes que a pedem, então repetir isto em cada linha da
 * lista não gera uma consulta por linha.
 */
function useResponsavel(registro: {
  responsibleId?: Id<"teamMembers">;
  responsible?: string;
}): Responsavel | null {
  const membros = useQuery(api.team.listMembers, {});
  return resolverResponsavel(registro, membros ?? []);
}

/**
 * O responsável em linha, ou nada.
 *
 * ── POR QUE A ORIGEM APARECE ────────────────────────────────────────────────
 * Quando alguém sai da equipe, o vínculo morre e o NOME é preservado como
 * anotação (convex/lib/cascade.ts) — a compra continua tendo sido tocada pela
 * Camila. Mas na tela isso ficava idêntico a um vínculo vivo: a decoradora
 * lia "Camila" e ia falar com uma pessoa que não está mais na equipe.
 *
 * A distinção é a menor possível: vínculo ativo sai normal, anotação sai em
 * itálico com o motivo no `title`. Sem selo, sem cor, sem ícone — a linha da
 * lista continua sendo sobre a compra, não sobre o cadastro.
 */
export function ResponsavelInline({
  registro,
  prefixo,
  className,
}: {
  registro: { responsibleId?: Id<"teamMembers">; responsible?: string };
  prefixo?: string;
  className?: string;
}) {
  const responsavel = useResponsavel(registro);
  if (!responsavel) return null;
  const anotacao = responsavel.origem === "anotacao";
  return (
    <span className={className}>
      {prefixo}
      <span
        className={anotacao ? "italic" : undefined}
        title={
          anotacao
            ? "Anotação — esta pessoa não está vinculada à equipe cadastrada"
            : undefined
        }
      >
        {responsavel.nome}
      </span>
    </span>
  );
}
