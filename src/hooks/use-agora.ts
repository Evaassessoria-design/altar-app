import { useEffect, useState } from "react";

/**
 * O relógio da tela, avançando de tempos em tempos.
 *
 * Existe para o que só o TEMPO muda: uma tarefa que parou de responder não
 * dispara nenhuma atualização de consulta — é justamente a ausência de
 * atualização que a denuncia. Sem um relógio, a tela nunca descobre.
 *
 * Um minuto basta para tudo que usa isto: ninguém precisa de "travada" com
 * precisão de segundo.
 */
export function useAgora(intervaloMs = 60_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}
