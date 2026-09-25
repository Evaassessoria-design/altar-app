// ─────────────────────────────────────────────────────────────────────────────
// "ESTE EVENTO ESTÁ PRONTO PARA SER MOSTRADO?"
//
// ── A PERGUNTA QUE A SAÚDE NÃO RESPONDE ─────────────────────────────────────
// `saudeDoEvento` mede se a OPERAÇÃO está coberta: tem contrato, tem
// fornecedor, tem equipe, tem financeiro. É a pergunta de quem vai executar.
//
// Esta aqui é outra: o evento está APRESENTÁVEL? Tem capa, tem referência
// classificada, tem flor com foto, tem projeto para virar PDF. Um evento pode
// estar 100% saudável e abrir o Projeto Visual em branco — e foi exatamente o
// que a auditoria da live encontrou na conta de demonstração.
//
// ── POR QUE ISTO NÃO É SÓ UM CHECKLIST EM PAPEL ─────────────────────────────
// Um documento diz "suba 8 fotos". Ninguém lembra se subiu. Esta conta lê o
// banco e responde com o número: "3 de 8". A diferença entre as duas coisas é
// descobrir que faltava foto na véspera ou ao vivo.
//
// ── TRÊS SITUAÇÕES, NÃO DUAS ────────────────────────────────────────────────
//   pronto   — dá para mostrar
//   atencao  — funciona, mas vai parecer pobre na tela
//   faltando — a tela abre vazia; não mostre
//
// "Atenção" existe porque a maioria dos casos reais mora ali: uma foto
// classificada funciona, seis convencem. Reduzir a sim/não faria o aviso
// mentir nos dois sentidos.
// ─────────────────────────────────────────────────────────────────────────────

export type SituacaoDoItem = "pronto" | "atencao" | "faltando";

export type ItemDeProntidao = {
  chave: string;
  rotulo: string;
  situacao: SituacaoDoItem;
  /** O que foi contado — nunca uma promessa sem número atrás. */
  detalhe: string;
  /** O que fazer, quando há o que fazer. */
  acao?: string;
};

export type DadosDeProntidao = {
  temCapa: boolean;
  fotos: number;
  fotosClassificadas: number;
  fotosComAmbiente: number;
  temFotoInterna: boolean;
  itensDeMontagem: number;
  itensComFotoDaGaleria: number;
  materiaisNaFicha: number;
  materiaisComFoto: number;
  documentos: number;
  fornecedores: number;
  temConceito: boolean;
};

/** Abaixo disto a tela funciona mas parece pobre. */
const FOTOS_CONFORTAVEIS = 6;
const MATERIAIS_CONFORTAVEIS = 3;

function situacao(valor: number, minimo: number, confortavel: number): SituacaoDoItem {
  if (valor < minimo) return "faltando";
  return valor < confortavel ? "atencao" : "pronto";
}

