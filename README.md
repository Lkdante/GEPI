# GEPI — Gerenciador de EPI

App do ciclo do EPI em canteiro de obra, construído a partir do documento
*Engenheiro Copilot — Canteiro: modelo do produto* e do design *Canteiro — 8 telas
principais*. Cobre a **Fase 0 (só a parte local) e a Fase B** do documento: o
trabalhador faz o próprio check-in, a falta de EPI vira requisição automática, a
entrega por QR atualiza estoque e ficha NR-6, e o técnico remoto só revisa exceções.

> **Estado atual: demonstração funcional, não pronto para piloto.** Roda inteiro em um
> aparelho, com dados fictícios e **detecção de EPI simulada**. Não use para liberar
> trabalhador de verdade. O que falta está em [Antes do piloto](#antes-do-piloto).

## Como rodar

```bash
npm install
```

```bash
npm run web
```

No celular, rode `npm start` e abra o QR com o Expo Go.

Entre pela tela de crachá com os **crachás de demonstração**. A equipe entra em
"Entrar como equipe" com o PIN `1234`. "Reiniciar demonstração" fica nessa mesma tela.

```bash
npm test
```

```bash
npm run test:schema
```

```bash
npm run typecheck
```

## Roteiro da demonstração

| Crachá | O que mostra |
| --- | --- |
| João | Falta o cinto → pedido automático → Lucia entrega → João refaz **só o cinto** → liberado |
| Maria | Primeiro uso: consentimento, depois tudo certo e liberada |
| Carlos | Foto incerta pede segunda foto; responda 👎 na luva para ver o item danificado |
| Pedro | IA em dúvida: fica pendente até Renata (técnica) decidir |
| Rafael | Empreiteira: o pedido vai para a Alfa Montagens e não baixa o estoque |
| Bruno | Já começa na fila com o prazo estourado; Marcos pode liberar presencialmente |
| Ana (Edifício Horizonte) | CA vencido na entrega: gera requisição preventiva |

Equipe: **Marcos** (encarregado), **Lucia** (almoxarife), **Renata** (técnica remota) e
**Paulo** (gestor). Na tela do Paulo: métricas, compras e limites da IA.

## O que está pronto

- **Trabalhador:** crachá, consentimento, foto guiada, resultado, checklist por áudio,
  "Pegue no almoxarifado", tela final e Meus EPIs.
- **Almoxarife:** fila de requisições, entrega por QR com conferência de CA, devolução
  do item antigo, assinatura eletrônica e estoque.
- **Técnico:** fila de exceções por risco, fichas NR-6 em PDF, matriz Função × Tarefa e
  verificação da trilha de auditoria.
- **Encarregado:** equipe do dia, troca de tarefa, liberação presencial, pedido de
  bloqueio, cadastro e crachá QR, pedidos da empreiteira.
- **Gestor:** métricas da seção 11, EPI acabando, aprovação de compras e limites da IA.

Regras do documento garantidas no domínio e cobertas por teste
([src/dominio/dominio.test.ts](src/dominio/dominio.test.ts)):

- "Presente" incerto nunca libera; "ausente" incerto pede segunda foto.
- Ninguém é bloqueado pela IA: o bloqueio exige o técnico.
- Quem está sem o EPI não tem liberação presencial, só quem está em dúvida da IA.
- Saldo é sempre a soma das movimentações, nunca um número gravado.
- CA inválido ou de outro tipo de EPI impede a entrega.
- Toda escrita entra na fila de sincronização e na trilha com hash encadeado.

## Onde difere do documento

| Documento | Aqui | Motivo |
| --- | --- | --- |
| Flutter | Expo / React Native | Mesma stack do projeto; o documento considera viável, com ressalva de desempenho em aparelho fraco |
| SQLite + PowerSync | AsyncStorage | Roda em web e nativo sem backend. Tem limite de tamanho: ver abaixo |
| YOLO, ML Kit, desfoque de rosto | [Detector simulado](src/ia/detector.ts) | Modelo depende de fotos reais do piloto |
| Disparo pela silhueta | Contagem de 4 s | Sem detector de pose |
| Áudio com voz humana | Voz do sistema (`expo-speech`) | Gravações ainda não existem |
| Login por SMS + PIN | Só PIN local | SMS depende do backend |
| Token de crachá assinado e rotativo | Token aleatório, trocável | Assinatura depende do servidor |
| OCR do CA | Digitar ou escolher o CA | Sem ML Kit |
| Base oficial de CAs | CAs fictícios | Falta importar a base pública |

Sem detector real, um trabalhador cadastrado no app nunca é liberado sozinho: toda
leitura dele cai em revisão humana. Só os crachás de demonstração têm roteiro próprio.

Fora do escopo, por serem de outras fases do documento: NF-e, ferramentas, inspeções,
Permissão de Trabalho, DDS, planilhas e Sienge. A entrada de estoque é manual até o
recebimento por NF-e existir.

## Antes do piloto

1. **Backend e sincronização.** [supabase/schema.sql](supabase/schema.sql) está pronto
   e testado num Postgres embutido, mas **não está ligado ao app**. Hoje nada sai do
   aparelho, a fila fica pendente e o selo permanece "Salvo no celular". Por isso o
   pedido do trabalhador só chega ao almoxarife se for **no mesmo aparelho**.
2. **Armazenamento.** O AsyncStorage tem limite (cerca de 6 MB no Android) e o estado
   é regravado inteiro a cada operação. A demonstração já ocupa cerca de 320 KB, quase
   tudo trilha de auditoria. O uso real exige SQLite/PowerSync. Se a gravação falhar, o
   selo mostra "Não salvou".
3. **Detector de EPI e desfoque de rosto.** O desfoque atual é só de exibição, na tela
   do técnico: a foto original continua sem desfoque no aparelho.
4. **Validações legais.** Termo de consentimento e assinatura eletrônica da ficha NR-6
   precisam de parecer jurídico, conforme a seção 10 do documento.
5. **Teste em Android real.** Câmera, leitura de QR, foto e impressão nunca rodaram em
   aparelho: o bundle Android compila, mas o app foi exercitado só no navegador, sem
   câmera.

## Estrutura

```
app/            telas (expo-router), uma pasta por perfil
src/dominio/    tipos, regras, operações e seed: TypeScript puro e testado
src/dados/      gravação no aparelho e fotos
src/ia/         ponto de encaixe do detector
src/ui/         tema, componentes e câmera
supabase/       schema com RLS e testes
```
