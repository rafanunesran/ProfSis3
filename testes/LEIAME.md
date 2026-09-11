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
| `teste-ciclo.js` | O ciclo do arquivo `.profsis`: baixar, chegar num aparelho sem dados, restaurar — conferido no IndexedDB, não na memória. Aceita também o `.json` do formato antigo. |

As Regras do Firestore têm um teste próprio, fora daqui: `firestore.rules.teste.mjs`
na raiz, que roda no emulador e compara duas versões lado a lado.
