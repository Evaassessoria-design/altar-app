import { describe, expect, it } from "vitest";
import { countScheduled, sortEventTeam } from "./event-team";

const pessoa = (name: string, scheduledTime?: string) => ({
  scheduledTime,
  member: { name },
});

describe("sortEventTeam", () => {
  it("ordena por horário de chegada", () => {
    const escala = [pessoa("Rafael", "09:30"), pessoa("Camila", "07:00"), pessoa("Helena", "14:00")];
    expect(sortEventTeam(escala).map((p) => p.member.name)).toEqual([
      "Camila",
      "Rafael",
      "Helena",
    ]);
  });

  it("quem não tem horário vai para o FIM, sem sumir da lista", () => {
    const escala = [pessoa("SemHora"), pessoa("Camila", "07:00")];
    expect(sortEventTeam(escala).map((p) => p.member.name)).toEqual(["Camila", "SemHora"]);
  });

  it("empate de horário é desempatado pelo nome, de forma estável", () => {
    // Sem desempate, a ordem mudaria sozinha entre carregamentos.
    const escala = [pessoa("Rafael", "07:00"), pessoa("Camila", "07:00")];
    expect(sortEventTeam(escala).map((p) => p.member.name)).toEqual(["Camila", "Rafael"]);
  });

  it("aceita os formatos de hora que a Agenda aceita", () => {
    const escala = [pessoa("Tarde", "14h"), pessoa("Manha", "7:00")];
    expect(sortEventTeam(escala).map((p) => p.member.name)).toEqual(["Manha", "Tarde"]);
  });

  it("não altera o array recebido", () => {
    const escala = [pessoa("B", "10:00"), pessoa("A", "08:00")];
    const copia = [...escala];
    sortEventTeam(escala);
    expect(escala).toEqual(copia);
  });

  it("lista vazia não quebra", () => {
    expect(sortEventTeam([])).toEqual([]);
  });
});

describe("countScheduled", () => {
  it("conta só quem tem horário utilizável", () => {
    expect(
      countScheduled([pessoa("A", "07:00"), pessoa("B"), pessoa("C", ""), pessoa("D", "09:30")]),
    ).toBe(2);
  });

  it("lista vazia conta zero", () => {
    expect(countScheduled([])).toBe(0);
  });
});
