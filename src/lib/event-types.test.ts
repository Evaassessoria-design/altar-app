import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ehTipoDeEventoValido,
  ERRO_TIPO_OBRIGATORIO,
  EVENT_TYPES,
  labelDoTipoDeEvento,
  PLACEHOLDER_TIPO_DE_EVENTO,
  TIPOS_DE_EVENTO,
  tipoDeEventoSchema,
} from "./event-types";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — tipo de evento não nasce "Casamento".
//
// O formulário abria com "Casamento" já selecionado. Quem cadastrava o 15 anos
// da Helena e não reparava no campo salvava o evento como casamento — dado
// errado gravado em silêncio, por omissão de quem preenche.
//
// A regra agora: campo vazio, escolha obrigatória, erro visível no campo.
// "Casamento" continua na lista; deixou de ser a resposta presumida.
// ─────────────────────────────────────────────────────────────────────────────

describe("a validação do campo", () => {
  it("RECUSA quando ninguém escolheu", () => {
    const r = tipoDeEventoSchema.safeParse(undefined);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe(ERRO_TIPO_OBRIGATORIO);
  });

  it("RECUSA valor vazio ou fora da lista, com a mesma mensagem", () => {
    for (const invalido of ["", "   ", "aniversario", "wedding ", "CASAMENTO", null, 0]) {
      const r = tipoDeEventoSchema.safeParse(invalido);
      expect(r.success, String(invalido)).toBe(false);
      expect(r.error?.issues[0].message, String(invalido)).toBe(ERRO_TIPO_OBRIGATORIO);
    }
  });

  it('ACEITA "Casamento" — continua sendo opção válida', () => {
    const r = tipoDeEventoSchema.safeParse("wedding");
    expect(r.success).toBe(true);
    expect(r.data).toBe("wedding");
  });

  it.each(TIPOS_DE_EVENTO.filter((t) => t !== "wedding"))("ACEITA %s", (tipo) => {
    expect(tipoDeEventoSchema.safeParse(tipo).success).toBe(true);
  });

  it("os tipos gravados no banco não mudaram — evento antigo continua válido", () => {
    // Trocar um desses valores quebraria eventos já salvos.
    expect([...TIPOS_DE_EVENTO]).toEqual([
      "wedding",
      "corporate",
      "birthday",
      "debutante",
      "baptism",
      "other",
    ]);
  });

  it("todo tipo tem rótulo, e todo rótulo aponta para um tipo válido", () => {
    expect(EVENT_TYPES).toHaveLength(TIPOS_DE_EVENTO.length);
    for (const t of EVENT_TYPES) {
      expect(ehTipoDeEventoValido(t.value)).toBe(true);
      expect(t.label.length).toBeGreaterThan(0);
    }
    expect(EVENT_TYPES.map((t) => t.value)).toContain("wedding");
    expect(labelDoTipoDeEvento("wedding")).toBe("Casamento");
  });

  it("ehTipoDeEventoValido não deixa passar lixo", () => {
    for (const lixo of [undefined, null, "", "x", 1, {}, []]) {
      expect(ehTipoDeEventoValido(lixo), String(lixo)).toBe(false);
    }
  });
});

describe("nenhuma tela volta a presumir casamento", () => {
  const FORM = readFileSync(
    "src/pages/app/events/_components/event-form-dialog.tsx",
    "utf-8",
  );
  const ONBOARDING = readFileSync("src/components/onboarding-modal.tsx", "utf-8");

  it("o formulário de evento não tem padrão de tipo", () => {
    expect(FORM).not.toContain('?? "wedding"');
    expect(FORM).toContain("type: defaultValues?.type,");
  });

  it("o onboarding começa sem tipo escolhido", () => {
    expect(ONBOARDING).not.toContain('useState<EventType>("wedding")');
    expect(ONBOARDING).toContain("useState<TipoDeEvento | null>(null)");
  });

  it("as duas telas usam a MESMA lista", () => {
    // A lista vivia duplicada. Duas cópias divergem: uma ganha um tipo novo,
    // a outra não, e o sistema oferece opções diferentes em telas diferentes.
    for (const fonte of [FORM, ONBOARDING]) {
      expect(fonte).toContain('from "@/lib/event-types.ts"');
      expect(fonte).not.toContain('{ value: "wedding", label: "Casamento" }');
    }
  });

  it("o onboarding recusa o avanço sem tipo, antes de salvar", () => {
    const passo2 = ONBOARDING.slice(ONBOARDING.indexOf("const handleStep2"));
    const guarda = passo2.indexOf("if (!eventType)");
    const salva = passo2.indexOf("createEvent(");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(salva);
  });

  it("o erro é mostrado no campo, nas duas telas", () => {
    expect(FORM).toContain("errors.type &&");
    expect(FORM).toContain("text-xs text-destructive");
    expect(ONBOARDING).toContain("erroTipo");
    expect(ONBOARDING).toContain("border-destructive");
  });

  it("o placeholder é o mesmo texto nas duas", () => {
    expect(PLACEHOLDER_TIPO_DE_EVENTO).toBe("Selecione o tipo de evento");
    for (const fonte of [FORM, ONBOARDING]) {
      expect(fonte).toContain("PLACEHOLDER_TIPO_DE_EVENTO");
    }
  });
});
