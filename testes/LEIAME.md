# Testes de navegador

Rodam o site de verdade num Chromium, com o Firebase substituído por um banco em
memória. Não tocam no Firestore real e não vão ao ar: o passo "Montar _site" do
`.github/workflows/deploy.yml` copia uma lista explícita de arquivos, e esta pasta
não está nela.

## Como rodar

```bash
npm i playwright            # uma vez, onde for rodar
python3 -m http.server 8877 --bind 127.0.0.1 &   # servidor estático na raiz do projeto
node testes/teste-espacos.js
```

Variáveis opcionais: `PROFSIS_URL` (padrão `http://localhost:8877`) e
`PROFSIS_CHROMIUM` (caminho do navegador). Cada teste sai com código 0 quando passa.

## O que cada um cobre

| Arquivo | Cobre |
|---|---|
| `teste-espacos.js` | Cadastro por código de convite: código errado não deixa conta órfã no Auth; quem cria o espaço vira gestor e o código **não** é gravado no banco; código digitado torto (minúsculo, com espaços) funciona; conta antiga sem espaço segue na mesma chave de documento; perfil pendente de antes continua na fila. |
| `teste-migra-espacos.js` | Migração das escolas antigas: um espaço por escola, `legacySchoolId` preservado, usuários vinculados, pendentes **não** liberados de carona, arquivo de códigos baixado, e rodar de novo não duplica. |
| `teste-espacos-falha.js` | Os três desfechos de falha: banco recusando a escrita (não marca nada, não baixa nada), painel sem sessão no Firebase Auth (mensagem certa), e estado envenenado por tentativa anterior se recuperando sozinho. |
| `teste-corte-regra.js` | Quando o aplicativo e a Regra discordam sobre o corte, quem manda é a Regra: o cliente deixa de mandar dado pessoal que seria recusado; a conta isenta (`modoOnlineCompleto`) continua podendo; e a recusa do banco passa a dizer documento, campos e estado. |
| `teste-isento-online.js` | A conta marcada como **100% online** pelo super admin: a isenção é relida depois do login (na abertura da página ainda não há sessão no Auth), a conta não recebe pedido de transição, o que ela salva continua indo inteiro para a nuvem, banco fora do ar não a rebaixa, retirar a isenção funciona, e o aparelho que já tinha migrado antes da isenção não abre com a lista de estudantes vazia. |
| `teste-perda-local.js` | A camada do APARELHO ganha a mesma proteção que a nuvem sempre teve: leitura local que volta vazia onde havia registro bloqueia a gravação (em vez de salvar o vazio por cima da única cópia), a tarja diz o que faltou e que nada foi apagado, o backup recusa gravar tela vazia sobre um slot bom, e apagar tudo de propósito continua possível. Reproduz a perda: no código anterior, 120 chamadas / 40 notas / 12 ocorrências viravam 0. |
| `teste-backup-transicao.js` | O histórico de backup na travessia do corte: a transição apaga os backups em texto claro **e** as continuações que ficavam para trás, recomeça o histórico cifrado na hora, e quando a chave não está no aparelho o professor é **avisado** em vez de ficar sem backup em silêncio. Cobre também a varredura forçada do super admin: acha os documentos vivos, nomeia a transição como causa quando há rastro, e nunca chama uma continuação órfã de conteúdo recuperável, **enumera** os históricos do banco em vez de adivinhar o ID (é assim que aparece o backup gravado sob um uid antigo), e diz que está cega quando as Regras não permitem `list`. |
| `teste-guarda.js` | A guarda de conformidade (`assertSemDadosPessoais`) e a divisão das camadas (`dividirDados`/`juntarDados`), inclusive a regra "campo desconhecido é pessoal". Não abre navegador para o site: roda as funções direto. |
| `teste-importar.js` | O botão **Importar** existe para professor, AEE, gestor, no modal de perfil e na faixa de falha de leitura; importar sem conta aberta explica em vez de gravar no vazio; arquivo só com tutorados é aceito; e uma gravação que não persiste avisa **sem** recarregar. |
| `teste-sem-sessao.js` | Estar no sistema sem sessão no Firebase Auth: a faixa aparece na abertura do painel, a gravação recusada fala de **sessão** e não manda conferir as Regras, e sem rede o aviso não aparece (seria inútil). |
| `teste-ciclo.js` | O ciclo do arquivo `.profsis`: baixar, chegar num aparelho sem dados, restaurar — conferido no IndexedDB, não na memória. Aceita também o `.json` do formato antigo. |

As Regras do Firestore têm um teste próprio, fora daqui: `firestore.rules.teste.mjs`
na raiz, que roda no emulador e compara duas versões lado a lado.
