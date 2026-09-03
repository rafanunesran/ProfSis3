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

## 4-A. Adequação de setembro de 2026 — os dados do estudante saem da nuvem

Decisão do responsável, registrada em **3 de setembro de 2026**: em vez de aguardar a
resposta da COEGD sobre o armazenamento externo de nome e situação do estudante (seção
5), o sistema deixa de armazenar esse dado em ambiente externo. O ProfSis3 passa a ser
uma aplicação **local**: o dado pessoal do estudante fica no aparelho do profissional, e
a nuvem guarda apenas o que não identifica ninguém.

### Data de corte

**07/09/2026, às 7h.** Até lá o sistema funciona como antes e o professor é avisado duas
vezes por dia, podendo fazer a transição quando quiser. A partir da data, o envio de dado
pessoal é recusado — pelo aplicativo e, principalmente, pelas Regras do Firestore, que é
onde a decisão não depende do que roda no navegador do usuário.

### O que fica no aparelho e o que continua na nuvem

| Fica só no aparelho | Continua na nuvem |
|---|---|
| Nome e situação do estudante | Turmas e horários de aula |
| Ocorrências (relato e envolvidos) | Grade horária da escola |
| Frequência, atrasos, compensações | Agenda de compromissos |
| Notas e trabalhos | Registros de aula e planos de aula |
| Tutoria (encontros e agendamentos) | Avisos, bimestres, feriados |
| Anexos III (PAEE) e IV (PEI) | Biblioteca e currículo |
| Registros administrativos e busca ativa | Documentação |

A lista está em `shared.js` (`CAMPOS_PESSOAIS` e `CAMPOS_NUVEM`) e é repetida na Regra do
Firestore. **Campo desconhecido é tratado como pessoal**: um campo criado no futuro não
sobe por esquecimento — para publicá-lo é preciso escrevê-lo na lista de propósito.

### Fase 0 — correções que foram ao ar antes do corte

1. **Link público de relatório.** `shared_views` tem leitura liberada a qualquer
   visitante, sem login, e o documento publicava a lista de estudantes com nome completo.
   Passou a publicar apenas quantitativos por turma e por tipo de registro. A Regra recusa
   gravação que traga os campos antigos.
2. **Senha em texto claro.** `system/users_list` guardava a senha de cada usuário em
   texto claro, num documento legível por qualquer pessoa autenticada. O cadastro deixou
   de gravá-la; a credencial fica apenas no Firebase Auth.
3. **Senha do administrador no código.** `core.js` trazia a senha do super admin escrita
   no arquivo — e `core.js` é publicado no GitHub Pages, portanto a senha estava legível
   para qualquer pessoa, e era a mesma da conta no Firebase Auth. Havia ainda um caminho
   que criava a conta administrativa com a senha digitada, permitindo a um terceiro
   assumir o perfil. O bloco foi removido.

   *Providência necessária:* a senha esteve publicada e permanece no histórico do
   repositório, que é público. **Trocar a senha da conta no Firebase Auth.**
   - Data da troca: _______________
4. **Configurações do sistema.** `system/config_ia` e `system/config_sistema` passaram a
   ser escrita exclusiva do super admin.

### Fase 1 — a separação das camadas

- Armazenamento local em IndexedDB (`localdb.js`), substituindo o espelho em
  `localStorage`, cujo teto de ~5 MB já era estourado por escolas grandes.
- Guarda única na saída (`assertSemDadosPessoais`, em `core.js`): `saveData` é o único
  ponto de gravação do sistema, e nada de pessoal o atravessa depois do corte.
- Transição (`migracao.js`): leva o dado pessoal para o aparelho, regrava o documento da
  nuvem sem os campos pessoais, apaga a chamada compartilhada e os backups diários que
  estavam em texto claro, e obriga o download de um arquivo `.profsis` de segurança.
- Isenção controlada: o super admin pode marcar contas específicas para seguirem 100%
  online (campo `modoOnlineCompleto` em `access/{uid}`, gravável só por ele). Usada para
  contas de teste e suporte durante a transição.

### Fase 2 — backup cifrado e transição condicional

- **A transição só limpa a nuvem depois de confirmada a cópia local.** A ordem é: grava no
  aparelho, **relê e confere as contagens**, exige que o professor baixe o arquivo `.profsis`
  e marque que o guardou, e só então regrava o documento da nuvem sem os campos pessoais.
  Qualquer passo que falhe deixa a nuvem **intacta** — nunca ficamos com o dado apagado de
  um lado sem estar seguro do outro.
- **Backup diário volta a subir, cifrado** (`cripto.js`). Cada backup é cifrado com uma
  chave aleatória do professor (AES-GCM 256), comprimida antes com gzip e partida em
  quantos documentos forem necessários — o teto do Firestore é 1 MB por documento. Para o
  Firebase, para o Google e para quem invadir o banco, o backup é um bloco sem sentido.
- **A chave do professor é guardada embrulhada de duas formas**: uma que a **senha da conta
  dele** abre (derivada por PBKDF2-SHA256, 210 mil iterações), e outra que a **chave privada
  de suporte** abre. O professor nunca inventa nem digita uma "senha de backup": a chave é
  desembrulhada no login e fica no aparelho.
- **Chave de suporte.** O par é gerado no navegador do responsável; a pública vai para
  `system/config_sistema` e a privada é baixada como `.pem` uma única vez, ficando fora do
  repositório e fora do Firestore. Para socorrer um professor, o responsável importa o
  `.pem`, o **próprio navegador dele** decifra e baixa um arquivo — o conteúdo em claro
  nunca volta ao Firestore.

  *Registro honesto:* com essa segunda cópia, o backup é ponta-a-ponta contra o Firebase,
  contra o Google e contra invasão do banco, mas **não** contra o detentor da chave privada
  de suporte. É uma escolha deliberada, para que o responsável consiga prestar assistência.

### Sobre o acervo de quem não migrar

**Decisão: nada é apagado por varredura.** Quem nunca abrir a versão nova permanece com os
dados como estão. Quando abrir, a tela exige a transição para continuar, e a limpeza da
nuvem só ocorre depois de confirmado que a cópia local chegou. A consequência assumida é
que contas abandonadas seguem com dado pessoal armazenado — congelado, sem receber nada
novo, porque a Regra do Firestore recusa qualquer gravação de campo pessoal a partir do
corte.

### Consequências assumidas

- **A cópia de segurança passa a ser responsabilidade compartilhada.** O arquivo `.profsis`
  é a proteção que fica na mão do professor; o backup cifrado na nuvem é a rede que o
  responsável consegue puxar. A transição não termina sem que o professor gere o arquivo.
- **Recursos que dependiam de juntar dados de estudantes entre colegas param.** A chamada
  compartilhada entre professores deixa de existir; a visão nominal do gestor e o painel
  AEE compartilhado da escola voltam depois, cifrados com uma chave que só a escola tem.
- **Mapa de sala e painel AEE por horário continuam online** porque nunca guardaram nome:
  registram apenas identificadores, e o nome é resolvido no aparelho.

### Ainda em aberto

- Os prompts do Estagiário IA enviam nome do estudante e o texto do laudo para o Google
  Gemini / OpenRouter. É dado pessoal saindo do aparelho tanto quanto o Firestore, e será
  pseudonimizado.
- O Google Agenda recebe o título dos compromissos; se o título de uma tutoria trouxer o
  nome do estudante, o nome vai junto.
- As Regras do Firestore não conferem `schoolId`: um usuário liberado de uma escola
  alcança o documento de outra se souber o identificador. Deixou de expor estudantes com
  esta adequação, mas continua a corrigir.

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
