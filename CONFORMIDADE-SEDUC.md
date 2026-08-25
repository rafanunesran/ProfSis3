# Conformidade com o Comunicado de Segurança Digital da SEDUC

**Data desta adequação:** 24 de agosto de 2026
**Referência:** Comunicado Oficial "Segurança Digital e Proteção dos Sistemas da SEDUC" —
Coordenadoria Geral de Estratégia e Governança Digital (COEGD/SEDUC) e FDE.

Este documento registra o que o ProfSis3 fazia, o que foi removido e como o sistema
está desenhado hoje. Serve de referência para o próprio projeto e como evidência caso
haja apuração.

## 1. Situação atual

O ProfSis3 é um sistema **independente** de apoio ao trabalho do profissional da
educação (agenda, planos de aula, registro auxiliar de frequência, tutoria, Anexos III
e IV, relatórios). Ele **não possui**:

- extensão de navegador, script, robô, automação ou integração que acesse, consulte,
  colete, extraia, altere, transmita ou interaja de qualquer forma com a Secretaria
  Escolar Digital (SED), a Sala do Futuro ou qualquer outro ambiente tecnológico da
  SEDUC;
- qualquer campo, rotina ou serviço que receba, armazene ou utilize credenciais
  institucionais (usuário, senha, token, cookie de sessão) dos sistemas do Estado;
- qualquer rotina de consulta automatizada ou extração massiva sobre sistemas do
  Estado.

Todo lançamento oficial (frequência, registro de aulas, notas) é feito manualmente
pelo profissional, no ambiente oficial da Secretaria.

## 2. O que foi removido (e por quê)

| Removido | O que fazia | Item vedado no comunicado |
|---|---|---|
| `server.js`, `backend-rpa/` | Servidor com Playwright: `POST /api/login-rpa` fazia login na SED com usuário e senha do professor, guardava os cookies da sessão e os reinjetava para preencher chamada e listar turmas | Uso de credenciais institucionais em aplicação externa; armazenamento de tokens/chaves; robô de acesso; contornar autenticação |
| `SalaDoFuturoService.ts`, `AttendanceController.ts` | RPA com Puppeteer conectado ao Chrome pela porta de depuração, marcando faltas no diário de classe | Robô de acesso e alteração de dados |
| `backup-robo-sis/` | Versão "Robô" da extensão: preencher Chamada e Registro, botão "Auto", Extrair Alunos e Extrair Material Digital — mais o LEIA-ME que ensinava a restaurá-la | Automação de preenchimento e extração |
| `extensao-profs` | Content script antigo com automações e login direto no banco | Extração automatizada |
| `sala_do_futuro_reference.txt` | Dump do HTML interno de tela da Sala do Futuro, publicado no site | Cópia de dados/ativos da SEDUC para ambiente externo |
| `extensao-profsis/` | Extensão do Chrome (já em modo somente leitura) injetada nas páginas da Sala do Futuro, com `host_permissions` em `*.educacao.sp.gov.br`, mais o instalador que forçava a instalação via política do Chrome | Aplicação de terceiro acessando sistemas da SEDUC sem autorização formal |
| WebView da SED no app Android | O app abria a Sala do Futuro e injetava um bundle JS em cada página, com atualização automática desse "robô" | Aplicação de terceiro acessando sistemas da SEDUC |
| Ponte de dados em `app.js` / `core.js` | Listeners que recebiam alunos e catálogo de Material Digital raspados da SED e gravavam no banco; envio da agenda do dia para a extensão; difusão do refresh token do Firebase por `postMessage` para a extensão ler | Integração não homologada; transmissão de dados para ambiente externo |

O deploy também deixou de publicar o repositório inteiro no GitHub Pages: agora um
passo do workflow copia uma lista explícita de arquivos do site
(`.github/workflows/deploy.yml`). Antes disso, todo o código acima era publicamente
baixável.

## 3. O que foi preservado

