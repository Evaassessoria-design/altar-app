import { ConvexError } from "convex/values";
import { deCentavos } from "../../convex/lib/pagamentosDoEvento.ts";

// Ajudantes dos diálogos de recebimento (src/components/financeiro/recebimentos.tsx),
// fora do arquivo de componentes para o fast-refresh do Vite seguir funcionando.

/** Centavos inteiros → "R$ 1.234,56". */
export const reais = (centavos: number) =>
  deCentavos(centavos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Chave do envio. Uma por abertura de formulário — o reenvio repete a mesma. */
export const novaChave = () => crypto.randomUUID();

/** A mensagem do servidor quando ele explicou; a frase padrão quando não. */
export const mensagem = (e: unknown, padrao: string) =>
  e instanceof ConvexError ? (e.data as { message: string }).message : padrao;

/** A classe dos campos nativos (data, arquivo, datalist) nos diálogos. */
export const campo =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
