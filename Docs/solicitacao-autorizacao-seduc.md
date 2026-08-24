# Minuta — Solicitação de análise técnica e autorização (COEGD/SEDUC)

> **Como usar:** substitua os campos entre colchetes, revise o conteúdo e envie pelo canal
> oficial (protocolo da unidade escolar / Diretoria de Ensino, ou o e-mail institucional
> indicado pela COEGD). Guarde o número de protocolo ou a confirmação de recebimento junto
> com o `CONFORMIDADE-SEDUC.md`. Enquanto não houver autorização formal, mantenha o sistema
> como está hoje: sem qualquer integração com os ambientes da Secretaria.
>
> Se preferir enviar como ofício em papel timbrado da unidade, o corpo do texto abaixo pode
> ser aproveitado integralmente.

---

**Assunto:** Solicitação de análise técnica e autorização de uso — sistema de apoio pedagógico
ProfSis3

**À** Coordenadoria Geral de Estratégia e Governança Digital — COEGD/SEDUC
**Equipe de Segurança da Informação — COEGD/SEDUC e FDE**

**De:** [nome completo], [cargo/função], RG [nº]
**Unidade:** [nome da escola] — [código CIE], [Diretoria de Ensino]
**Contato:** [e-mail institucional] — [telefone]
**Data:** [dd/mm/aaaa]

---

## 1. Objeto

Em atendimento ao Comunicado Oficial "Segurança Digital e Proteção dos Sistemas da SEDUC",
que determina o encaminhamento prévio, para análise técnica, de necessidade de integração,
automação ou desenvolvimento de ferramenta que demande acesso aos sistemas ou dados da
Secretaria, venho submeter à apreciação dessa Coordenadoria o sistema de apoio pedagógico
descrito a seguir, solicitando a competente análise e, se for o caso, a autorização de uso.

## 2. Descrição do sistema

O **ProfSis3** é um sistema próprio, de uso interno, desenvolvido para apoiar a organização
do trabalho pedagógico do profissional da educação. Suas funcionalidades são:

- agenda e grade de horários;
- planos de aula e registro auxiliar do conteúdo trabalhado;
- registro auxiliar de frequência (de apoio, sem validade oficial);
- acompanhamento de tutoria;
- elaboração dos Anexos III e IV (PAEE) e demais documentos pedagógicos;
- relatórios de apoio ao acompanhamento da turma.

O sistema é acessado por navegador (e por um aplicativo Android que apenas abre o mesmo
sistema) e está hospedado em [informar: GitHub Pages, com banco de dados Firestore — Google
Cloud, região [informar]].

## 3. Ausência de integração com os sistemas da SEDUC

Declaro, para os devidos fins, que o ProfSis3 **não possui**:

- extensão de navegador, script, robô, automação, integração ou qualquer outro mecanismo
  que acesse, consulte, colete, extraia, altere, transmita ou interaja com a Secretaria
  Escolar Digital, a Sala do Futuro ou demais ambientes tecnológicos da SEDUC;
- campo, rotina ou serviço que solicite, armazene ou utilize credenciais institucionais
  (usuário, senha, token ou cookie de sessão) dos sistemas do Estado;
- rotina de consulta automatizada ou de extração massiva de informações.

Todo lançamento oficial — frequência, registro de aulas, notas e demais registros
acadêmicos — é feito manualmente pelo próprio profissional, no ambiente oficial da
Secretaria, com suas credenciais pessoais.

Informo ainda que versões anteriores da ferramenta contavam com uma extensão de navegador e
rotinas de automação sobre a Sala do Futuro. **Essas funcionalidades foram integralmente
descontinuadas e removidas** em [dd/mm/aaaa], tão logo tomei conhecimento do comunicado, e o
código correspondente foi retirado do repositório e da publicação. Os usuários foram
orientados a remover a extensão de seus navegadores.

## 4. Dados tratados

O ponto que submeto expressamente à análise dessa Coordenadoria é o seguinte:

| Dado | Origem | Observação |
|---|---|---|
| Nome do estudante | Arquivo exportado pelo próprio profissional, na SED, no ambiente oficial, e depois carregado manualmente no sistema | Necessário para identificar o estudante nos registros de apoio |
| Situação do estudante (ativo, transferido, remanejado) | Mesmo arquivo | Mantém a lista da turma coerente |
| Registros produzidos pelo próprio profissional | Digitados no sistema | Frequência auxiliar, anotações pedagógicas, planos de aula, tutoria |

**Não são armazenados** RA, dígito do RA, data de nascimento nem e-mails institucionais dos
estudantes: esses campos são descartados na leitura do arquivo e não chegam ao banco de
dados.

O acesso é restrito aos profissionais da unidade, mediante autenticação individual. O
tratamento observa a Lei nº 13.709/2018 (LGPD) e se limita à finalidade pedagógica.

## 5. Pedido

Ante o exposto, solicito:

1. a **análise técnica** do sistema descrito, nos termos do comunicado;
2. orientação quanto à **adequação do tratamento dos dados** indicados no item 4,
   especialmente quanto ao armazenamento do nome e da situação do estudante em ambiente
   externo aos sistemas da Secretaria;
3. se for o caso, a **autorização formal** para a continuidade do uso, com as condições e
   controles que essa Coordenadoria julgar necessários;
4. orientação sobre o **destino dos dados já armazenados**, caso a autorização não seja
   concedida.

Coloco-me à disposição para prestar esclarecimentos, apresentar o sistema, fornecer
documentação técnica ou promover os ajustes que forem determinados.

Respeitosamente,

**[nome completo]**
[cargo/função] — [nome da escola]
[e-mail institucional] — [telefone]
