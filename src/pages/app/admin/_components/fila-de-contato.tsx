import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Copy, MessageSquare } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// A FILA DE CONTATO — PREPARA E PARA
//
// ── O QUE ESTA TELA NÃO TEM ─────────────────────────────────────────────────
// Não tem botão de enviar. Não tem "disparar para todos". Não agenda envio.
// O que ela faz é escrever a mensagem e pôr um [Copiar] do lado.
//
// É a mesma trava que a Central sustenta desde que nasceu: uma campanha que
// dispara sozinha erra em escala, e erro em escala com o nome da empresa em
// cima não tem como voltar atrás. O último passo é de uma pessoa.
//
// ── "MARQUEI COMO PREPARADO" NÃO É "ENVIEI" ─────────────────────────────────
// São dois estados diferentes, e a distinção importa numa campanha de cem
// pessoas: `contato_preparado` diz que o rascunho existe; `contatado` diz que
// alguém falou com ela. Quem confundir os dois manda a mesma mensagem duas
// vezes — ou nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

export function FilaDeContato({ campanha }: { campanha: string }) {
  const fila = useQuery(api.admin.contatosAPreparar, { campanha });
  const setStatus = useMutation(api.admin.setLandingLeadStatus);
  const [copiado, setCopiado] = useState<string | null>(null);

  if (fila === undefined) {
    return (
      <div className="space-y-2 px-5 py-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const copiar = async (leadId: string, mensagem: string) => {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(leadId);
      // O aviso some sozinho: um "copiado!" permanente vira ruído na
      // trigésima linha.
      setTimeout(() => setCopiado((atual) => (atual === leadId ? null : atual)), 2000);
    } catch {
      // Área de transferência bloqueada (contexto inseguro, permissão negada).
      // Dizer isso é melhor do que um sucesso silencioso e falso.
      toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
    }
  };

  if (fila.contatos.length === 0) {
    return (
      <div className="px-5 py-6 text-center">
        <p className="text-sm font-medium">Ninguém esperando primeiro contato</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Quem chegar por esta campanha aparece aqui com a mensagem pronta.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      <div className="px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4 text-primary" />
          {fila.contatos.length}{" "}
          {fila.contatos.length === 1 ? "contato preparado" : "contatos preparados"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          As mensagens estão escritas. O ALTAR não envia nada — você revisa, copia e
          manda.
        </p>
        {!fila.completa && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            A campanha passou do teto de varredura — esta fila é parcial.
          </p>
        )}
      </div>

      {fila.contatos.map((c) => (
        <div key={c.leadId} className="px-5 py-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-sm font-medium">{c.nome}</p>
            {c.empresa && (
              <span className="text-xs text-muted-foreground">{c.empresa}</span>
            )}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {c.motivo}
            </span>
          </div>

          {/* Sem canal, a linha continua aparecendo: esconder faria a fila
              prometer que todo mundo é alcançável. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.canal
              ? `${c.canal.tipo === "whatsapp" ? "WhatsApp" : "E-mail"}: ${c.canal.valor}`
              : "Sem telefone nem e-mail cadastrado"}
          </p>

          {/* `whitespace-pre-wrap`: a mensagem tem quebras de linha, e é assim
              que ela vai chegar do outro lado. */}
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
            {c.mensagem}
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copiar(c.leadId, c.mensagem)}
              className="cursor-pointer gap-1.5"
            >
              <Copy className="size-3.5" />
              {copiado === c.leadId ? "Copiado" : "Copiar"}
            </Button>
            {c.canal?.tipo === "whatsapp" && (
              // ABRE a conversa com o texto já digitado — e para aí. Quem
              // aperta enviar é ela, no aplicativo dela. O ALTAR não tem
              // integração de envio e não é isto que a cria.
              <Button
                size="sm"
                variant="outline"
                asChild
                className="cursor-pointer gap-1.5"
              >
                <a
                  href={`https://wa.me/${c.canal.valor.replace(/\D/g, "")}?text=${encodeURIComponent(c.mensagem)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir no WhatsApp
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await setStatus({
                    leadId: c.leadId as Id<"landingLeads">,
                    status: "contatado",
                  });
                  toast.success("Marcado como contatado.");
                } catch {
                  toast.error("Não foi possível marcar.");
                }
              }}
              className="cursor-pointer text-muted-foreground"
            >
              Já falei com ela
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
