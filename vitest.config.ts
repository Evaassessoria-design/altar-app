import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

// Unit-test config for this app. Two projects run in one command:
//   - "convex"   backend functions, run in the edge-runtime via convex-test
//   - "frontend" React components and logic, run in jsdom via Testing Library
//
// Keep tests hermetic: use convex-test and mocks instead of real deployments,
// network calls, or environment-dependent behavior.
export default defineConfig({
  resolve: {
    alias: {
      "@/convex": path.resolve(__dirname, "./convex"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    passWithNoTests: true,
    // Restore Vitest mocks before each test to reduce state leakage.
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.{ts,js}"],
          // O PRIMEIRO teste de cada arquivo paga sozinho o carregamento dos
          // módulos do backend sob `convex-test` — cerca de 6 s numa máquina
          // ocupada, contra o padrão de 5 s do vitest. O resultado era um
          // flake que derrubava 7 arquivos de uma vez, sempre no primeiro
          // teste, sempre por tempo e nunca por asserção. Os testes seguintes
          // de cada arquivo rodam em milissegundos.
          //
          // Isto NÃO afrouxa nenhuma verificação: um teste genuinamente travado
          // continua falhando, só que depois de 30 s em vez de 5 s.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/vitest.setup.ts"],
        },
      },
    ],
  },
});
