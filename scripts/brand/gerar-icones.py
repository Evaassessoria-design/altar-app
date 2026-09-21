#!/usr/bin/env python3
"""
Deriva os ícones do ALTAR a partir da ARTE OFICIAL.

─────────────────────────────────────────────────────────────────────────────
O QUE ESTE SCRIPT É — E O QUE ELE NUNCA FAZ

Ele NÃO desenha nada. Não redesenha a flor, não muda a cor, não muda a
espessura do traço, não aplica gradiente, sombra ou efeito, e não distorce.

O que ele faz é só isto, e nesta ordem:
  1. acha a caixa da TINTA na arte oficial (o que é mais escuro que o fundo);
  2. recorta exatamente essa caixa;
  3. redimensiona proporcionalmente (nunca estica);
  4. centraliza sobre um quadrado pintado com o BEGE DA PRÓPRIA ARTE, para o
     encontro entre o símbolo e o fundo ser invisível.

Recorte, margem e tamanho são adaptação técnica. É o que a identidade permite.

─────────────────────────────────────────────────────────────────────────────
POR QUE CADA ALVO TEM UMA MARGEM DIFERENTE

O ícone instalado mostrava o símbolo minúsculo, e a causa não era margem: o
arquivo em `public/icon/` era um PRINT de tela inicial de iPhone — 860×1600,
fundo branco, com o ícone pequeno no meio e a palavra "Altar" embaixo. O
manifest declarava aquilo como 192×192 e 512×512. O sistema espremia um
retrato em um quadrado e ainda cortava a zona de segurança.

Corrigido isso, cada plataforma corta de um jeito, e é por isso que os alvos
não compartilham a mesma proporção:

  · `any`      — mostrado quase inteiro. Símbolo grande.
  · `maskable` — a plataforma recorta um círculo inscrito em ~80% do quadrado.
                 Tudo que importa precisa caber DENTRO desses 80%, então o
                 símbolo é menor de propósito. Não é desperdício: é o que
                 impede o Android de cortar a ponta da folha.
  · Apple      — máscara de cantos arredondados, que come pouco. Símbolo
                 grande, como no `any`.
  · favicon    — 16px é quase nada. Quanto maior o símbolo, mais chance de o
                 arco continuar reconhecível.

─────────────────────────────────────────────────────────────────────────────
COMO RODAR (manual, fora do build)

    pip install pillow
    python3 scripts/brand/gerar-icones.py

Não entra no `pnpm build` de propósito: gerar imagem em toda build é custo
recorrente para um arquivo que muda uma vez por ano. Os PNGs são versionados.
"""

from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
ARTE = RAIZ / "brand" / "altar-arte-oficial.png"
ICONES = RAIZ / "public" / "icon"
MARCA = RAIZ / "public" / "brand"
PUBLIC = RAIZ / "public"

# O bege é LIDO da arte, nunca escolhido. Um tom inventado criaria uma emenda
# visível entre o recorte e o preenchimento.
def bege_da_arte(im: Image.Image) -> tuple[int, int, int]:
    return im.convert("RGB").getpixel((5, 5))


def caixa_da_tinta(im: Image.Image, limite: int = 140) -> tuple[int, int, int, int]:
    """A menor caixa que contém todo o traço escuro."""
    rgb = im.convert("RGB")
    larg, alt = rgb.size
    px = rgb.load()
    xs, ys = [], []
    for y in range(alt):
        for x in range(larg):
            r, g, b = px[x, y]
            if r < limite and g < limite and b < limite:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def simbolo(im: Image.Image) -> Image.Image:
    """A arte recortada na tinta — o símbolo, sem nada ao redor."""
    return im.crop(caixa_da_tinta(im))


def tile(sim: Image.Image, lado: int, ocupacao: float, fundo) -> Image.Image:
    """
    O símbolo centralizado num quadrado de `lado`, ocupando `ocupacao` dele.

    A escala respeita o lado MAIOR do símbolo, então a proporção original é
    preservada em qualquer alvo — nada estica.
    """
    alvo = int(lado * ocupacao)
    escala = alvo / max(sim.size)
    novo = (max(1, round(sim.width * escala)), max(1, round(sim.height * escala)))
    redim = sim.resize(novo, Image.LANCZOS)
    tela = Image.new("RGB", (lado, lado), fundo)
    tela.paste(redim, ((lado - novo[0]) // 2, (lado - novo[1]) // 2))
    return tela


def main() -> None:
    arte = Image.open(ARTE).convert("RGB")
    fundo = bege_da_arte(arte)
    sim = simbolo(arte)
    print(f"arte {arte.size}  bege {fundo}  símbolo {sim.size}")

    ICONES.mkdir(parents=True, exist_ok=True)
    MARCA.mkdir(parents=True, exist_ok=True)

    gerados: list[tuple[Path, Image.Image]] = []

    # ── PWA `any`: mostrado quase inteiro ────────────────────────────────────
    for lado in (192, 512):
        gerados.append((ICONES / f"icon-{lado}.png", tile(sim, lado, 0.78, fundo)))

    # ── PWA `maskable`: tudo dentro dos 80% centrais ─────────────────────────
    for lado in (192, 512):
        gerados.append((ICONES / f"maskable-{lado}.png", tile(sim, lado, 0.60, fundo)))

    # ── Apple: a máscara come pouco, então o símbolo pode ser grande ─────────
    gerados.append((ICONES / "apple-touch-icon.png", tile(sim, 180, 0.74, fundo)))

    # ── Favicon: 16px não perdoa margem ─────────────────────────────────────
    for lado in (16, 32, 48):
        gerados.append((ICONES / f"favicon-{lado}.png", tile(sim, lado, 0.88, fundo)))

    # ── Símbolo para a INTERFACE ────────────────────────────────────────────
    # 192px para um chip de 28–32px: sobra resolução para tela retina e não se
    # paga meio mega de PNG no 4G do galpão por causa de um logo de 32 pixels.
    # Recorte mais justo que o do PWA — aqui não há máscara nenhuma cortando.
    gerados.append((MARCA / "altar-simbolo-192.png", tile(sim, 192, 0.88, fundo)))

    for caminho, img in gerados:
        img.save(caminho, "PNG", optimize=True)
        print(f"  {caminho.relative_to(RAIZ)}  {img.size[0]}x{img.size[1]}")

    # ── favicon.ico: os três tamanhos num arquivo só ────────────────────────
    ico = PUBLIC / "favicon.ico"
    tile(sim, 48, 0.88, fundo).save(ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  {ico.relative_to(RAIZ)}  16/32/48")

    # ── Compartilhamento: campo bege com o símbolo ao centro ────────────────
    og_l, og_a = 1200, 630
    alvo = int(og_a * 0.64)
    escala = alvo / max(sim.size)
    redim = sim.resize((round(sim.width * escala), round(sim.height * escala)), Image.LANCZOS)
    og = Image.new("RGB", (og_l, og_a), fundo)
    og.paste(redim, ((og_l - redim.width) // 2, (og_a - redim.height) // 2))
    og_path = MARCA / "altar-og.png"
    og.save(og_path, "PNG", optimize=True)
    print(f"  {og_path.relative_to(RAIZ)}  {og_l}x{og_a}")

    # A ARTE OFICIAL NÃO É COPIADA PARA `public/`, de propósito. Ela é a FONTE
    # e fica em `brand/`, versionada e intacta. Servi-la na web seriam 900 KB
    # que nenhuma página pede — e o lugar onde ela "caberia" (um herói na
    # landing) não existe. Quando existir, ela vem daqui.


if __name__ == "__main__":
    main()
