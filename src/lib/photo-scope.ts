// O vocabulário de escopo mora em `convex/lib/projectScope.ts` desde o
// MASTER #6: a Ficha Técnica roda no BACKEND e precisa da mesma regra, e o
// Convex não pode importar de `src/`. Este arquivo continua existindo como o
// endereço que todas as telas já usam — mas sem uma segunda definição, que
// divergiria na primeira mudança.
export {
  PROJECT_SCOPES,
  ITEM_SCOPES,
  ESCOPO_OPCIONAL,
  AVISO_REFERENCIA,
  scopeMeta,
  type ProjectScope,
  type ItemScope,
} from "@/convex/lib/projectScope.ts";

// O selo de um ITEM procura na lista do item (com "opcional"); o da foto, na
// lista da foto. Mesma função de `escopoDoProjeto.ts` — não uma segunda cópia.
export { scopeMeta as scopeMetaDoItem } from "@/convex/lib/escopoDoProjeto.ts";