- **Importação em massa de estudantes (perfil gestor)** — `gestor.js`. É ação manual:
  o profissional exporta o arquivo pela própria SED, com suas credenciais, no ambiente
  oficial, e depois envia esse arquivo ao ProfSis3. A leitura descarta RA, dígito do RA,
  data de nascimento e os e-mails institucionais; só nome do estudante e situação são
  aproveitados. É o ponto que depende de autorização formal (ver seção 5).
- **App Android** — passou a ser apenas o próprio ProfSis3 em WebView, sem qualquer
  contato com domínios da Secretaria.
- **Timbre oficial nos documentos gerados** — os modelos de Anexo III/IV e plano de aula
  (`Docs/`) usam o timbre da Secretaria da Educação, como os formulários oficiais que o
  profissional preenche.

## 4. Decisões tomadas

Decisões do responsável pelo sistema, registradas em **25 de agosto de 2026**.

1. **Dados já armazenados — MANTIDOS.** As listas de estudantes e o catálogo de
   "Material Digital" coletados antes desta adequação permanecem no Firestore. O acervo se
   limita a **nome e situação do estudante**: RA, dígito do RA, data de nascimento e
   e-mails institucionais nunca foram gravados no banco. É exatamente esse ponto que se
   submete à análise da COEGD (seção 5); caso a Secretaria determine outro tratamento, o
   acervo será ajustado ou expurgado conforme a orientação recebida.
2. **Extensão já instalada nos navegadores — CONCLUÍDO.** As cópias instaladas foram
   removidas. O `update.xml` deixou de ser publicado, então nenhuma cópia remanescente
   recebe atualização, e a documentação orienta a remoção em `chrome://extensions`.
3. **Chave de assinatura da extensão — CONCLUÍDO.** O secret `EXTENSION_SIGNING_KEY_B64`
   foi apagado das configurações do repositório.
4. **Máquinas onde o instalador rodou — CONCLUÍDO.** A política escrita em
   `HKCU\Software\Policies\Google\Chrome\ExtensionSettings` foi removida dos
   equipamentos.
5. **Histórico do Git — REESCRITO.** O código de robô/RPA foi expurgado de todos os
   commits do repositório, e não apenas dos arquivos atuais.

   *Ressalva registrada de boa-fé:* o repositório é público e possui pull requests
   mesclados. A reescrita do histórico remove o conteúdo de clones, do `git log` e da
   navegação normal, mas **não apaga os objetos antigos do servidor do GitHub**: eles
   permanecem alcançáveis por SHA através das referências `refs/pull/N/head`, que são
   permanentes e não podem ser removidas pelo proprietário. Para eliminar esses objetos
   órfãos é necessário solicitar ao suporte do GitHub a coleta de lixo do repositório —
   **chamado ainda a abrir**. Até lá, um link direto para um commit antigo ainda pode
   alcançar o código removido.

   - Data de abertura do chamado: _______________
   - Número do chamado / resposta: _______________

6. **Solicitação de autorização à COEGD/SEDUC — PENDENTE DE ENVIO.** A minuta está pronta
   em `Docs/solicitacao-autorizacao-seduc.md` e **ainda não foi protocolada**. Ao enviar,
   anotar aqui:

   - Data do envio: _______________
   - Canal utilizado: _______________
   - Protocolo / confirmação de recebimento: _______________
   - Resposta recebida: _______________

## 5. Solicitação de análise técnica (pendente de envio)

O comunicado determina que necessidade de integração, automação ou desenvolvimento de
ferramenta que demande acesso aos sistemas ou dados da SEDUC seja encaminhada
previamente para análise técnica.

Como o sistema **não possui mais nenhuma integração** com os ambientes da Secretaria
(seções 1 e 2), a solicitação trata do único ponto remanescente: o **armazenamento, em
ambiente externo, do nome e da situação de estudantes**, obtidos de arquivo que o próprio
profissional exporta da SED, no ambiente oficial, com suas credenciais.

A minuta em `Docs/solicitacao-autorizacao-seduc.md` descreve o sistema, os dados tratados
e onde ficam armazenados. **Ela ainda não foi enviada** — ver item 6 da seção 4, onde a
data e o protocolo devem ser anotados no momento do envio.
