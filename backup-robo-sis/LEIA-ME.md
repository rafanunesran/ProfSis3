# Backup — versão "Robô" (com automações) do Assistente da SED

Este diretório guarda a versão **anterior** da extensão da Sala do Futuro (SED),
antes da conversão para o **modo Assistente (somente consulta)**.

A versão de backup aqui é o "Robô" original, que **automatizava**:
- Preencher Chamada (marcava faltas e salvava na SED);
- Preencher Registro (escrevia o conteúdo da aula e salvava na SED);
- Botão "Auto" por aula (workflow que navegava e preenchia sozinho);
- Extrair Alunos (raspava a lista e gravava no banco);
- Extrair Material Digital (raspava o catálogo e gravava no banco).

## Como voltar atrás (restaurar o Robô com automações)

Copie os arquivos deste diretório de volta para `extensao-profsis/` e recarregue a extensão:

```
cp backup-robo-sis/content_sed.js  extensao-profsis/content_sed.js
cp backup-robo-sis/manifest.json   extensao-profsis/manifest.json
cp backup-robo-sis/background.js   extensao-profsis/background.js
```

Arquivos salvos nesta pasta:
- `content_sed.js`  — versão com todas as automações da SED
- `manifest.json`   — nome/descrição/versão originais (v3.4.7)
- `background.js`   — service worker (inalterado, guardado por segurança)

Data do backup: gerado na conversão para o modo Assistente.
