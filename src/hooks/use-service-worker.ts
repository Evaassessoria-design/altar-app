import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function useServiceWorker() {
  const toastShown = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const showUpdateToast = (registration: ServiceWorkerRegistration) => {
      if (toastShown.current) return;
      toastShown.current = true;

      toast("Nova versão disponível!", {
        duration: Infinity,
        action: {
          label: "Atualizar",
          onClick: () => {
            // Manda a versão nova assumir e SÓ ENTÃO recarrega. Recarregar sem
            // isso traria a mesma versão antiga de volta, e o aviso voltaria a
            // aparecer — um botão que parece não funcionar.
            registration.waiting?.postMessage({ type: "ATIVAR_NOVA_VERSAO" });
            // `controllerchange` avisa que a troca terminou. O tempo limite é
            // rede de segurança: sem ele, uma troca que não completasse
            // deixaria a pessoa presa num aviso que não sai.
            let recarregou = false;
            const recarregar = () => {
              if (recarregou) return;
              recarregou = true;
              window.location.reload();
            };
            navigator.serviceWorker.addEventListener("controllerchange", recarregar, { once: true });
            setTimeout(recarregar, 3000);
          },
        },
      });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registrado:", registration);

        // Check if update is already waiting
        if (registration.waiting) {
          showUpdateToast(registration);
          return;
        }

        // Listen for new updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(registration);
            }
          });
        });
      })
      .catch((err) => console.log("Falha ao registrar Service Worker:", err));
  }, []);
}
