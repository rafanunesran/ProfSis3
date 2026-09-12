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
| `teste-pessoal-nuvem.js` | A camada pessoal sobe cifrada (o nome do estudante não aparece nem no documento em claro nem no cifrado), volta em outro navegador só com a senha — sem arquivo — e a sessão que não leu a nuvem **não** grava por cima. |
| `teste-online.js` | O modo local cancelado: o ritual da transicao sumiu (migracao forcada, pop-up duas vezes por dia, vigilancia), o aviso novo e dispensavel e aparece uma vez so, a **ordem** de gravacao preserva o documento em claro quando a copia cifrada falha, e backup antigo em texto claro e **cifrado, nao apagado**. |
| `teste-terminais.js` | Limite de telas: padrão 1, a segunda pede confirmação, assumir derruba a vaga da primeira, limite 2 e ilimitado (0), vaga parada há 31 dias volta sozinha, e banco fora do ar **não** tranca ninguém. |
| `teste-corte-regra.js` | Quando o aplicativo e a Regra discordam sobre o corte, quem manda é a Regra: o cliente deixa de mandar dado pessoal que seria recusado; a conta isenta (`modoOnlineCompleto`) continua podendo; e a recusa do banco passa a dizer documento, campos e estado. |
| `teste-isento-online.js` | A conta marcada como **100% online** pelo super admin: a isenção é relida depois do login (na abertura da página ainda não há sessão no Auth), a conta não recebe pedido de transição, o que ela salva continua indo inteiro para a nuvem, banco fora do ar não a rebaixa, retirar a isenção funciona, e o aparelho que já tinha migrado antes da isenção não abre com a lista de estudantes vazia. |
| `teste-perda-local.js` | A camada do APARELHO ganha a mesma proteção que a nuvem sempre teve: leitura local que volta vazia onde havia registro bloqueia a gravação (em vez de salvar o vazio por cima da única cópia), a tarja diz o que faltou e que nada foi apagado, o backup recusa gravar tela vazia sobre um slot bom, e apagar tudo de propósito continua possível. Reproduz a perda: no código anterior, 120 chamadas / 40 notas / 12 ocorrências viravam 0. |
| `teste-recuperar-backups.js` | Achar o backup quando o painel diz "nenhum backup encontrado": a varredura forçada **enumera** os históricos do banco em vez de adivinhar o ID (acha o gravado sob um uid antigo), olha os documentos vivos, nunca chama uma continuação órfã de conteúdo recuperável, diz que está cega quando as Regras não permitem `list`, e o backup diário parado por falta de chave vira faixa na tela em vez de aviso de console. |
| `teste-guarda.js` | A guarda de conformidade (`assertSemDadosPessoais`) e a divisão das camadas (`dividirDados`/`juntarDados`), inclusive a regra "campo desconhecido é pessoal". Não abre navegador para o site: roda as funções direto. |
| `teste-importar.js` | O botão **Importar** existe para professor, AEE, gestor, no modal de perfil e na faixa de falha de leitura; importar sem conta aberta explica em vez de gravar no vazio; arquivo só com tutorados é aceito; e uma gravação que não persiste avisa **sem** recarregar. |
| `teste-sem-sessao.js` | Estar no sistema sem sessão no Firebase Auth: a faixa aparece na abertura do painel, a gravação recusada fala de **sessão** e não manda conferir as Regras, e sem rede o aviso não aparece (seria inútil). |
| `teste-primeira-abertura.js` | O dia da publicação, numa conta que **nunca converteu**: o documento na nuvem ainda tem estudante, nota e chamada em texto claro e o aparelho não tem nada. O carregamento **adota** esse pessoal em vez de descartá-lo (sem isso o professor abre e vê turmas sem estudantes, e o primeiro salvamento apaga a única cópia); o primeiro salvamento converte — cifra primeiro, limpa o claro depois; outro aparelho recupera tudo só com a senha; e **sem** a chave nada é apagado e o trabalho fica no aparelho. |
| `teste-resgate.js` | A Central de Resgate e a sobrevivência do trabalho quando a gravação é recusada. Acha a cópia do aparelho e o slot que sobreviveu **sem** o índice; avisa do slot cifrado sem chave; mescla sem perder o que foi lançado hoje; refaz o índice. Listar a coleção alcança o documento de um uid antigo que nenhuma adivinhação de chave alcança, e de documento alheio guarda só a contagem. E os dois caminhos de recusa — a Regra do banco e a guarda do próprio app — deixam o trabalho **no aparelho**, anotado para reenvio, em vez de evaporar. |
| `teste-ciclo.js` | O ciclo do arquivo `.profsis`: baixar, chegar num aparelho sem dados, restaurar — conferido no IndexedDB, não na memória. Aceita também o `.json` do formato antigo. |

As Regras do Firestore têm um teste próprio, fora daqui: `firestore.rules.teste.mjs`
na raiz, que roda no emulador e compara duas versões lado a lado.
