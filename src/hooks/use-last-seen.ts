import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useLocation } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";

// ─────────────────────────────────────────────────────────────────────────────
// Registro de "último acesso" visto pelo lado do aplicativo.
//
// São DUAS travas, uma dentro da outra:
//
//  1. aqui, no navegador — evita até a ida ao servidor. Um contador em memória
//     do módulo (vive enquanto a aba estiver aberta) segura as chamadas dentro
//     da mesma sessão de navegação;
//  2. no servidor (convex/lib/presence.ts) — decide de fato se grava. É a que
//     vale: mesmo que este arquivo mude, ou que alguém chame a mutation por
//     fora, o banco só é tocado uma vez a cada 30 minutos por usuário.
//
// A trava do navegador é mais curta que a do servidor de propósito: ela existe
// só para cortar ruído de navegação, não para ser a regra.
// ─────────────────────────────────────────────────────────────────────────────

/** Intervalo mínimo entre duas CHAMADAS a partir desta aba. */
const CLIENT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutos

let lastCallAt = 0;

export function useLastSeen() {
  const touch = useMutation(api.users.touchLastSeen);
  const location = useLocation();

  useEffect(() => {
    const now = Date.now();
    if (now - lastCallAt < CLIENT_THROTTLE_MS) return;
    lastCallAt = now;

    // Em segundo plano: nunca bloqueia a tela e nunca mostra erro. Se falhar
    // (offline, sessão trocando), o próximo carregamento tenta de novo — perder
    // um carimbo de presença não tem consequência para quem usa o app.
    void touch({}).catch(() => {
      // Permite nova tentativa na próxima navegação em vez de esperar a janela.
      lastCallAt = 0;
    });
  }, [touch, location.pathname]);
}
