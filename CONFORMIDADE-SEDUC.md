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

## 4. Pendências que dependem de decisão/ação do responsável

Estas não são alterações de código; ficam registradas para acompanhamento.

1. **Dados já armazenados.** Listas de estudantes e o catálogo de "Material Digital"
   coletados antes desta adequação continuam no Firestore. Decidir, junto à direção da
   escola, o que fazer com esse acervo (manter sob a autorização a ser solicitada, ou
   expurgar).
2. **Extensão já instalada nos navegadores.** Sem o `update.xml` publicado, as cópias
   instaladas param de receber atualização, mas não se desinstalam sozinhas. Orientar os
   usuários a removê-la em `chrome://extensions` (o aviso já consta da documentação).
3. **Chave de assinatura da extensão.** O secret `EXTENSION_SIGNING_KEY_B64` pode ser
   apagado nas configurações do repositório.
4. **Máquinas onde o instalador rodou.** O instalador escrevia política em
   `HKCU\Software\Policies\Google\Chrome\ExtensionSettings`. Se ele foi executado em
   equipamento da escola, convém remover essa chave de registro.
5. **Histórico do Git.** Apagar os arquivos não os remove dos commits antigos. Reescrever
   o histórico é possível, mas invalida clones existentes — decisão em aberto.
6. **Solicitação de autorização.** Minuta pronta em
   `Docs/solicitacao-autorizacao-seduc.md`.

## 5. Solicitação de análise técnica

O comunicado determina que necessidade de integração, automação ou desenvolvimento de
ferramenta que demande acesso aos sistemas ou dados da SEDUC seja encaminhada
previamente para análise técnica. A minuta em `Docs/solicitacao-autorizacao-seduc.md`
descreve o sistema, os dados tratados e onde ficam armazenados, para envio à
COEGD/SEDUC.
