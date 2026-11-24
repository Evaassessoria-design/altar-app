import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DadosDoLayout } from "@/convex/lib/layoutSalao.ts";
import {
  atributosDoTexto,
  caixaDoDesenho,
  desenharPlanta,
  posicaoDoAlvo,
  type Alvo,
  type Forma,
} from "@/lib/layout-salao.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PLANTA 2D na tela — a mesma lista de formas do PDF (`desenharPlanta`), com
// alça de arrastar.
//
// Arrastar uma peça move a peça; arrastar o fundo move a VISTA (rolagem do
// contêiner). No celular isso é o que separa "mexi na mesa sem querer" de
// "rolei a planta": o dedo que começa no vazio nunca move nada.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  dados: DadosDoLayout;
  selecionado: Alvo | null;
  onSelecionar: (alvo: Alvo | null) => void;
  /** Ausente = somente leitura. */
  onMover?: (alvo: Alvo, cx: number, cy: number) => void;
  /** Chamado ao soltar — é quando vale registrar um passo no "desfazer". */
  onFimDoArraste?: () => void;
  destaque?: string;
  comFoto?: ReadonlySet<string>;
  zoom: number;
};

export function Planta2D({ dados, selecionado, onSelecionar, onMover, onFimDoArraste, destaque, comFoto, zoom }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const arraste = useRef<
    | { tipo: "peca"; alvo: Alvo; dx: number; dy: number; moveu: boolean }
    | { tipo: "vista"; x: number; y: number; sl: number; st: number }
    | null
  >(null);
  const [arrastando, setArrastando] = useState(false);

  const formas = useMemo(
    () => desenharPlanta(dados, { destaque, selecionado, comFoto }),
    [dados, destaque, selecionado, comFoto],
  );
  const box = caixaDoDesenho(dados);
  const L = dados.salao.comprimento;

  /** Ponto da tela → metros da planta (y para cima). */
  const paraPlanta = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: L - p.y };
  };

  const inicio = (e: ReactPointerEvent, alvo?: Alvo) => {
    if (alvo && onMover) {
      e.stopPropagation();
      const pos = posicaoDoAlvo(dados, alvo);
      const p = paraPlanta(e.clientX, e.clientY);
      if (!pos || !p) return;
      onSelecionar(alvo);
      arraste.current = { tipo: "peca", alvo, dx: pos.cx - p.x, dy: pos.cy - p.y, moveu: false };
    } else if (alvo) {
      e.stopPropagation();
      onSelecionar(alvo);
      return;
    } else {
      const c = contRef.current;
      if (!c) return;
      arraste.current = { tipo: "vista", x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop };
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setArrastando(true);
  };

  const mover = (e: ReactPointerEvent) => {
    const a = arraste.current;
    if (!a) return;
    if (a.tipo === "vista") {
      const c = contRef.current;
      if (!c) return;
      c.scrollLeft = a.sl - (e.clientX - a.x);
      c.scrollTop = a.st - (e.clientY - a.y);
      return;
    }
    const p = paraPlanta(e.clientX, e.clientY);
    if (!p || !onMover) return;
    a.moveu = true;
    onMover(a.alvo, p.x + a.dx, p.y + a.dy);
  };

  const fim = (e: ReactPointerEvent) => {
    const a = arraste.current;
    arraste.current = null;
    setArrastando(false);
    if (!a) return;
    if (a.tipo === "vista") {
      // Toque no vazio sem arrastar = tirar a seleção.
      if (Math.abs(e.clientX - a.x) < 4 && Math.abs(e.clientY - a.y) < 4) onSelecionar(null);
      return;
    }
    if (a.moveu) onFimDoArraste?.();
  };

  return (
    <div
      ref={contRef}
      className="relative w-full h-full overflow-auto bg-muted/30 rounded-lg"
      style={{ cursor: arrastando ? "grabbing" : "grab" }}
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label={`Planta do salão, ${dados.salao.largura} por ${dados.salao.comprimento} metros, ${dados.mesas.posicoes.length} mesas`}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 100}%`, display: "block", touchAction: "none", userSelect: "none" }}
        onPointerDown={(e) => inicio(e)}
        onPointerMove={mover}
        onPointerUp={fim}
        onPointerCancel={fim}
      >
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#FFFFFF" />
        {formas.map((f, i) => (
          <FormaSvg key={i} f={f} onInicio={inicio} editavel={!!onMover} />
        ))}
      </svg>
    </div>
  );
}

function FormaSvg({
  f,
  onInicio,
  editavel,
}: {
  f: Forma;
  onInicio: (e: ReactPointerEvent, alvo?: Alvo) => void;
  editavel: boolean;
}) {
  const handlers = f.alvo
    ? {
        onPointerDown: (e: ReactPointerEvent) => onInicio(e, f.alvo),
        style: { cursor: editavel ? "move" : "pointer" },
      }
    : { style: { pointerEvents: "none" as const } };

  switch (f.k) {
    case "rect":
      return (
        <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.rx} fill={f.fill} stroke={f.stroke} strokeWidth={f.sw}
          strokeDasharray={f.dash} transform={f.transform} opacity={f.opacity} {...handlers} />
      );
    case "circle":
      return <circle cx={f.cx} cy={f.cy} r={f.r} fill={f.fill} stroke={f.stroke} strokeWidth={f.sw} strokeDasharray={f.dash} transform={f.transform} {...handlers} />;
    case "ellipse":
      return <ellipse cx={f.cx} cy={f.cy} rx={f.rx} ry={f.ry} fill={f.fill} stroke={f.stroke} strokeWidth={f.sw} transform={f.transform} {...handlers} />;
    case "line":
      return <line x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} stroke={f.stroke} strokeWidth={f.sw} strokeDasharray={f.dash} style={{ pointerEvents: "none" }} />;
    case "text":
      return (
        <text x={f.x} y={f.y} fontSize={f.size} fill={f.fill} fontWeight={f.weight} fontStyle={f.italic ? "italic" : undefined}
          textAnchor={f.anchor ?? "start"} dominantBaseline="central" transform={atributosDoTexto(f)}
          fontFamily="Inter, Helvetica, Arial, sans-serif" style={{ pointerEvents: "none" }}>
          {f.texto}
        </text>
      );
  }
}
