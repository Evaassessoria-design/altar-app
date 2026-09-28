import { useState } from "react";
import { ROTULO_DA_INTENCAO as ROTULO_DA_INTENCAO_DOMINIO } from "@/convex/lib/respostaDoInteressado.ts";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import { MessageSquarePlus } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRAR O QUE ELA RESPONDEU
//
// ── A LINHA QUE ESTA TELA NÃO CRUZA ─────────────────────────────────────────
// O ALTAR não lê o WhatsApp de ninguém. O rótulo do campo é "O que ela
// respondeu?" e não "Mensagem recebida" — a diferença de uma palavra é a
// diferença entre registrar e fingir.
//
// ── A CLASSIFICAÇÃO APARECE ANTES DE SER APLICADA ───────────────────────────
// A leitura vem primeiro, e mover é um segundo clique. É o que separa "o ALTAR
// entendeu" de "o ALTAR decidiu" — e "incerto" não oferece destino nenhum,
// porque não há destino honesto para uma resposta ambígua.
// ─────────────────────────────────────────────────────────────────────────────

// Os rótulos moram no domínio (um lugar só): o relatório do Escritório usa
// os mesmos.
const ROTULO_DA_INTENCAO: Record<string, string> = ROTULO_DA_INTENCAO_DOMINIO;

type Leitura = {
  intencao: string;
  sinais: string[];
  precisaDeHumano: boolean;
  estagioSugerido: string | null;
  moveuPara: string | null;
  emailGravado: string | null;
  classificacaoAtiva: boolean;
};

export function RegistrarResposta({
  leadId,
  nome,
  aoFechar,
}: {
  leadId: Id<"landingLeads">;
  nome: string;
  aoFechar: () => void;
}) {
  const registrar = useMutation(api.escritorioCiclo.registrarResposta);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);

  async function enviar(aplicarSugestao: boolean) {
    const t = texto.trim();
    if (!t) {
      toast.error("Cole o que ela respondeu.");
      return;
    }
    setSalvando(true);
    try {
      const r = await registrar({ leadId, texto: t, aplicarSugestao });
      setLeitura(r);
      if (r.moveuPara) {
        toast.success(`${nome} foi para "${r.moveuPara}"`, {
          description: r.emailGravado ? `E-mail guardado: ${r.emailGravado}` : undefined,
        });
        aoFechar();
      } else if (aplicarSugestao && !r.estagioSugerido) {
        // Pediram para aplicar e não havia o que aplicar. Dizer por quê evita
        // que a pessoa conclua que o botão está quebrado.
        toast.info("Resposta registrada, sem mover ninguém", {
          description: "Não deu para entender a intenção — veja e decida você.",
        });
      } else {
        toast.success("Resposta registrada");
      }
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message)
          : "Não deu para registrar",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <label htmlFor={`resposta-${leadId}`} className="block text-xs font-medium">
        O que {nome.split(" ")[0]} respondeu?
      </label>
      <Textarea
        id={`resposta-${leadId}`}
        rows={3}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setLeitura(null);
        }}
        placeholder="Cole aqui o que ela escreveu no WhatsApp"
        // `text-base` no celular: abaixo de 16px o iOS dá zoom ao focar, e a
        // tela salta na cara de quem está colando.
        className="resize-none text-base md:text-sm"
      />

      {/* ── A LEITURA, ANTES DE APLICAR ────────────────────────────────── */}
      {leitura && !leitura.moveuPara && (
        <div className="rounded-md border border-border bg-background p-2.5 text-xs">
          <p className="font-medium">
            O ALTAR entendeu:{" "}
            <span className={cn(leitura.precisaDeHumano && "text-amber-600 dark:text-amber-500")}>
              {ROTULO_DA_INTENCAO[leitura.intencao] ?? leitura.intencao}
            </span>
          </p>
          {leitura.sinais.length > 0 && (
            <p className="mt-0.5 text-muted-foreground">
              Pelo que ela escreveu: {leitura.sinais.slice(0, 3).join(", ")}
            </p>
          )}
          {leitura.precisaDeHumano && (
            <p className="mt-1 text-amber-600 dark:text-amber-500">
              Isto precisa de você — não vou mover ninguém.
            </p>
          )}
          {!leitura.classificacaoAtiva && (
            <p className="mt-1 text-muted-foreground">
              A classificação automática está desligada nesta campanha.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={salvando}
          onClick={() => void enviar(true)}
          className="cursor-pointer gap-1.5"
        >
          <MessageSquarePlus className="size-3.5" />
          {salvando ? "Registrando…" : "Registrar e atualizar etapa"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={salvando}
          onClick={() => void enviar(false)}
          className="cursor-pointer"
        >
          Só registrar
        </Button>
        <Button size="sm" variant="ghost" onClick={aoFechar} className="cursor-pointer">
          Cancelar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        O ALTAR não lê seu WhatsApp. Isto fica registrado como algo que você anotou.
      </p>
    </div>
  );
}
