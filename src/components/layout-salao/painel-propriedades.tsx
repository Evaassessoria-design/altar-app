import { useState } from "react";
import { useQuery } from "convex/react";
import { Copy, ImageIcon, Plus, RotateCw, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import type { AberturaDoSalao, DadosDoLayout, ElementoDoLayout, ParedeDoSalao } from "@/convex/lib/layoutSalao.ts";
import { lugaresDoLayout } from "@/convex/lib/layoutSalao.ts";
import { PECAS, type PecaDaBiblioteca } from "@/convex/lib/layoutSalaoBiblioteca.ts";
import { urlDeExibicao } from "@/lib/imagem-reduzida.ts";
import { arred, novoIdLocal, ROTULO_CATEGORIA, type Alvo } from "@/lib/layout-salao.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DE PROPRIEDADES — o que está selecionado, ou o salão.
//
// Campo numérico guarda o TEXTO enquanto ela digita ("26," é um estado válido
// no meio da digitação) e só vira número ao sair do campo. Converter a cada
// tecla transformava "2,5" em "25" no celular.
// ─────────────────────────────────────────────────────────────────────────────

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
};
const fmt = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","));

function CampoNumero({
  id,
  rotulo,
  valor,
  onSalvar,
  min,
  max,
}: {
  id: string;
  rotulo: string;
  valor: number | undefined;
  onSalvar: (n: number | undefined) => void;
  min?: number;
  max?: number;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{rotulo}</Label>
      <Input
        id={id}
        inputMode="decimal"
        className="h-8"
        value={texto ?? fmt(valor)}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto === null) return;
          let n = num(texto);
          if (n !== undefined) {
            if (min !== undefined) n = Math.max(min, n);
            if (max !== undefined) n = Math.min(max, n);
            n = arred(n);
          }
          onSalvar(n);
          setTexto(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

type Props = {
  eventId: Id<"events">;
  dados: DadosDoLayout;
  selecionado: Alvo | null;
  fotos: Record<string, { url: string | null; previewUrl: string | null }>;
  onAlterar: (d: DadosDoLayout) => void;
  onSelecionar: (a: Alvo | null) => void;
  onRemover: () => void;
  onDuplicar: () => void;
  onFotoEscolhida: (fotoId: Id<"eventPhotos">, foto: { url: string | null; previewUrl: string | null }) => void;
};

export function PainelPropriedades(p: Props) {
  const { dados, selecionado } = p;

  if (selecionado?.tipo === "elemento") {
    const e = dados.elementos.find((x) => x.id === selecionado.id);
    if (e) return <PainelElemento {...p} e={e} />;
  }
  if (selecionado?.tipo === "mesa") {
    const i = dados.mesas.posicoes.findIndex((x) => x.id === selecionado.id);
    if (i >= 0) {
      return (
        <div className="space-y-3">
          <Cabeca titulo={`Mesa ${i + 1}`} onFechar={() => p.onSelecionar(null)} />
          <p className="text-xs text-muted-foreground">
            Arraste na planta para mover. Diâmetro e lugares valem para todas as mesas — ajuste em “Salão”.
          </p>
          <Acoes onDuplicar={p.onDuplicar} onRemover={p.onRemover} />
        </div>
      );
    }
  }
  if (selecionado?.tipo === "pilar") {
    const pilar = dados.pilares.find((x) => x.id === selecionado.id);
    if (pilar) {
      return (
        <div className="space-y-3">
          <Cabeca titulo="Pilar" onFechar={() => p.onSelecionar(null)} />
          <CampoNumero id="pilar-lado" rotulo="Lado (m)" valor={pilar.lado} min={0.2} max={5}
            onSalvar={(n) => n && p.onAlterar({ ...dados, pilares: dados.pilares.map((x) => (x.id === pilar.id ? { ...x, lado: n } : x)) })} />
          <Acoes onRemover={p.onRemover} />
        </div>
      );
    }
  }
  return <PainelSalao {...p} />;
}

function Cabeca({ titulo, onFechar }: { titulo: string; onFechar: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-sm">{titulo}</h3>
      <Button size="icon" variant="ghost" className="size-7" aria-label="Fechar seleção" onClick={onFechar}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

function Acoes({ onDuplicar, onRemover }: { onDuplicar?: () => void; onRemover: () => void }) {
  return (
    <div className="flex gap-2 pt-1">
      {onDuplicar && (
        <Button size="sm" variant="outline" className="flex-1" onClick={onDuplicar}>
          <Copy className="size-4 mr-1.5" /> Duplicar
        </Button>
      )}
      <Button size="sm" variant="outline" className="flex-1 text-destructive" onClick={onRemover}>
        <Trash2 className="size-4 mr-1.5" /> Remover
      </Button>
    </div>
  );
}

function PainelElemento(p: Props & { e: ElementoDoLayout }) {
  const { e, dados } = p;
  const [escolherFoto, setEscolherFoto] = useState(false);
  const alterar = (parcial: Partial<ElementoDoLayout>) =>
    p.onAlterar({ ...dados, elementos: dados.elementos.map((x) => (x.id === e.id ? { ...x, ...parcial } : x)) });
  const foto = e.fotoId ? p.fotos[e.fotoId] : undefined;
  const fotoUrl = foto ? urlDeExibicao(foto) : null;

  return (
    <div className="space-y-3">
      <Cabeca titulo={ROTULO_CATEGORIA[e.categoria]} onFechar={() => p.onSelecionar(null)} />
      <div className="space-y-1">
        <Label htmlFor="el-rotulo" className="text-xs">Nome na planta</Label>
        <Input id="el-rotulo" className="h-8" maxLength={60} value={e.rotulo}
          onChange={(ev) => alterar({ rotulo: ev.target.value.toUpperCase() })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CampoNumero id="el-largura" rotulo={e.forma === "redondo" ? "Diâmetro (m)" : "Largura (m)"} valor={e.largura} min={0.2} max={dados.salao.largura}
          onSalvar={(n) => n && alterar(e.forma === "redondo" ? { largura: n, profundidade: n } : { largura: n })} />
        {e.forma !== "redondo" && (
          <CampoNumero id="el-prof" rotulo="Profundidade (m)" valor={e.profundidade} min={0.2} max={dados.salao.comprimento}
            onSalvar={(n) => n && alterar({ profundidade: n })} />
        )}
        <CampoNumero id="el-x" rotulo="Posição x (m)" valor={e.cx} min={0} max={dados.salao.largura} onSalvar={(n) => n !== undefined && alterar({ cx: n })} />
        <CampoNumero id="el-y" rotulo="Posição y (m)" valor={e.cy} min={0} max={dados.salao.comprimento} onSalvar={(n) => n !== undefined && alterar({ cy: n })} />
        <CampoNumero id="el-altura" rotulo="Altura no 3D (m)" valor={e.altura} min={0} max={20} onSalvar={(n) => alterar({ altura: n })} />
        {e.categoria === "principal" && (
          <CampoNumero id="el-cadeiras" rotulo="Cadeiras por lado" valor={e.cadeirasPorLado} min={0} max={60}
            onSalvar={(n) => alterar({ cadeirasPorLado: n === undefined ? undefined : Math.round(n) })} />
        )}
      </div>
      {e.forma !== "redondo" && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => alterar({ rotacao: (((e.rotacao ?? 0) + 90) % 360) || undefined })}>
          <RotateCw className="size-4 mr-1.5" /> Girar 90° {e.rotacao ? `(agora ${e.rotacao}°)` : ""}
        </Button>
      )}

      <div className="space-y-1.5 pt-1">
        <p className="text-xs font-medium">Foto de referência</p>
        {fotoUrl ? (
          <div className="relative">
            <img src={fotoUrl} alt={`Referência de ${e.rotulo}`} className="w-full h-32 object-cover rounded-md border border-border" />
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEscolherFoto(true)}>Trocar</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => alterar({ fotoId: undefined })}>Tirar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full" onClick={() => setEscolherFoto(true)}>
            <ImageIcon className="size-4 mr-1.5" /> Escolher da Galeria do evento
          </Button>
        )}
      </div>

      <Acoes onDuplicar={p.onDuplicar} onRemover={p.onRemover} />

      <SeletorDeFoto
        aberto={escolherFoto}
        eventId={p.eventId}
        onFechar={() => setEscolherFoto(false)}
        onEscolher={(fotoId, f) => {
          p.onFotoEscolhida(fotoId, f);
          alterar({ fotoId });
          setEscolherFoto(false);
        }}
      />
    </div>
  );
}

function SeletorDeFoto({
  aberto,
  eventId,
  onFechar,
  onEscolher,
}: {
  aberto: boolean;
  eventId: Id<"events">;
  onFechar: () => void;
  onEscolher: (id: Id<"eventPhotos">, f: { url: string | null; previewUrl: string | null }) => void;
}) {
  const fotos = useQuery(api.gallery.listPhotos, aberto ? { eventId } : "skip");
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Foto de referência</DialogTitle>
          <DialogDescription>Escolha uma foto da Galeria deste evento. Ela aparece no PDF que vai para os clientes.</DialogDescription>
        </DialogHeader>
        {fotos === undefined ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando a Galeria…</p>
        ) : fotos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            A Galeria deste evento ainda não tem fotos. Envie as referências na Galeria e volte aqui.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {fotos.map((f) => {
              const src = urlDeExibicao(f);
              return (
                <button
                  key={f._id}
                  type="button"
                  className="aspect-square rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary"
                  onClick={() => onEscolher(f._id, { url: f.url, previewUrl: f.previewUrl })}
                  aria-label={f.caption ? `Usar a foto ${f.caption}` : `Usar a foto ${f.filename}`}
                >
                  {src ? <img src={src} alt={f.caption ?? f.filename} className="w-full h-full object-cover" /> : null}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const PAREDES: { v: ParedeDoSalao; l: string }[] = [
  { v: "esquerda", l: "Esquerda" },
  { v: "direita", l: "Direita" },
  { v: "fundo", l: "Fundo" },
  { v: "frente", l: "Frente (palco)" },
];

function PainelSalao(p: Props) {
  const { dados } = p;
  const s = dados.salao;
  const alterarSalao = (parcial: Partial<DadosDoLayout["salao"]>) => p.onAlterar({ ...dados, salao: { ...s, ...parcial } });
  const alterarAbertura = (id: string, parcial: Partial<AberturaDoSalao>) =>
    p.onAlterar({ ...dados, aberturas: dados.aberturas.map((a) => (a.id === id ? { ...a, ...parcial } : a)) });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Salão</h3>
        <p className="text-xs text-muted-foreground">
          {dados.mesas.posicoes.length} mesas · {lugaresDoLayout(dados)} lugares. Toque numa peça da planta para editá-la.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CampoNumero id="s-largura" rotulo="Largura (m)" valor={s.largura} min={2} max={300} onSalvar={(n) => n && alterarSalao({ largura: n })} />
        <CampoNumero id="s-comp" rotulo="Comprimento (m)" valor={s.comprimento} min={2} max={300} onSalvar={(n) => n && alterarSalao({ comprimento: n })} />
        <CampoNumero id="s-pe" rotulo="Pé-direito (m)" valor={s.peDireito} min={2} max={40} onSalvar={(n) => alterarSalao({ peDireito: n })} />
        <div className="flex items-end gap-2 pb-1.5">
          <Switch id="s-cortina" checked={!!s.cortina} onCheckedChange={(v) => alterarSalao({ cortina: v })} />
          <Label htmlFor="s-cortina" className="text-xs">Paredes com cortina</Label>
        </div>
        <CampoNumero id="s-diam" rotulo="Diâmetro das mesas (m)" valor={dados.mesas.diametro} min={0.4} max={5}
          onSalvar={(n) => n && p.onAlterar({ ...dados, mesas: { ...dados.mesas, diametro: n } })} />
        <CampoNumero id="s-lug" rotulo="Lugares por mesa" valor={dados.mesas.lugares} min={1} max={30}
          onSalvar={(n) => n && p.onAlterar({ ...dados, mesas: { ...dados.mesas, lugares: Math.round(n) } })} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Entradas e acessos</h3>
          <Button size="sm" variant="ghost" onClick={() =>
            p.onAlterar({ ...dados, aberturas: [...dados.aberturas, { id: novoIdLocal("ab"), parede: "esquerda", inicio: 1, fim: 3, rotulo: "ENTRADA", tipo: "entrada" }] })}>
            <Plus className="size-4 mr-1" /> Adicionar
          </Button>
        </div>
        {dados.aberturas.map((a) => (
          <div key={a.id} className="rounded-md border border-border p-2 space-y-2">
            <div className="flex gap-2">
              <Input className="h-8" aria-label="Nome da abertura" value={a.rotulo} maxLength={60} onChange={(e) => alterarAbertura(a.id, { rotulo: e.target.value.toUpperCase() })} />
              <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Remover ${a.rotulo}`}
                onClick={() => p.onAlterar({ ...dados, aberturas: dados.aberturas.filter((x) => x.id !== a.id) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={a.parede} onValueChange={(v) => alterarAbertura(a.id, { parede: v as ParedeDoSalao })}>
                <SelectTrigger className="h-8" aria-label="Parede"><SelectValue /></SelectTrigger>
                <SelectContent>{PAREDES.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={a.tipo} onValueChange={(v) => alterarAbertura(a.id, { tipo: v as AberturaDoSalao["tipo"] })}>
                <SelectTrigger className="h-8" aria-label="Tipo de acesso"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada de convidados</SelectItem>
                  <SelectItem value="servico">Serviço / cozinha</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
              <CampoNumero id={`ab-i-${a.id}`} rotulo="De (m)" valor={a.inicio} min={0} onSalvar={(n) => n !== undefined && alterarAbertura(a.id, { inicio: n })} />
              <CampoNumero id={`ab-f-${a.id}`} rotulo="Até (m)" valor={a.fim} min={0} onSalvar={(n) => n !== undefined && alterarAbertura(a.id, { fim: n })} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Biblioteca de peças ──────────────────────────────────────────────────────

export function BibliotecaDialog({
  aberto,
  onFechar,
  onEscolher,
}: {
  aberto: boolean;
  onFechar: () => void;
  onEscolher: (peca: PecaDaBiblioteca) => void;
}) {
  const grupos = [...new Set(PECAS.map((x) => x.grupo))];
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Biblioteca de peças</DialogTitle>
          <DialogDescription>Medidas usuais de partida. Depois de colocar, ajuste a medida no próprio elemento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{g}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PECAS.filter((x) => x.grupo === g).map((x) => (
                  <button key={x.chave} type="button" onClick={() => onEscolher(x)}
                    className="text-left rounded-lg border border-border p-2.5 hover:bg-accent/50 transition-colors">
                    <p className="text-sm font-medium leading-tight">{x.nome}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {x.forma === "redondo" ? `Ø ${fmt(x.largura)} m` : `${fmt(x.largura)} × ${fmt(x.profundidade)} m`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
