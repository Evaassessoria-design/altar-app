import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DadosDoLayout } from "@/convex/lib/layoutSalao.ts";
import { ALTURA_PADRAO } from "@/convex/lib/layoutSalaoBiblioteca.ts";
import { corDoElemento } from "@/lib/layout-salao.ts";

// ─────────────────────────────────────────────────────────────────────────────
// VISÃO 3D — leitura do MESMO layout da planta 2D.
//
// Carregada sob demanda (React.lazy na página): o three.js pesa ~600 KB e a
// maior parte das visitas à tela é para mexer na planta, não para girar o 3D.
//
// ── DESEMPENHO ──────────────────────────────────────────────────────────────
// Um salão de 400 mesas × 10 cadeiras são 4 mil cadeiras. Uma malha por peça
// derrubaria um celular médio; aqui tampo, assento e encosto são
// `InstancedMesh` — três desenhos para todas as mesas, não doze mil.
// ─────────────────────────────────────────────────────────────────────────────

export type Visao3DHandle = {
  /** PNG da vista atual — vai para o PDF dos clientes. */
  capturar: () => string | null;
  irPara: (vista: "perspectiva" | "cima" | "palco" | "entrada") => void;
};

type Props = {
  dados: DadosDoLayout;
  destaque?: string;
  mostrarParedes: boolean;
};

const PISO = 0xede8df;
const CADEIRA = 0xf7f3ea;

export const Visao3D = forwardRef<Visao3DHandle, Props>(function Visao3D({ dados, destaque, mostrarParedes }, ref) {
  const montagem = useRef<HTMLDivElement>(null);
  const estado = useRef<{
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    scene: THREE.Scene;
    conteudo: THREE.Group;
    paredes: THREE.Group;
    vistas: Record<string, { p: THREE.Vector3; t: THREE.Vector3 }>;
    anim: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; k: number } | null;
  } | null>(null);

  // Cena: criada uma vez.
  useEffect(() => {
    const el = montagem.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f2ed);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 3;
    controls.maxDistance = 160;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfbf, 1.35));
    const sol = new THREE.DirectionalLight(0xfff6e8, 1.6);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    scene.add(sol);
    scene.add(sol.target);

    const conteudo = new THREE.Group();
    const paredes = new THREE.Group();
    scene.add(conteudo, paredes);

    estado.current = { renderer, camera, controls, scene, conteudo, paredes, vistas: {}, anim: null };

    const ajustar = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.fov = w < h ? 60 : 45;
      camera.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(ajustar);
    obs.observe(el);
    ajustar();

    let quadro = 0;
    const laco = () => {
      quadro = requestAnimationFrame(laco);
      const s = estado.current;
      if (!s) return;
      if (s.anim) {
        s.anim.k = Math.min(1, s.anim.k + 0.05);
        const e = 1 - Math.pow(1 - s.anim.k, 3);
        camera.position.lerpVectors(s.anim.p0, s.anim.p1, e);
        controls.target.lerpVectors(s.anim.t0, s.anim.t1, e);
        if (s.anim.k >= 1) s.anim = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    laco();

    return () => {
      cancelAnimationFrame(quadro);
      obs.disconnect();
      controls.dispose();
      descartar(scene);
      renderer.dispose();
      renderer.domElement.remove();
      estado.current = null;
    };
  }, []);

  // Conteúdo: refeito quando o layout muda.
  useEffect(() => {
    const s = estado.current;
    if (!s) return;
    const primeiraVez = s.conteudo.children.length === 0;
    limpar(s.conteudo);
    limpar(s.paredes);
    montarCena(s.conteudo, s.paredes, dados, destaque);

    const W = dados.salao.largura;
    const L = dados.salao.comprimento;
    const D = Math.max(W, L);
    const sol = s.scene.children.find((c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight);
    if (sol) {
      sol.position.set(-W * 0.45, D * 1.1, L * 0.5);
      const cam = sol.shadow.camera;
      cam.left = -D; cam.right = D; cam.top = D; cam.bottom = -D; cam.far = D * 4;
      cam.updateProjectionMatrix();
    }

    const P = (x: number, y: number, h = 0) => new THREE.Vector3(x - W / 2, h, -(y - L / 2));
    const entrada = dados.aberturas.find((a) => a.tipo === "entrada");
    const pontoEntrada = entrada
      ? entrada.parede === "esquerda" ? P(1.2, (entrada.inicio + entrada.fim) / 2, 1.65)
      : entrada.parede === "direita" ? P(W - 1.2, (entrada.inicio + entrada.fim) / 2, 1.65)
      : entrada.parede === "fundo" ? P((entrada.inicio + entrada.fim) / 2, L - 1.2, 1.65)
      : P((entrada.inicio + entrada.fim) / 2, 1.2, 1.65)
      : P(W / 2, L - 1.2, 1.65);
    const palco = dados.elementos.find((e) => e.categoria === "palco");
    s.vistas = {
      perspectiva: { p: new THREE.Vector3(0, D * 1.25, D * 0.95), t: new THREE.Vector3(0, 0, 0) },
      cima: { p: new THREE.Vector3(0, D * 1.7, 0.01), t: new THREE.Vector3(0, 0, 0) },
      entrada: { p: pontoEntrada, t: P(W / 2, L / 2, 1.1) },
      palco: {
        p: palco ? P(palco.cx, palco.cy + palco.profundidade / 2 + 1.2, 2.4) : P(W / 2, 1.5, 2.4),
        t: P(W / 2, L * 0.7, 1),
      },
    };
    if (primeiraVez) {
      s.camera.position.copy(s.vistas.perspectiva.p);
      s.controls.target.copy(s.vistas.perspectiva.t);
    }
  }, [dados, destaque]);

  useEffect(() => {
    if (estado.current) estado.current.paredes.visible = mostrarParedes;
  }, [mostrarParedes, dados]);

  useImperativeHandle(ref, () => ({
    capturar: () => {
      const s = estado.current;
      if (!s) return null;
      s.renderer.render(s.scene, s.camera);
      try {
        return s.renderer.domElement.toDataURL("image/jpeg", 0.88);
      } catch {
        return null;
      }
    },
    irPara: (vista) => {
      const s = estado.current;
      const v = s?.vistas[vista];
      if (!s || !v) return;
      s.anim = { p0: s.camera.position.clone(), t0: s.controls.target.clone(), p1: v.p.clone(), t1: v.t.clone(), k: 0 };
    },
  }));

  return <div ref={montagem} className="w-full h-full rounded-lg overflow-hidden" />;
});

