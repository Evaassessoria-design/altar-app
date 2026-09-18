import { describe, expect, it } from "vitest";
import { hasValidOfficeToken } from "./officeBridgeAuth";

const expectedToken = "segredo-interno-longo";

function request(authorization?: string) {
  return new Request("https://example.test/office-snapshot", {
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

describe("hasValidOfficeToken", () => {
  it("aceita o Bearer token correto", () => {
    expect(
      hasValidOfficeToken(request(`Bearer ${expectedToken}`), expectedToken),
    ).toBe(true);
  });

  it("aceita o nome do esquema sem diferenciar maiúsculas", () => {
    expect(
      hasValidOfficeToken(request(`bearer ${expectedToken}`), expectedToken),
    ).toBe(true);
  });

  it("rejeita requisição sem autorização", () => {
    expect(hasValidOfficeToken(request(), expectedToken)).toBe(false);
  });

  it("rejeita token incorreto ou esquema diferente", () => {
    expect(
      hasValidOfficeToken(request("Bearer outro-segredo"), expectedToken),
    ).toBe(false);
    expect(
      hasValidOfficeToken(request(`Basic ${expectedToken}`), expectedToken),
    ).toBe(false);
  });

  it("rejeita conteúdo adicional no cabeçalho", () => {
    expect(
      hasValidOfficeToken(
        request(`Bearer ${expectedToken} extra`),
        expectedToken,
      ),
    ).toBe(false);
  });
});
