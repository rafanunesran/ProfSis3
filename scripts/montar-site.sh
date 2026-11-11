#!/usr/bin/env bash
# Monta a pasta _site/ só com os arquivos do site.
# Usado por DOIS lugares, para os dois sites ficarem iguais:
#   - .github/workflows/deploy.yml (GitHub Pages)
#   - vercel.json (Vercel, "buildCommand")
# A lista e' EXPLICITA de proposito: subir o repositorio inteiro ja publicou, no passado,
# coisas que nunca deveriam estar no ar (codigo de robo/RPA sobre os sistemas da SEDUC, dump de
# tela da Sala do Futuro, planilhas internas). Ao adicionar um arquivo novo ao site, inclua-o aqui.
set -e
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site
cp .nojekyll _site/
cp index.html Agenda.html documentacao.html termos.html _site/
cp ref_agenda.html ref_auth.html ref_dashboard.html ref_turmas.html _site/
cp app.js admin.js core.js gestor.js biblioteca.js ia_estagiario.js _site/
cp shared.js feriados.js google-calendar.js sw.js _site/
cp localdb.js migracao.js cripto.js espacos.js terminais.js resgate.js _site/
cp listaescola.js assinatura.js financeiro.js icones.js ux.js _site/
cp ferramentas.js pdf_operacoes.js pdf_ferramentas.js _site/
cp ampliar_operacoes.js ampliar.js _site/
cp img_operacoes.js img.js _site/
cp poster_operacoes.js poster.js _site/
cp video_operacoes.js video.js _site/
cp montagem_operacoes.js montagem.js _site/
cp quiz_operacoes.js quiz.js jogar.html _site/
cp atelie_operacoes.js atelie.js _site/
cp tutoriais.js _site/
# A PASTA assinatura/ (webhook do Mercado Pago) NAO vai para o site:
# e' codigo de servidor, roda no Cloudflare Worker e nao tem o que fazer no navegador.
cp styles.css manifest.webmanifest _site/
cp -r resources Docs _site/
# O APK so existe quando o GitHub Actions conseguiu compila-lo (na Vercel nao existe).
if [ -d app-android/dist ]; then
  mkdir -p _site/app-android
  cp -r app-android/dist _site/app-android/dist
fi
echo "Conteudo publicado:"
find _site -maxdepth 2 -type f | sort
