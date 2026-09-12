# Perda de dados: descobrir a causa antes de tentar recuperar

> **Comece aqui, não pelos caminhos de recuperação.** Há duas causas possíveis e elas
> pedem ações opostas. Tentar recuperar sem saber qual é gasta o tempo de quem está
> sem os dados — e, na causa A, a perda continua acontecendo enquanto se procura.

## Passo zero: rode o diagnóstico

`ferramentas/diagnostico-console.js` é um arquivo para colar no Console do navegador
(F12), no site, com a conta aberta. Ele **não altera nada seu**: lê, conta e baixa um
relatório `.json`. A única escrita é numa sonda descartável, apagada em seguida — é ela
que prova se o banco está recusando as gravações.

O veredito dele diz qual dos dois cenários é o seu.

**Se ele disser que não há nada, não acredite antes de rodar o raio-X.** O diagnóstico
conta uma lista de campos escrita à mão, e uma lista dessas sempre fica para trás: ela
não cobria os campos de nota do gestor (`notasAvaliacoesGestor`, `notasBimestraisOficiais`,
`lotesMapaoGestor`) e por isso respondia "não achei notas" sobre uma conta que as tinha.
`ferramentas/raio-x-console.js` não decide nada por conta própria: mostra **todas** as
chaves de **todos** os documentos, em todas as origens, numa tabela; **decifra** o que
estiver cifrado se a chave estiver no aparelho; diz onde cada campo está mais completo;
e baixa um `.profsis` por origem, para você ter tudo em disco antes de mexer em nada.

## Causa A — as Regras recusam e o trabalho nunca chega a ser gravado

**Sintoma:** sumiu *tudo* junto — agenda, notas, registros de aula, chamadas — e some
de novo a cada dia de trabalho. No diagnóstico, a sonda responde
`comCampoPessoal: "RECUSADO: permission-denied"` e `semCampoPessoal: "ACEITOU"`.

**O que está acontecendo:** as Regras do Firestore com o corte (`depoisDoCorte()`,
válido desde 07/09/2026 10:00 UTC) foram publicadas no projeto, mas o site publicado
ainda é a versão que grava o documento **inteiro** de uma vez, em texto claro. A Regra
recusa qualquer documento que tenha `notas`, `presencas`, `estudantes` ou `ocorrencias`
— e, como tudo mora no mesmo documento, a agenda e os registros de aula caem junto na
mesma recusa. O professor vê um alerta, continua trabalhando e fecha a página: o dia
inteiro foi recusado pelo banco e não existe em lugar nenhum.

Nenhuma das duas partes está errada sozinha. Juntas, apagam o dia.

**O que NÃO adianta:** procurar backup. Desde 07/09 o backup diário também é recusado
(ele grava `data` inteiro em texto claro e não é `cifrado`), então não há backup novo
para achar.

**O que resolve, e é uma escolha de quem responde pelo sistema:**

1. **Publicar a versão que cifra** (esta branch: `cripto.js` + `core.js` + `index.html`).
   A camada pessoal sobe cifrada, a Regra aceita, e a adequação continua de pé. É o
   caminho recomendado — resolve sem afrouxar nada.
2. **Suspender o corte nas Regras temporariamente**, publicando no Console do Firebase a
   regra de `app_data` sem a condição `depoisDoCorte()`. Destrava na hora, mas volta a
   permitir dado pessoal em texto claro no banco — exatamente o que o Comunicado da
   SEDUC não quer. Se for esse o caminho, que seja com hora para acabar.

**O que dá para salvar do que já se perdeu:** o que foi recusado nunca chegou ao banco.
Sobra o que estiver (a) numa aba ainda aberta — o diagnóstico avisa e ensina a salvar
antes de fechar; (b) no `localStorage` do navegador, de antes de 07/09; (c) no próprio
Firestore, até a data em que as gravações começaram a ser recusadas. O diagnóstico
mostra as três coisas e até que dia cada uma vai.

**A correção para não repetir** já está nesta branch: `saveData()` grava o espelho do
aparelho **antes** de falar com a nuvem e antes da guarda de conformidade. Recusa do
banco passou a significar "não subiu", nunca mais "sumiu": o trabalho fica no aparelho,
a recusa fica anotada, e o botão *Reenviar o que foi recusado* sobe tudo quando a causa
for corrigida.

## Causa B — a transição cancelada apagou os backups

Vale para quem chegou a rodar a versão do modo local e clicou em "Fazer a transição
agora". Se o site publicado nunca teve `migracao.js`, **não é o seu caso** — vá para a
causa A.

### O que exatamente foi apagado, e quando

Quem clicou em **"Fazer a transição agora"** rodava `migrarParaLocal()` (versão
anterior de `migracao.js`). Depois de gravar a cópia no aparelho, conferir que ela
chegou inteira e exigir o download do arquivo `.profsis`, a função fazia, nesta ordem:

| Passo | O que fez | Volta? |
|---|---|---|
| 4 | `saveData('app_data', chave, nuvem)` — regravou o documento **só** com turmas/agenda. Os campos pessoais sumiram do documento. | Só por PITR (caminho 5) |
| 5 | `localStorage.removeItem(chave)` — apagou o espelho antigo do navegador. | Sim, a cópia boa está no IndexedDB (caminho 1) |
| 6 | Apagou `shared_attendance/school_<id>_*` (chamada compartilhada). | Só por PITR |
| 7 | `_apagarBackupsEmClaro()` — apagou `backup_index_<uid>` **e** os 20 `backup_<uid>_slot_N`. | Em parte: ver caminho 3 |

