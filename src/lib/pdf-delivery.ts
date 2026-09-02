import type jsPDF from "jspdf";

// ─────────────────────────────────────────────────────────────────────────────
// ENTREGA DE PDF — O ÚNICO PONTO EM QUE O ARQUIVO SAI DO ALTAR
//
// O ALTAR já gera cinco PDFs (orçamento, relatório do evento, caderno de
// montagem, carregamento e ficha técnica), e cada um chamava `doc.save()`
// direto. `save()` do jsPDF monta um Blob e dispara um `<a download>`.
//
// Isso funciona no navegador de mesa e é EXATAMENTE o que quebra quando o
// mesmo código roda empacotado como aplicativo: WebView de iOS ignora o
// atributo `download`, e o toque no botão simplesmente não faz nada — sem
// erro, sem aviso, sem arquivo. A pessoa no galpão conclui que o sistema
// travou.
//
// Este módulo não muda NADA do comportamento de hoje: continua chamando
// `doc.save()`. O que ele muda é a geografia do problema — quando existir
// aplicativo, o caminho alternativo (compartilhar, abrir no visualizador
// nativo) se escreve UMA vez aqui, e não em cinco arquivos que ninguém vai
// lembrar de procurar. Um sexto PDF que nasça amanhã já nasce coberto.
//
// A trava correspondente vive em pdf-delivery.test.ts: nenhum gerador pode
// voltar a chamar `doc.save()` por conta própria.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entrega ao usuário o PDF já desenhado.
 *
 * @param doc            documento jsPDF pronto (nada é desenhado aqui).
 * @param nomeDoArquivo  nome final, COM a extensão `.pdf`.
 */
export function entregarPdf(doc: jsPDF, nomeDoArquivo: string): void {
  doc.save(nomeDoArquivo);
}
