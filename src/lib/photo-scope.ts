// O vocabulário de escopo mora em `convex/lib/projectScope.ts` desde o
// MASTER #6: a Ficha Técnica roda no BACKEND e precisa da mesma regra, e o
// Convex não pode importar de `src/`. Este arquivo continua existindo como o
// endereço que todas as telas já usam — mas sem uma segunda definição, que
// divergiria na primeira mudança.
export {
  PROJECT_SCOPES,
  AVISO_REFERENCIA,
  scopeMeta,
  type ProjectScope,
} from "@/convex/lib/projectScope.ts";
