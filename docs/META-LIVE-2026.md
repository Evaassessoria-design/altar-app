# META — Live de lançamento, semana de 28/09 a 04/10/2026

## A meta

Realizar a **live de apresentação do ALTAR para decoradores** na semana de
28/09/2026 a 04/10/2026. Data e horário a definir.

## As seis prioridades, nesta ordem

1. **Produto estável** — nada quebrado nos caminhos demonstrados
2. **Demonstração excelente** — a conta Marina & Gabriel contando uma história
3. **Assistente de IA funcionando de verdade** — homologado, não só verde no teste
4. **Aquisição preparada** — saber de onde veio quem chegar
5. **Onboarding simples** — do cadastro ao primeiro evento sem ajuda
6. **Experiência mobile confiável** — a live será assistida no celular

## O marco

> **Uma decoradora real já cadastrou aproximadamente 40 eventos no ALTAR antes
> do lançamento oficial.**

**Como ler isso:** é **evidência de uso**, não garantia de *product-market fit*.
Uma pessoa usando muito prova que o produto **aguenta** um volume real de
trabalho e que a jornada **fecha** — duas coisas que nenhum protótipo prova.
Não prova que outras decoradoras pagariam, nem que a retenção se sustenta. Um
usuário é uma amostra de um.

O que ela legitima dizer na live: *"não é protótipo"*.
O que não legitima: *"o mercado validou"*.

---

# Checklist pré-live

`PRONTO` · `PARCIAL` · `BLOQUEADO` · `NÃO INICIADO`

## PRODUTO
| Item | Estado |
|---|---|
| 4.064 testes passando, dois typechecks, lint, build | **PRONTO** |
| Jornada lead → proposta → evento → projeto → PDF fecha | **PRONTO** |
| Isolamento por conta auditado por teste | **PRONTO** |
| Paywall no servidor nas entradas que custam | **PRONTO** |

## DEMO
| Item | Estado |
|---|---|
| História Marina & Gabriel (18 tabelas semeadas) | **PRONTO** |
| Escopo, vínculo de fornecedor e data/forma de pagamento | **PRONTO** (esta rodada) |
| **Fotos na conta demo** | **BLOQUEADO** — precisa de upload humano |
| **Documentos na Pasta do evento** | **BLOQUEADO** — precisa de upload humano |
| **Comprovante anexado num lançamento** | **BLOQUEADO** — precisa de upload humano |
| **Conta demo com acesso garantido** (`internal`) | **NÃO INICIADO** — ação do Matheus |

## MOBILE
| Item | Estado |
|---|---|
| Auditoria estática das telas novas (320–430px) | **PRONTO** |
| **Homologação no iPhone real** | **NÃO INICIADO** |

## IA
| Item | Estado |
|---|---|
| Assistente: 7 agentes, semáforo, roteador, executor | **PRONTO** (código) |
| **`assistantTasks` publicada no Convex DEV** | **BLOQUEADO** — sem deployment acessível |
| **Smoke test dos 9 pedidos** | **BLOQUEADO** — depende do acima |
| Chave de IA no DEV | **PENDENTE DE DECISÃO** — sem ela responde pela redação local, e diz isso |

## FINANCEIRO
| Item | Estado |
|---|---|
| Vencidos, resumo, comprovantes, procedência da despesa | **PRONTO** |
| Teto do livro-caixa com aviso honesto | **PRONTO** |
| Asaas (assinatura do ALTAR) | **PARCIAL** — existe; não exercitado nesta rodada |

## PROJETO VISUAL
| Item | Estado |
|---|---|
| Tela, capa, conceito, ambientes, selos | **PRONTO** |
| PDF de apresentação aos noivos | **PRONTO** |
| **Capa escolhida na demo** | **BLOQUEADO** — depende das fotos |

## DOCUMENTOS
| Item | Estado |
|---|---|
| Pasta do evento com etiqueta de fornecedor | **PRONTO** |
| 6 PDFs (proposta, evento, caderno, carga, ficha, orçamento) + o dos noivos | **PRONTO** |
| Orientação EXIF corrigida | **PRONTO** |

## SITE / CADASTRO / PAGAMENTO
| Item | Estado |
|---|---|
| Landing com captura em `landingLeads` | **PRONTO** |
| Cadastro → trial sem cartão | **PRONTO** |
| **Oferta da live (preço, condição)** | **PENDENTE DE DECISÃO** |
| Checkout Asaas | **PARCIAL** — não exercitado |

## SUPORTE / ANALYTICS / BACKUP
| Item | Estado |
|---|---|
| Central de Comunicações (admin) | **PRONTO** — envio externo fechado por decisão |
| **Canal de suporte anunciado na live** | **PENDENTE DE DECISÃO** |
| **Analytics de funil pós-live** | **NÃO INICIADO** — `origem` em `landingLeads` |
| **Política de backup/restore documentada** | **NÃO INICIADO** |

## SEGURANÇA
| Item | Estado |
|---|---|
| Tenant isolation por teste, em todos os módulos novos | **PRONTO** |
| IA sem acesso ao banco; sem ferramenta; sem envio | **PRONTO** |
| Erro de provedor nunca vaza chave | **PRONTO** |
| Envio externo travado por 4 travas independentes | **PRONTO** |
| **`propostas` ausente do `tenant.isolation.test.ts`** | **NÃO INICIADO** — lacuna de cobertura conhecida |

## LIVE
| Item | Estado |
|---|---|
| Roteiro (`docs/LIVE-ALTAR.md`) | **PRONTO** |
| **Data e horário** | **PENDENTE DE DECISÃO** |
| **Ensaio completo com cronômetro** | **NÃO INICIADO** |
| **Gravação de reserva das cenas 3 e 6** | **NÃO INICIADO** |
