// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVO QUE ENTRA NO ALTAR — A REGRA, EM UM LUGAR SÓ
//
// ── O DEFEITO QUE ESTE MÓDULO EXISTE PARA NÃO REPETIR ───────────────────────
// Uma decoradora tentou anexar um DOCX de 3,9 MB em Funil → Documentos e foi
// recusada por um limite de 1.000.000 bytes. O mesmo envio passava por TRÊS
// conferências, cada uma com um teto próprio, e a mais apertada era a última:
//
//   tela do funil   20 MB   → passava
//   hook de envio   10 MB   → passava
//   backend         1.000.000 bytes (0,95 MiB) → RECUSAVA
//
// O teto do backend não era nem um teto de arquivo: era `QUANTIDADE_MAXIMA`,
// de `numeroGravavel.ts`, escrito para quantidade física — "um milhão de vasos
// é sempre erro de digitação". Verdade para vasos. Em bytes, virou um teto de
// upload de 0,95 MiB, com a mensagem "Confira os zeros" para quem não digitou
// zero nenhum: escolheu um arquivo.
//
// Pior: as duas primeiras portas diziam SIM, então o arquivo subia inteiro
// para o storage antes de o registro ser recusado — cada tentativa frustrada
// deixava um arquivo órfão, pago e sem nenhuma linha apontando para ele.
//
// ── A REGRA, AGORA ──────────────────────────────────────────────────────────
// Um número, uma definição, dois lados. O front e o backend importam a MESMA
// constante e o MESMO predicado (`cabeNoTeto`). Não é disciplina: é
// impossibilidade — não há onde os dois discordarem sobre tamanho.
//
// O backend continua sendo a autoridade final. O que mudou é que ele deixou de
// contradizer a tela: o que a tela aceita, ele aceita.
//
// ── POR QUE A CATEGORIA EXISTE ──────────────────────────────────────────────
// Foto e documento têm motivos diferentes para o próprio teto, e misturá-los
// seria trocar um defeito por outro. Celular atual tira foto de dezenas de MB
// e a galeria precisa DESENHAR aquilo; proposta em DOCX com imagens passa de
// 10 MB e ninguém vai desenhar nada. Os dois números vivem aqui, lado a lado,
// para quem mexer em um ver o outro.
// ─────────────────────────────────────────────────────────────────────────────

/** Um mebibyte. É o que todo sistema operacional chama de "MB" na tela. */
export const MB = 1024 * 1024;

/**
 * Teto das FOTOS: 15 MB = 15.728.640 bytes.
 *
 * Generoso de propósito — foto de celular atual passa fácil de 10 MB, e
 * recusar o trabalho da pessoa é pior que aceitar um arquivo grande.
 */
export const TAMANHO_MAXIMO_IMAGEM = 15 * MB;

/**
 * Teto dos DOCUMENTOS: 100 MB = 104.857.600 bytes.
 *
 * Era 10 MB no hook e 20 MB na tela do funil; virou 20 MB nos dois em 01/10.
 * Em 06/10 subiu para 100 MB por decisão de produto: orçamento de fornecedor
 * em PPTX ou PDF com fotos de ambiente chega a 30–36 MB, e com 20 MB essa
 * papelada continuava fora do sistema (ver docs/upload/arquivo-orfao.md).
 *
 * ── POR QUE 100 MB CABE NO TRANSPORTE ──────────────────────────────────────
 * O envio usa a URL de upload do Convex (`generateUploadUrl` + POST), que NÃO
 * tem limite de tamanho. O limite de 20 MB do Convex é o das HTTP actions,
 * caminho que o ALTAR não usa para arquivo. O que existe no transporte é um
 * PRAZO: o POST tem 2 minutos (`PRAZO_DO_ENVIO_MS`). Por isso o número aqui
 * não é "o que o storage aguenta", e sim o que termina dentro do prazo numa
 * conexão razoável.
 */
export const TAMANHO_MAXIMO_DOCUMENTO = 100 * MB;

/**
 * Quanto tempo o Convex dá ao POST de upload antes de cortá-lo: 2 minutos.
 *
 * Não é configurável do nosso lado. Está aqui para a tela saber distinguir
 * "a rede caiu" de "o envio passou do prazo" e dizer a coisa certa: 100 MB em
 * 2 minutos pede cerca de 7 Mbit/s de SUBIDA sustentada. Um 4G fraco de galpão
 * não entrega isso, e a pessoa precisa saber que o problema é a conexão, não
 * o arquivo.
 */