// ── Construção da cena ───────────────────────────────────────────────────────

function material(cor: number | string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.85, ...extra });
}

function montarCena(g: THREE.Group, paredes: THREE.Group, d: DadosDoLayout, destaque?: string) {
  const W = d.salao.largura;
  const L = d.salao.comprimento;
  const H = d.salao.peDireito ?? 3.5;
  const P = (x: number, y: number) => [x - W / 2, -(y - L / 2)] as const;

  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, L), material(PISO));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  g.add(piso);
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(W * 6, L * 6), material(0xf1eee8));
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = -0.01;
  g.add(chao);

  // Paredes com vãos nas aberturas. A da frente fica translúcida: é dela que
  // a câmera olha, e uma parede opaca ali esconderia o salão inteiro.
  const corParede = d.salao.cortina ? 0xd9c7a3 : 0xeae5dc;
  const t = 0.25;
  const parede = (x1: number, y1: number, x2: number, y2: number, frente: boolean) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(x2 - x1), H, Math.abs(y2 - y1)),
      material(corParede, { transparent: true, opacity: frente ? 0.25 : 0.9 }),
    );
    const [cx, cz] = P((x1 + x2) / 2, (y1 + y2) / 2);
    m.position.set(cx, H / 2, cz);
    m.receiveShadow = true;
    paredes.add(m);
  };
  const trechos = (lado: "frente" | "fundo" | "esquerda" | "direita", total: number) => {
    const vaos = d.aberturas.filter((a) => a.parede === lado).sort((a, b) => a.inicio - b.inicio);
    const r: [number, number][] = [];
    let s = 0;
    for (const a of vaos) {
      if (a.inicio > s) r.push([s, a.inicio]);
      s = Math.max(s, a.fim);
    }
    if (s < total) r.push([s, total]);
    return r;
  };
  for (const [a, b] of trechos("frente", W)) parede(a, -t, b, 0, true);
  for (const [a, b] of trechos("fundo", W)) parede(a, L, b, L + t, false);
  for (const [a, b] of trechos("esquerda", L)) parede(-t, a, 0, b, false);
  for (const [a, b] of trechos("direita", L)) parede(W, a, W + t, b, false);

  for (const p of d.pilares) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.lado, H, p.lado), material(0x8c8676));
    const [cx, cz] = P(p.cx, p.cy);
    m.position.set(cx, H / 2, cz);
    m.castShadow = true;
    g.add(m);
  }

  for (const e of d.elementos) {
    const cor = corDoElemento(e.categoria, destaque);
    const h = e.altura ?? ALTURA_PADRAO[e.categoria];
    const [cx, cz] = P(e.cx, e.cy);
    const rot = -((e.rotacao ?? 0) * Math.PI) / 180;

    if (e.categoria === "area") {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(e.largura, e.profundidade), material(0xf1e9da));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rot;
      m.position.set(cx, 0.005, cz);
      g.add(m);
      continue;
    }

    if (e.categoria === "lounge") {
      montarLounge(g, cx, cz, e.largura, e.profundidade, rot);
      if (e.rotulo) g.add(rotulo(e.rotulo, cx, 1.5, cz, 1));
      continue;
    }

    let geo: THREE.BufferGeometry;
    if (e.forma === "redondo") geo = new THREE.CylinderGeometry(e.largura / 2, e.largura / 2, h, 40);
    else if (e.forma === "oval") geo = new THREE.CylinderGeometry(1, 1, h, 48);
    else geo = new THREE.BoxGeometry(e.largura, h, e.profundidade);
    const m = new THREE.Mesh(geo, material(cor === "none" ? 0xffffff : cor));
    if (e.forma === "oval") m.scale.set(e.largura / 2, 1, e.profundidade / 2);
    m.position.set(cx, h / 2, cz);
    m.rotation.y = rot;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);

    if (e.forma === "oval" && e.categoria === "bar") {
      const miolo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h + 0.03, 48), material(0xe6dcc8));
      miolo.scale.set(e.largura * 0.3, 1, e.profundidade * 0.2);
      miolo.position.set(cx, (h + 0.03) / 2, cz);
      miolo.rotation.y = rot;
      g.add(miolo);
    }

    if (e.categoria === "principal" && e.cadeirasPorLado) {
      const n = e.cadeirasPorLado;
      const passo = e.largura / n;
      const cadeiras: { x: number; z: number; r: number }[] = [];
      for (let i = 0; i < n; i++) {
        const lx = -e.largura / 2 + passo * (i + 0.5);
        for (const lado of [-1, 1]) {
          const lz = lado * (e.profundidade / 2 + 0.35);
          // Gira o ponto local junto com a mesa.
          const x = cx + lx * Math.cos(rot) + lz * Math.sin(rot);
          const z = cz - lx * Math.sin(rot) + lz * Math.cos(rot);
          cadeiras.push({ x, z, r: rot + (lado > 0 ? Math.PI : 0) });
        }
      }
      g.add(...cadeirasInstanciadas(cadeiras));
    }

    if (e.rotulo) g.add(rotulo(e.rotulo, cx, h + 0.9, cz, e.largura > 6 ? 1.4 : 1));
  }

  // Mesas redondas: tudo instanciado.
  const r = d.mesas.diametro / 2;
  const n = d.mesas.posicoes.length;
  if (n > 0) {
    const tampo = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, 0.76, 40), material(0xffffff), n);
    const arranjo = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.35, 12), material(0x8e9a6b), n);
    const mat = new THREE.Matrix4();
    const cadeiras: { x: number; z: number; r: number }[] = [];
    d.mesas.posicoes.forEach((p, i) => {
      const [cx, cz] = P(p.cx, p.cy);
      mat.makeTranslation(cx, 0.38, cz);
      tampo.setMatrixAt(i, mat);
      mat.makeTranslation(cx, 0.76 + 0.175, cz);
      arranjo.setMatrixAt(i, mat);
      for (let k = 0; k < d.mesas.lugares; k++) {
        const a = (k / d.mesas.lugares) * Math.PI * 2;
        const x = cx + Math.cos(a) * (r + 0.32);
        const z = cz + Math.sin(a) * (r + 0.32);
        // Encosto (eixo -z local) para fora: a cadeira "olha" para a mesa.
        cadeiras.push({ x, z, r: Math.atan2(cx - x, cz - z) });
      }
      g.add(rotulo(String(i + 1), cx, 1.55, cz, 0.9));
    });
    tampo.castShadow = true;
    tampo.receiveShadow = true;
    g.add(tampo, arranjo, ...cadeirasInstanciadas(cadeiras));
  }

  for (const a of d.aberturas) {
    const m = (a.inicio + a.fim) / 2;
    const [x, y] =
      a.parede === "esquerda" ? [-1.4, m] : a.parede === "direita" ? [W + 1.4, m] : a.parede === "fundo" ? [m, L + 1.4] : [m, -1.4];
    const [cx, cz] = P(x, y);
    g.add(rotulo(a.rotulo, cx, 1.6, cz, 1, a.tipo === "entrada" ? "#B08D57" : "#3F3A34", "#FFFFFF"));
  }
}

