import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { receitaDeEvento, rotuloDaSituacao, situacaoDoLancamento } from "./situacao-do-lancamento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO GERAL — O QUE A TELA NÃO PODE VOLTAR A FAZER
//
// As regras de dinheiro moram no servidor (`convex/financeiro-geral.test.ts`).
// Aqui: a situação que a linha mostra, e as portas laterais que a tela não
// pode reabrir para receita de evento.
// ─────────────────────────────────────────────────────────────────────────────

const tela = readFileSync("src/pages/app/financeiro/page.tsx", "utf-8");

describe("a situação da linha", () => {
  const base = { amount: 1000, date: "2026-10-10" };

  it("receita parcial é Parcial — nem Pendente, nem Recebido", () => {
    const tx = { ...base, type: "income" as const, isPaid: false, recebimentos: [{ id: "r", valor: 400, data: "2026-10-01", registradoEm: "", chave: "c" }] };
    expect(situacaoDoLancamento(tx)).toBe("parcial");
  });

  it("baixa ANTIGA sem recebimentos continua Recebido", () => {
    expect(situacaoDoLancamento({ ...base, type: "income", isPaid: true })).toBe("recebido");
  });

  it("recebimento anulado não conta", () => {
    const tx = {
      ...base, type: "income" as const, isPaid: false,
      recebimentos: [{ id: "r", valor: 1000, data: "2026-10-01", registradoEm: "", chave: "c", anulacao: { motivo: "x", em: "" } }],
    };
    expect(situacaoDoLancamento(tx)).toBe("pendente");
  });

  it("despesa diz Pago, receita diz Recebido", () => {
    expect(rotuloDaSituacao("expense", situacaoDoLancamento({ ...base, type: "expense", isPaid: true }))).toBe("Pago");
    expect(rotuloDaSituacao("income", "recebido")).toBe("Recebido");
  });

  it("só receita COM evento passa pelos recebimentos", () => {
    expect(receitaDeEvento({ type: "income", eventId: "e1" })).toBe(true);
    expect(receitaDeEvento({ type: "income" })).toBe(false);
    expect(receitaDeEvento({ type: "expense", eventId: "e1" })).toBe(false);
  });
});

describe("receita de evento não tem porta lateral na tela", () => {
  it("o botão redondo registra recebimento, não alterna o pago", () => {
    expect(tela).toContain('setAcao({ tipo: saldo > 0 ? "receber" : "detalhes", id: tx._id })');
  });

  it("'Marcar como pago' do menu só existe fora da receita de evento", () => {
    expect(tela).toContain("{!deEvento && !protegida && (");
  });

  it("a edição da receita de evento não oferece 'Já recebido'", () => {
    expect(tela).toContain('receitaDeEvento={editing.type === "income" && !!editing.eventId}');
    expect(tela).toMatch(/\{receitaDeEvento \? \([\s\S]{0,400}Registrar recebimento/);
  });

  it("usa os MESMOS diálogos da aba do evento", () => {
    // O MESMO fluxo da aba do evento, e a linha também se abre pelo texto.
    expect(tela).toContain("<FluxoDaParcela");
    expect(readFileSync("src/pages/app/events/[id]/_components/pagamentos-da-cliente.tsx", "utf-8")).toContain("<FluxoDaParcela");
    expect(tela).toContain('from "@/components/financeiro/recebimentos.tsx"');
    expect(tela).toContain('aria-label={`Abrir ${tx.description}`}');
  });
});

describe("o anexo do Novo lançamento", () => {
  it("o rótulo diz se é comprovante ou documento, e que anexar não confirma pagamento", () => {
    expect(tela).toContain('{pago ? "Comprovante (opcional)" : "Documento/anexo (opcional)"}');
    expect(tela).toContain("Anexar não confirma pagamento: o lançamento continua pendente.");
  });

  it("mostra o progresso do envio", () => {
    expect(tela).toContain("Enviando arquivo… {Math.round((progresso ?? 0) * 100)}%");
  });

  it("falha não fecha o formulário, e o reenvio não duplica", () => {
    expect(tela).toContain("if (ok) onClose();");
    expect(tela).toContain("const chave = useMemo(() => crypto.randomUUID(), []);");
    expect(tela).toContain("if (emCurso.current) return;");
    expect(tela).toContain("if (!subido.current || subido.current.nome !== arquivo.name)");
  });
});
