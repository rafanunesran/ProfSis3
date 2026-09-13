// ============================================================================
//  DESFAZER UMA IMPORTAÇÃO — tira do seu documento o que veio de um arquivo
// ----------------------------------------------------------------------------
//  Para quando um .profsis errado entrou por Mesclar. Ele abre o arquivo que foi
//  importado, encontra no seu `data` os registros que vieram dele e SÓ ESSES
//  remove — pelo conteúdo, não pelo id (ids colidem).
//
//  Mostra o que vai tirar e pede confirmação ANTES de gravar. O que era seu
//  desde antes não é tocado: um registro só sai se for idêntico a um do arquivo.
//
//  F12 > Console, no MESMO painel em que a importação foi feita.
// ============================================================================
(async () => {
  const P = (...a) => console.log(...a);
  if (typeof data === 'undefined' || !data) return console.error('Abra o sistema e entre na conta.');

  const arquivo = await new Promise(resolve => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = '.profsis,.json'; i.style.display = 'none';
    i.onchange = () => resolve(i.files && i.files[0]);
    document.body.appendChild(i); i.click();
    P('Escolha o arquivo .profsis que foi importado por engano...');
  });
  if (!arquivo) return console.error('Nenhum arquivo escolhido.');

  const pacote = JSON.parse(await arquivo.text());
  const veioDe = (pacote && pacote.formato === 'profsis') ? pacote.dados : pacote;
  P('Arquivo lido: ' + arquivo.name);

  // Assinatura pelo conteúdo inteiro: um registro só é "o mesmo" se for igual em
  // tudo. Assim nada que já era seu sai junto por coincidência de id.
  const assinar = (r) => JSON.stringify(r, Object.keys(r || {}).sort());
  const relatorio = {}, novo = {};
  let total = 0;

  Object.keys(data).forEach(chave => {
    const meus = data[chave];
    const deles = veioDe[chave];
    if (!Array.isArray(meus) || !Array.isArray(deles) || !deles.length) { novo[chave] = meus; return; }
    const fora = new Set(deles.map(assinar));
    const ficam = meus.filter(r => !fora.has(assinar(r)));
    const saem = meus.length - ficam.length;
    if (saem) { relatorio[chave] = saem; total += saem; }
    novo[chave] = ficam;
  });

  if (!total) return alert('Nada a desfazer: nenhum registro deste arquivo está nos seus dados.\n\n' +
                          'Se a importação foi por "Substituir" (e não "Mesclar"), este caminho não ' +
                          'serve — restaure a cópia anterior do seu documento pelo botão Importar.');

  const linhas = Object.keys(relatorio).sort((a, b) => relatorio[b] - relatorio[a])
                       .map(k => '  • ' + relatorio[k] + ' ' + k);
  const antes = Object.keys(relatorio).map(k => '  • ' + k + ': ' + data[k].length + ' → ' + novo[k].length);

  P('%cVAI REMOVER:', 'font-weight:bold;color:#c53030'); P(linhas.join('\n'));
  P('%cCOMO FICA:', 'font-weight:bold'); P(antes.join('\n'));

  if (!confirm('DESFAZER A IMPORTAÇÃO\n\nVão sair ' + total + ' registro(s) que vieram de "' +
               arquivo.name + '":\n\n' + linhas.join('\n') +
               '\n\nO que já era seu antes NÃO é tocado (a comparação é pelo conteúdo inteiro).\n\n' +
               'Continuar?')) return P('Cancelado. Nada foi alterado.');

  data = Object.assign({}, data, novo);
  window.dadosCarregados = true;
  await persistirDados();

  // Confere no aparelho antes de dizer que deu certo.
  try {
    const gravado = await localGet(getStorageKey(currentUser));
    const sobrou = Object.keys(relatorio).filter(k =>
      gravado && Array.isArray(gravado[k]) && gravado[k].length !== novo[k].length);
    if (sobrou.length) {
      return alert('A remoção NÃO foi confirmada no aparelho (' + sobrou.join(', ') + ').\n\n' +
                   'Nada foi perdido. Recarregue e tente de novo.');
    }
  } catch (e) {}

  alert('✅ Desfeito: ' + total + ' registro(s) removidos.\n\n' + linhas.join('\n') +
        '\n\nA página vai recarregar.');
  location.reload();
})();
