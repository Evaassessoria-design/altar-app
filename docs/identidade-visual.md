# A identidade do ALTAR — de onde sai cada imagem

**A arte oficial é uma só.** Tudo o que aparece como marca no produto é ela,
recortada e redimensionada. Nada aqui foi redesenhado.

---

## A fonte

```
brand/altar-arte-oficial.png        1254 × 1254   ← A FONTE. Não se edita.
```

Fica fora de `public/` de propósito: é o arquivo-mãe, versionado e intacto.
Servi-la na web seriam 900 KB que nenhuma página pede. Quando existir um lugar
com espaço para a arte inteira — um herói na landing, por exemplo — ela sai
daqui.

**Cores lidas da própria arte** (nunca escolhidas à mão):

| | |
|---|---|
| Bege do fundo | `#E7D8C8` — é o `background_color` do manifest |
| Tinta do traço | grafite escuro, como veio |

---

## As derivações

Todas saem de `scripts/brand/gerar-icones.py`, que faz só quatro coisas: acha
a caixa da tinta, recorta, redimensiona proporcionalmente e centraliza sobre o
bege da própria arte. Rodar de novo reproduz byte a byte.

```bash
pip install pillow && python3 scripts/brand/gerar-icones.py
```

| Arquivo | Tamanho | Símbolo ocupa | Onde é usado |
|---|---|---|---|
| `public/icon/icon-192.png` | 192×192 | 78% | PWA `any` · service worker |
| `public/icon/icon-512.png` | 512×512 | 78% | PWA `any` |
| `public/icon/maskable-192.png` | 192×192 | 60% | PWA `maskable` |
| `public/icon/maskable-512.png` | 512×512 | 60% | PWA `maskable` |
| `public/icon/apple-touch-icon.png` | 180×180 | 74% | iPhone / iPad |
| `public/icon/favicon-16.png` | 16×16 | 88% | aba do navegador |
| `public/icon/favicon-32.png` | 32×32 | 88% | aba do navegador |
| `public/icon/favicon-48.png` | 48×48 | 88% | aba do navegador |
| `public/favicon.ico` | 16+32+48 | 88% | pedido cego de `/favicon.ico` |
| `public/brand/altar-simbolo-192.png` | 192×192 | 88% | interface (`MarcaAltar`) |
| `public/brand/altar-og.png` | 1200×630 | 64% da altura | WhatsApp, redes |

### Por que a ocupação muda

Não é gosto: cada plataforma corta de um jeito.

- **`any`** — mostrado quase inteiro. Símbolo grande.
- **`maskable`** — o sistema recorta um círculo inscrito em ~80% do quadrado.
  Tudo que importa precisa caber dentro desses 80%, então o símbolo é **menor
  de propósito**. Não é desperdício: é o que impede o Android de cortar a
  ponta da folha.
- **Apple** — máscara de cantos arredondados, que come pouco. Símbolo grande.
- **Favicon** — 16px não perdoa margem.

---

## O mapa

```
ARTE OFICIAL (brand/altar-arte-oficial.png)
│
├─ SITE ──────────── cabeçalho e rodapé da landing ....... MarcaAltar
│                    login e recuperação de senha ........ MarcaAltar
│
├─ SISTEMA ───────── barra lateral (desktop) ............. MarcaAltar
│                    cabeçalho (celular) ................. MarcaAltar
│
├─ FAVICON ───────── favicon.ico + PNG 16/32/48 .......... index.html
│
├─ PWA ───────────── icon-192/512 (any) ................. site.webmanifest
│                    maskable-192/512 (maskable) ......... site.webmanifest
│
├─ APPLE ─────────── apple-touch-icon 180×180 ............ index.html
│
└─ COMPARTILHAMENTO  altar-og 1200×630 ................... og:image, twitter:image
```

**A marca tem um componente só:** `src/components/marca-altar.tsx`. As cinco
telas o usam. Nenhuma tem `<img>` própria — foi exatamente assim que um print
virou logo.

---

## O que havia antes

| | O que era |
|---|---|
| `public/icon/icon-192.png` e `icon-512.png` | O **mesmo arquivo**, byte a byte, de **860×1600**: um PRINT de tela inicial de iPhone, com fundo branco, o ícone pequeno no meio e a palavra "Altar" embaixo. O manifest declarava aquilo como 192×192 e 512×512 |
| `purpose` dos dois | `"any maskable"` — o mesmo arquivo servindo aos dois papéis, então o Android cortava a zona de segurança de uma arte que não tinha folga |
| Favicon | Um **emoji ⚡** embutido como data-URI. Placeholder do gerador do projeto |
| `apple-touch-icon` | Apontava para o print de 860×1600 |
| `og:image` | Não existia. O link colado no WhatsApp virava um retângulo cinza |
| Logo na interface | Cinco `<img>` iguais apontando para o print, espremido em 32 pixels |

**Era esta a causa do "símbolo minúsculo no ícone instalado".** Não era
margem: era o arquivo. O símbolo real ocupava cerca de 15% de uma imagem
retrato, e o sistema ainda a espremia num quadrado.

---

## O que confere isso

`src/lib/identidade-visual.test.ts` lê o **cabeçalho IHDR de cada PNG** e
compara com o que o manifest promete. `sizes="192x192"` era uma promessa que
nenhum teste conferia — é a única forma de flagrar outro print entrando como
ícone. Também exige que nenhum ícone seja cópia de outro, que todo caminho
citado no `index.html` exista, e que as cinco telas usem o componente.

---

## Conferência visual (não dá para testar por código)

- o ícone instalado no **iPhone**, depois da máscara do iOS;
- o ícone instalado no **Android**, que aplica o recorte `maskable`;
- o favicon na aba, em 16px reais;
- o link colado no **WhatsApp**;
- o selo a 28–32px na barra lateral e no cabeçalho do celular, nos dois temas.

Está no passo a passo de `docs/homologacao-dev.md`.
