import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { nomeDoResponsavel } from "@/convex/lib/responsavel.ts";

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
 * Nome do responsável de um registro, já resolvido.
 *
 * Devolve `null` quando não há resposta honesta — e quem chama simplesmente
 * não desenha nada, em vez de escrever "Sem responsável" como se fosse um
 * problema (a maior parte das compras não precisa de um).
 *
 * Usa a MESMA query da lista de membros: o Convex compartilha a assinatura
 * entre todos os componentes que a pedem, então repetir isto em cada linha da
 * lista não gera uma consulta por linha.
 */
function useNomeDoResponsavel(registro: {
  responsibleId?: Id<"teamMembers">;
  responsible?: string;
}): string | null {
  const membros = useQuery(api.team.listMembers, {});
  return nomeDoResponsavel(registro, membros ?? []);
}

/** O responsável em linha, ou nada. Prefixo opcional ("Resp.: "). */
export function ResponsavelInline({
  registro,
  prefixo,
  className,
}: {
  registro: { responsibleId?: Id<"teamMembers">; responsible?: string };
  prefixo?: string;
  className?: string;
}) {
  const nome = useNomeDoResponsavel(registro);
  if (!nome) return null;
  return (
    <span className={className}>
      {prefixo}
      {nome}
    </span>
  );
}
