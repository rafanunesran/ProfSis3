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
| `teste-guarda.js` | A guarda de conformidade (`assertSemDadosPessoais`) e a divisão das camadas (`dividirDados`/`juntarDados`), inclusive a regra "campo desconhecido é pessoal". Não abre navegador para o site: roda as funções direto. |
| `teste-importar.js` | O botão **Importar** existe para professor, AEE, gestor, no modal de perfil e na faixa de falha de leitura; importar sem conta aberta explica em vez de gravar no vazio; arquivo só com tutorados é aceito; e uma gravação que não persiste avisa **sem** recarregar. |
| `teste-sem-sessao.js` | Estar no sistema sem sessão no Firebase Auth: a faixa aparece na abertura do painel, a gravação recusada fala de **sessão** e não manda conferir as Regras, e sem rede o aviso não aparece (seria inútil). |
| `teste-ciclo.js` | O ciclo do arquivo `.profsis`: baixar, chegar num aparelho sem dados, restaurar — conferido no IndexedDB, não na memória. Aceita também o `.json` do formato antigo. |

As Regras do Firestore têm um teste próprio, fora daqui: `firestore.rules.teste.mjs`
na raiz, que roda no emulador e compara duas versões lado a lado.