export const PRAZO_DO_ENVIO_MS = 2 * 60 * 1000;

export type TipoDeEnvio = "imagem" | "documento";

/** O teto da categoria. Única função que decide qual número vale. */
export function tetoDoTipo(tipo: TipoDeEnvio): number {
  return tipo === "imagem" ? TAMANHO_MAXIMO_IMAGEM : TAMANHO_MAXIMO_DOCUMENTO;
}

/** "3,9 MB" — para a mensagem dizer o tamanho em vez de só reclamar. */
export function tamanhoEmMB(bytes: number): string {
  return `${(bytes / MB).toFixed(1).replace(".", ",")} MB`;
}

/** "20 MB" — o teto, sem decimal, como se fala. */
export function tetoEmMB(teto: number): string {
  return `${Math.round(teto / MB)} MB`;
}

/**
 * O PREDICADO COMPARTILHADO. É daqui que vem a garantia de que a tela e o
 * servidor nunca mais discordem sobre tamanho.
 *
 * `0` NÃO cabe, e é a regra do domínio: arquivo vazio não é documento. A tela
 * já dizia isso ("está vazio") antes desta correção, e o backend agora
 * concorda em vez de aceitar em silêncio.
 */
export function cabeNoTeto(bytes: number, teto: number): boolean {
  if (!Number.isFinite(bytes)) return false;
  if (bytes <= 0) return false;
  return bytes <= teto;
}

/**
 * A frase que a pessoa lê quando o arquivo é grande demais.
 *
 * Sem bytes, sem "confira os zeros", sem número de sete dígitos. Era
 * "Tamanho do arquivo: acima do limite de 1.000.000. Confira os zeros." para
 * quem não digitou zero nenhum — escolheu um arquivo.
 *
 * `nome` entra quando a tela aceita VÁRIOS arquivos de uma vez: aí "este
 * arquivo" não diz qual, e a pessoa fica sem saber o que trocar. É o motivo
 * pelo qual a mensagem antiga nomeava o arquivo, e esse motivo continua certo.
 */
export function recadoDeTamanho(teto: number, nome?: string): string {
  const sujeito = nome ? `“${nome}”` : "Este arquivo";
  return `${sujeito} ultrapassa o limite de ${tetoEmMB(teto)}. Escolha um arquivo menor e tente novamente.`;
}

/**
 * Por que o envio falhou, em frase de gente.
 *
 * O navegador não diz "timeout" quando o servidor corta o POST: devolve uma
 * falha de rede igual à de um Wi-Fi que caiu. O tempo decorrido é o que
 * separa os dois casos. Perto do prazo, a causa é a velocidade de subida — e
 * mandar "verifique a conexão" para quem está conectado não ajuda ninguém.
 *
 * Função pura para poder ser testada sem navegador.
 */
export function motivoDaFalhaDoEnvio(falha: {
  nome: string;
  /** Status HTTP da resposta; 0 quando não houve resposta. */
  status: number;
  decorridoMs: number;
}): string {
  // 90% do prazo: o corte do servidor chega um pouco antes ou depois dos 120 s
  // exatos, e o relógio do navegador não é o dele.
  if (falha.decorridoMs >= PRAZO_DO_ENVIO_MS * 0.9) {
    return (
      `O envio de “${falha.nome}” passou de 2 minutos e foi interrompido. ` +
      `Arquivos grandes precisam de uma internet mais rápida: tente de novo no Wi-Fi ` +
      `ou reduza o arquivo.`
    );
  }
  if (falha.status === 413) {
    return recadoDeTamanho(TAMANHO_MAXIMO_DOCUMENTO, falha.nome);
  }
  if (falha.status === 0) {
    return `Não foi possível enviar “${falha.nome}”. Verifique a conexão e tente de novo.`;
  }
  return `Não foi possível enviar “${falha.nome}” (erro ${falha.status}). Tente de novo.`;
}