export function prontidaoDoEvento(d: DadosDeProntidao): {
  itens: ItemDeProntidao[];
  pronto: number;
  atencao: number;
  faltando: number;
  /** Dá para apresentar este evento sem constrangimento? */
  apresentavel: boolean;
} {
  const itens: ItemDeProntidao[] = [
    {
      chave: "capa",
      rotulo: "Capa do projeto",
      situacao: d.temCapa ? "pronto" : "faltando",
      detalhe: d.temCapa ? "escolhida" : "nenhuma foto escolhida como capa",
      acao: d.temCapa ? undefined : "Na Galeria, escolha uma foto como capa",
    },
    {
      chave: "fotos",
      rotulo: "Fotos na Galeria",
      situacao: situacao(d.fotos, 1, FOTOS_CONFORTAVEIS),
      detalhe: `${d.fotos} ${d.fotos === 1 ? "foto" : "fotos"}`,
      acao:
        d.fotos < FOTOS_CONFORTAVEIS
          ? `Suba pelo menos ${FOTOS_CONFORTAVEIS} para as prateleiras ficarem cheias`
          : undefined,
    },
    {
      chave: "classificacao",
      rotulo: "Fotos classificadas",
      // Sem classificação as fotos caem todas em "sem classificação" e o
      // projeto perde a separação entre contratado e inspiração, que é
      // justamente o que ele tem de melhor para mostrar.
      situacao: situacao(d.fotosClassificadas, 1, Math.min(d.fotos, FOTOS_CONFORTAVEIS) || 1),
      detalhe: `${d.fotosClassificadas} de ${d.fotos} com contratado/inspiração`,
      acao:
        d.fotosClassificadas < d.fotos
          ? "Classifique as demais na Galeria"
          : undefined,
    },
    {
      chave: "ambiente",
      rotulo: "Fotos com ambiente",
      situacao: situacao(d.fotosComAmbiente, 1, Math.min(d.fotos, FOTOS_CONFORTAVEIS) || 1),
      detalhe: `${d.fotosComAmbiente} de ${d.fotos} situadas`,
      acao:
        d.fotosComAmbiente === 0
          ? "Sem ambiente, todas caem no mesmo bloco do projeto"
          : undefined,
    },
    {
      chave: "conceito",
      rotulo: "Conceito e paleta",
      situacao: d.temConceito ? "pronto" : "atencao",
      detalhe: d.temConceito ? "escrito no Questionário" : "não preenchido",
      acao: d.temConceito ? undefined : "Questionário → Conceito do Evento",
    },
    {
      chave: "montagem",
      rotulo: "Itens de montagem",
      situacao: situacao(d.itensDeMontagem, 1, 4),
      detalhe: `${d.itensDeMontagem} ${d.itensDeMontagem === 1 ? "item" : "itens"}`,
      acao: d.itensDeMontagem === 0 ? "O projeto não tem o que listar" : undefined,
    },
    {
      chave: "materiais",
      rotulo: "Flores e materiais com foto",
      situacao:
        d.materiaisNaFicha === 0
          ? "faltando"
          : situacao(d.materiaisComFoto, 1, MATERIAIS_CONFORTAVEIS),
      detalhe:
        d.materiaisNaFicha === 0
          ? "nenhum material na ficha técnica"
          : `${d.materiaisComFoto} de ${d.materiaisNaFicha} com foto`,
      acao:
        d.materiaisComFoto < MATERIAIS_CONFORTAVEIS
          ? "No Catálogo, envie a foto de rosa, lisianthus, eucalipto"
          : undefined,
    },
    {
      chave: "foto_interna",
      rotulo: 'Foto "só para mim"',
      // Não é obrigatória para o evento — é obrigatória para DEMONSTRAR a
      // fronteira entre o que é interno e o que vai para a cliente.
      situacao: d.temFotoInterna ? "pronto" : "atencao",
      detalhe: d.temFotoInterna ? "existe uma marcada" : "nenhuma marcada",
      acao: d.temFotoInterna
        ? undefined
        : "Marque uma foto como interna para mostrar que ela não sai no PDF",
    },
    {
      chave: "reaproveitamento",
      rotulo: "Item usando foto da Galeria",
      situacao: d.itensComFotoDaGaleria > 0 ? "pronto" : "atencao",
      detalhe:
        d.itensComFotoDaGaleria > 0
          ? `${d.itensComFotoDaGaleria} ${d.itensComFotoDaGaleria === 1 ? "item" : "itens"}`
          : "nenhum",
      acao:
        d.itensComFotoDaGaleria > 0
          ? undefined
          : "Aponte a foto de um item para uma da Galeria — é o que mostra que não há upload duplicado",
    },
    {
      chave: "documentos",
      rotulo: "Documentos anexados",
      situacao: situacao(d.documentos, 1, 2),
      detalhe: `${d.documentos} na pasta do evento`,
      acao: d.documentos === 0 ? "Anexe o contrato e um orçamento" : undefined,
    },
    {
      chave: "fornecedores",
      rotulo: "Fornecedores",
      situacao: situacao(d.fornecedores, 1, 3),
      detalhe: `${d.fornecedores} ${d.fornecedores === 1 ? "cadastrado" : "cadastrados"}`,
      acao: d.fornecedores === 0 ? "Sem fornecedor não há dossiê a mostrar" : undefined,
    },
  ];

  const conta = (s: SituacaoDoItem) => itens.filter((i) => i.situacao === s).length;
  const faltando = conta("faltando");

  return {
    itens,
    pronto: conta("pronto"),
    atencao: conta("atencao"),
    faltando,
    // Um "faltando" já basta para não apresentar: são todos itens que fazem
    // uma tela abrir vazia na frente de quem está assistindo.
    apresentavel: faltando === 0,
  };
}