function cadeirasInstanciadas(pos: { x: number; z: number; r: number }[]) {
  const assento = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), material(CADEIRA), pos.length);
  const encosto = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.48, 0.05), material(CADEIRA), pos.length);
  const pernas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.44, 0.36), material(0xeee8dc), pos.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const um = new THREE.Vector3(1, 1, 1);
  const eixo = new THREE.Vector3(0, 1, 0);
  pos.forEach((c, i) => {
    q.setFromAxisAngle(eixo, c.r);
    m.compose(new THREE.Vector3(c.x, 0.46, c.z), q, um);
    assento.setMatrixAt(i, m);
    // Encosto deslocado para trás no eixo local da cadeira.
    const tras = new THREE.Vector3(0, 0, -0.2).applyQuaternion(q);
    m.compose(new THREE.Vector3(c.x + tras.x, 0.72, c.z + tras.z), q, um);
    encosto.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(c.x, 0.22, c.z), q, um);
    pernas.setMatrixAt(i, m);
  });
  for (const x of [assento, encosto]) x.castShadow = true;
  return [assento, encosto, pernas];
}

function montarLounge(g: THREE.Group, cx: number, cz: number, w: number, p: number, rot: number) {
  const grupo = new THREE.Group();
  const tapete = new THREE.Mesh(new THREE.PlaneGeometry(w, p), material(0xe8dcc4));
  tapete.rotation.x = -Math.PI / 2;
  tapete.position.y = 0.01;
  grupo.add(tapete);
  const estofado = material(0xd8cbb3);
  const caixa = (bw: number, bh: number, bd: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), estofado);
    m.position.set(x, y, z);
    m.castShadow = true;
    grupo.add(m);
  };
  // Sofá no fundo do lounge (z positivo = frente da planta), poltronas na outra ponta.
  caixa(w * 0.62, 0.42, 0.85, 0, 0.21, p / 2 - 0.7);
  caixa(w * 0.62, 0.85, 0.22, 0, 0.42, p / 2 - 0.2);
  for (const dx of [-w / 2 + 0.75, w / 2 - 0.75]) {
    caixa(0.8, 0.42, 0.8, dx, 0.21, -p / 2 + 1.3);
    caixa(0.8, 0.8, 0.2, dx, 0.4, -p / 2 + 0.95);
  }
  const mesa = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 32), material(0xffffff));
  mesa.position.set(0, 0.2, 0.1);
  grupo.add(mesa);
  grupo.position.set(cx, 0, cz);
  grupo.rotation.y = rot;
  g.add(grupo);
}