/** A dica ao lado do seletor. Mesma fonte do teto — não se escreve à mão. */
export function dicaDeTamanho(tipo: TipoDeEnvio): string {
  return `Máximo de ${tetoEmMB(tetoDoTipo(tipo))} por arquivo.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATOS — EXTENSÃO **OU** MIME, PORQUE O NAVEGADOR MENTE DOS DOIS LADOS
//
// `file.type` vem do sistema operacional e não é confiável:
//   · DOCX chega como `application/octet-stream` em instalação sem Office;
//   · DOC às vezes chega vazio;
//   · XLSX chega como `application/vnd.ms-excel` em alguns Windows;
//   · arquivo vindo de nuvem às vezes chega sem tipo nenhum.
//
// E a extensão também não basta: arquivo salvo de um anexo pode vir sem ela.
//
// Por isso a regra é OU, nunca E: basta um dos dois reconhecer o formato.
// Recusar exige que os DOIS sejam desconhecidos. Errar para o lado de aceitar
// é certo aqui — isto é conveniência de seletor, não barreira de segurança. O
// que protege é o backend, onde o `storageId` só vira registro por uma
// mutation da própria empresa, com dono conferido.
// ─────────────────────────────────────────────────────────────────────────────

/** Os formatos de papelada que o ALTAR aceita, por extensão e por MIME. */
export const FORMATOS_DE_DOCUMENTO = [
  { extensao: ".pdf", mimes: ["application/pdf"] },
  { extensao: ".doc", mimes: ["application/msword"] },
  {
    extensao: ".docx",
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  { extensao: ".xls", mimes: ["application/vnd.ms-excel"] },
  {
    extensao: ".xlsx",
    mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  },
  { extensao: ".ppt", mimes: ["application/vnd.ms-powerpoint"] },
  {
    extensao: ".pptx",
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  },
  // Já era aceito na pasta do evento antes desta rodada. Sai da lista só por
  // decisão de produto, nunca por descuido de refatoração.
  { extensao: ".txt", mimes: ["text/plain"] },
] as const;

/** Extensões dos documentos — serve de `accept` do `<input type="file">`. */
export const EXTENSOES_DE_DOCUMENTO = FORMATOS_DE_DOCUMENTO.map((f) => f.extensao);

/** MIMEs dos documentos. */
export const MIMES_DE_DOCUMENTO = FORMATOS_DE_DOCUMENTO.flatMap((f) => [...f.mimes]);

/** O `accept` pronto: extensões E MIMEs, que é o que os navegadores entendem. */
export const ACCEPT_DE_DOCUMENTO = [...EXTENSOES_DE_DOCUMENTO, ...MIMES_DE_DOCUMENTO].join(",");

/** ".docx" de "Proposta Final.DOCX". `null` quando não há extensão. */
export function extensaoDe(nome: string): string | null {
  const ponto = nome.lastIndexOf(".");
  if (ponto <= 0 || ponto === nome.length - 1) return null;
  return nome.slice(ponto).toLowerCase();
}

/**
 * O formato é aceito?
 *
 * @param aceitos Prefixos ou MIMEs completos ("image/", "application/pdf").
 * @param extensoes Extensões com ponto (".docx"). Vazio = não olha extensão.
 *
 * Lista de aceitos vazia = qualquer formato, porque a tela que não declara
 * nada é a que de propósito aceita tudo (Referência e "Outro documento" do
 * funil recebem imagem, planilha e o que mais a negociação produzir).
 */
export function formatoPermitido(
  arquivo: { name: string; type: string },
  aceitos: readonly string[],
  extensoes: readonly string[] = [],
): boolean {
  if (aceitos.length === 0 && extensoes.length === 0) return true;

  const mime = (arquivo.type || "").toLowerCase();
  const casaMime =
    mime.length > 0 &&
    aceitos.some((a) => {
      const alvo = a.toLowerCase();
      return alvo.endsWith("/") ? mime.startsWith(alvo) : mime === alvo;
    });
  if (casaMime) return true;

  const ext = extensaoDe(arquivo.name);
  if (ext && extensoes.some((e) => e.toLowerCase() === ext)) return true;

  // ── MIME AUSENTE NÃO É MIME ERRADO ────────────────────────────────────
  // Se o navegador não declarou tipo NENHUM, não há palpite a fazer, e
  // recusar o trabalho de alguém por ausência de informação é pior do que
  // deixar o backend decidir — que é quem de fato protege, conferindo dono.
  //
  // Esta linha já era a regra antes desta correção, e mantê-la é deliberado:
  // sem ela, um PNG arrastado de uma origem que não informa MIME passaria a
  // ser recusado na planta e na galeria. Consertar tamanho criando um defeito
  // de formato seria trocar de problema.
  if (mime.length === 0) return true;

  // MIME declarado e desconhecido, extensão desconhecida: aí sim é não.
  return false;
}