Duas coisas importam para a recuperação:

- **A transição nunca rodou sozinha.** O botão de concluir só habilitava depois de o
  download do `.profsis` começar. Quem perdeu dados **tem** o arquivo na pasta de
  Downloads — e tem a cópia inteira no aparelho onde migrou (passos 1 e 2 da função
  gravavam e *conferiam* no IndexedDB antes de qualquer apagamento).
- **O passo 7 engolia as falhas** (`catch (e) { /* segue */ }`). Slot que a Regra do
  Firestore recusou apagar continua no banco até hoje — invisível, porque o índice que
  o listava foi apagado no mesmo laço, e `listarBackupsNuvem()` só olha o índice.

### Os cinco caminhos, do mais provável para o último recurso

### 1. Este aparelho (resolve a maioria)

Abra o sistema **no mesmo computador/navegador em que a transição foi feita** e vá em
**Perfil → Backup e Segurança → 🛟 Central de Resgate → Procurar em tudo**.

A busca lê o IndexedDB inteiro, não só a chave de agora — conta antiga, perfil de
gestor, chave de escola. Em **Mesclar**, nada do trabalho de hoje é apagado: só entra o
que falta. Há também **Baixar**, que salva o achado num `.profsis` sem tocar em nada,
para quem quer guardar antes de decidir.

> Se o professor migrou no computador da escola e hoje usa o de casa, é no da escola
> que a cópia está. Isso não é opcional: o IndexedDB não viaja entre aparelhos.

### 2. O arquivo `.profsis` baixado

Está na pasta de Downloads, com nome `copia-de-seguranca-profsis-<nome>-<data>.profsis`
(contas mais antigas: `profsis-<nome>-<data>.profsis`). Entre na conta e use
**Importar dados do arquivo** — ou o botão dentro da própria Central de Resgate. O
mesmo botão aceita o `.json` do formato antigo.

### 3. Os slots que sobreviveram na nuvem

É o que a Central de Resgate procura de 1 a 20, **um por um, ignorando o índice**.
Quando acha algum que o histórico não lista, ela avisa e oferece **Refazer o índice**:
a partir daí o botão **☁️ Histórico na Nuvem** de sempre volta a mostrá-los.

Se o aviso disser que o backup está **cifrado e a chave não está neste aparelho**: saia,
entre de novo com **e-mail e senha** (não pelo login automático — a chave é derivada da
senha) e repita a busca.

### 4. A camada pessoal cifrada (`pessoal_<chave>`)

Só existe para quem usou o sistema **depois** do commit `495004e` (Fase 7). A Central
de Resgate lê e decifra sozinha, com a mesma exigência de senha do caminho 3.

### 5. PITR do Firestore — o único caminho para o que foi apagado de verdade

Documento apagado ou sobrescrito no Firestore não volta pelo aplicativo. Só o
*point-in-time recovery* do projeto traz — e **apenas se o PITR já estava ligado antes
da perda**, porque ele não é retroativo. A janela é de **7 dias e anda sozinha**: cada
dia que passa leva junto um dia do que dá para recuperar.

Há dois arquivos prontos em `ferramentas/`, feitos para rodar no **Cloud Shell** do
Google (console.cloud.google.com, ícone de terminal no topo — o `gcloud` já vem logado,
não precisa instalar nada):

**1. `recuperar-pitr.sh`** — diz se há o que recuperar, exporta o retrato do banco no
instante que você escolher e importa num banco **separado**. A produção não é tocada.

```bash
# só para ver se o PITR está ligado e até quando dá para voltar:
PROJETO=seu-projeto bash recuperar-pitr.sh

# depois, com o instante anterior à perda (minuto cheio, UTC; SP = UTC-3):
PROJETO=seu-projeto INSTANTE=2026-09-06T12:00:00Z bash recuperar-pitr.sh
```

Se ele disser que o PITR está desligado, ele mesmo mostra como procurar **backups
agendados**, que são outro mecanismo e podem existir mesmo sem PITR.

**2. `extrair-profsis.js`** — lê o banco recuperado e grava **um `.profsis` por
professor**, juntando o documento principal com todos os backups diários dele (o backup
de três dias antes costuma ter a nota que sumiu depois; juntando por `id`, nada se perde
na escolha).

```bash
npm install firebase-admin
PROJETO=seu-projeto BANCO=recuperado node extrair-profsis.js
# arquivos em ./recuperados/ ; baixe com:  cloudshell download recuperados/NOME.profsis
```

Cada arquivo entra pelo botão **Importar dados do arquivo** (substitui) ou pela
**Central de Resgate → Mesclar** (junta, sem apagar nada do que já existe).

O que esses arquivos **não** trazem são os documentos `pessoal_*`: são cifrados com a
senha do professor, e nem o suporte abre. Esses voltam sozinhos quando a pessoa entra
no sistema com e-mail e senha, no próprio aparelho dela.

## Para isto não se repetir

1. **Ligue o PITR** (7 dias de rede de proteção, e ele não é retroativo — ligar depois
   do acidente não recupera nada):
   ```bash
   gcloud firestore databases update --database='(default)' --enable-pitr
   gcloud firestore backups schedules create --database='(default)' \
       --recurrence=daily --retention=7d
   ```
2. **Apagar em silêncio nunca mais.** Foi o `catch` vazio do passo 7 que deixou o banco
   num estado que ninguém sabia descrever: metade dos slots foi, metade ficou, e o
   índice — a única coisa que os listava — foi a primeira a morrer. `converterBackupsEmClaro()`,
   que substituiu aquela função, **cifra por cima e não apaga nada**.
