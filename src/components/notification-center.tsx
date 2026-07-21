import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Bell, X, CheckCheck, Calendar, CreditCard, ShoppingBag, ClipboardList } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils.ts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type NotifType = "event_soon" | "trial_expiring" | "purchase_pending" | "checklist_incomplete";

function notifIcon(type: NotifType) {
  const cls = "size-4 flex-shrink-0";
  switch (type) {
    case "event_soon": return <Calendar className={cn(cls, "text-primary")} />;
    case "trial_expiring": return <CreditCard className={cn(cls, "text-amber-500")} />;
    case "purchase_pending": return <ShoppingBag className={cn(cls, "text-blue-500")} />;
    case "checklist_incomplete": return <ClipboardList className={cn(cls, "text-orange-500")} />;
  }
}

function notifBg(type: NotifType) {
  switch (type) {
    case "event_soon": return "bg-primary/10";
    case "trial_expiring": return "bg-amber-50 dark:bg-amber-900/20";
    case "purchase_pending": return "bg-blue-50 dark:bg-blue-900/20";
    case "checklist_incomplete": return "bg-orange-50 dark:bg-orange-900/20";
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const notifications = useQuery(api.notifications.list);
  const unreadCount = useQuery(api.notifications.unreadCount);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const remove = useMutation(api.notifications.remove);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleNotifClick = async (id: Id<"notifications">, relatedEventId?: Id<"events">) => {
    await markRead({ id });
    if (relatedEventId) {
      navigate(`/eventos/${relatedEventId}`);
      setOpen(false);
    }
  };

  const count = unreadCount ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer"
        aria-label="Notificações"
      >
        <Bell className="size-5 text-muted-foreground" />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 size-4 bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center"
            >
              {count > 9 ? "9+" : count}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                <span className="font-semibold text-sm">Notificações</span>
                {count > 0 && (
                  <span className="bg-destructive text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {count}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <button
                    onClick={() => void markAllRead()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-accent"
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck className="size-3.5" />
                    Todas lidas
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-md hover:bg-accent text-muted-foreground transition-colors cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto">
              {!notifications || notifications.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <Bell className="size-8 mx-auto mb-2 opacity-20" />
                  <p>Nenhuma notificação</p>
                  <p className="text-xs mt-0.5">Você está em dia!</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {notifications.map((notif) => (
                    <motion.div
                      key={notif._id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className={cn(
                        "flex gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors",
                        !notif.isRead && "bg-accent/30",
                      )}
                    >
                      {/* Icon */}
                      <div className={cn("mt-0.5 size-7 rounded-full flex items-center justify-center flex-shrink-0", notifBg(notif.type))}>
                        {notifIcon(notif.type)}
                      </div>

                      {/* Content */}
                      <button
                        className="flex-1 text-left cursor-pointer min-w-0"
                        onClick={() => void handleNotifClick(notif._id, notif.relatedEventId)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm font-medium leading-tight", !notif.isRead && "font-semibold")}>
                            {notif.title}
                          </p>
                          {!notif.isRead && (
                            <span className="size-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: ptBR })}
                        </p>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => void remove({ id: notif._id })}
                        className="flex-shrink-0 p-1 rounded-md hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer self-start mt-0.5"
                      >
                        <X className="size-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