function rotulo(texto: string, x: number, y: number, z: number, escala = 1, cor = "#3F3A34", fundo = "rgba(255,255,255,0.9)") {
  const c = document.createElement("canvas");
  const k = c.getContext("2d");
  const fs = 64;
  if (!k) return new THREE.Object3D();
  k.font = `600 ${fs}px Inter, Helvetica, Arial, sans-serif`;
  const w = Math.ceil(k.measureText(texto).width + 48);
  c.width = w;
  c.height = fs + 36;
  k.font = `600 ${fs}px Inter, Helvetica, Arial, sans-serif`;
  k.fillStyle = fundo;
  const raio = 30;
  k.beginPath();
  k.moveTo(raio, 0);
  k.arcTo(w, 0, w, c.height, raio);
  k.arcTo(w, c.height, 0, c.height, raio);
  k.arcTo(0, c.height, 0, 0, raio);
  k.arcTo(0, 0, w, 0, raio);
  k.fill();
  k.fillStyle = cor;
  k.textAlign = "center";
  k.textBaseline = "middle";
  k.fillText(texto, w / 2, c.height / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const h = 0.8 * escala;
  sp.scale.set((h * w) / c.height, h, 1);
  sp.position.set(x, y, z);
  sp.renderOrder = 10;
  return sp;
}

function limpar(g: THREE.Group) {
  for (const filho of [...g.children]) {
    g.remove(filho);
    descartar(filho);
  }
}

function descartar(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh | THREE.Sprite;
    if ("geometry" in m && m.geometry) m.geometry.dispose();
    const mats = "material" in m ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of mats) {
      if (!mt) continue;
      const map = (mt as THREE.SpriteMaterial).map;
      map?.dispose();
      mt.dispose();
    }
  });
}
