const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Permite que o Front-End no navegador converse com o servidor

// Banco de dados temporário em memória para salvar os cookies roubados da sessão do professor.
// Em um ambiente de produção real, o ideal é salvar isso no Firestore vinculado à ID do professor.
const sessionsDb = {};

app.post('/api/sync-chamada', async (req, res) => {
    const { professorId, dataChamada, turmaId, alunos, registroAula } = req.body;

    const cookies = sessionsDb[professorId];

    // Se não temos a sessão salva, avisa o Front-End que precisamos do login do Gov.br
    if (!cookies) {
        return res.json({ success: false, needsLogin: true });
    }

    let browser;
    try {
        console.log(`🤖 Iniciando robô para sincronização do Professor ${professorId}...`);
        
        // Inicia o navegador invisível
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        
        // Injeta os cookies salvos da sessão do gov.br / SED, logando automaticamente
        await context.addCookies(cookies);

        const page = await context.newPage();
        
        // 1. Acessar a Secretaria Escolar Digital (SED) / Sala do Futuro
        await page.goto('https://sed.educacao.sp.gov.br/');

        // Segurança: Se redirecionar para a página de login, os cookies expiraram
        if (page.url().includes('login')) {
            delete sessionsDb[professorId];
            await browser.close();
            return res.json({ success: false, needsLogin: true });
        }

        // --- LÓGICA DE NAVEGAÇÃO DO ROBÔ ---
        /* IMPORTANTE: Os seletores HTML abaixo (#, ., text=) variam de sistema para sistema.
           Será necessário inspecionar a página real da SED do Estado para mapear os cliques reais.
           O código abaixo é a estrutura teórica que você irá adaptar. */
        
        /* EXEMPLO DE MAPA DE CLIQUES:
        // Abre o menu do diário e vai pra chamada
        await page.click('text="Diário de Classe"');
        await page.click('text="Chamada"');
        
        // Seleciona as configurações do filtro de chamada
        await page.selectOption('select#filtroTurma', String(turmaId));
        await page.fill('input#filtroData', dataChamada);
        await page.click('button#btnBuscarFiltro');
        
        // Aguarda a lista de alunos carregar
        await page.waitForSelector('table.lista-alunos', { timeout: 10000 });

        // Itera sobre a lista de alunos vinda do ProfSis3
        for (const aluno of alunos) {
            // Encontra a linha de presença daquele aluno na tabela do Estado
            const checkboxId = `input[name="presenca_${aluno.id_estudante}"]`; 
            
            if (aluno.presente) {
                await page.check(checkboxId);
            } else {
                await page.uncheck(checkboxId);
            }
        }

        // Salva a chamada no Estado
        await page.click('button#btnFinalizarChamada');
        await page.waitForSelector('.mensagem-de-sucesso', { timeout: 10000 });
        
        // --- Registro de Aula ---
        if (registroAula && registroAula.trim() !== '') {
            // await page.click('text="Registro de Aula"');
            // await page.fill('textarea#conteudoAula', registroAula);
            // await page.click('button#btnSalvarRegistroAula');
            // await page.waitForSelector('.mensagem-de-sucesso', { timeout: 10000 });
        }
        */

        await browser.close();
        res.json({ success: true });

    } catch (error) {
        console.error("❌ Erro na automação RPA:", error);
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota que cria uma interface para o professor logar e nós "sequestrarmos" a sessão
app.get('/api/login-govbr', (req, res) => {
    const { profId } = req.query;
    
    res.send(`
        <html lang="pt-BR">
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h2>Renovação de Acesso SED / Gov.br</h2>
                <p>Nesta página o professor faria o login real na plataforma do Estado. Assim que ele passasse pelo CAPTCHA, nós salvaríamos os cookies e fecharíamos a aba.</p>
                
                <button style="padding: 10px 20px; font-size: 16px; background: #3182ce; color: white; border: none; border-radius: 5px; cursor: pointer;" onclick="simularCapturaCookies()">Simular Login no Estado e Salvar Sessão</button>
                
                <script>
                    function simularCapturaCookies() {
                        fetch('/api/save-cookies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profId: '${profId}', cookies: [{ name: 'JSESSIONID_SED', value: 'token-ficticio-12345', domain: 'sed.educacao.sp.gov.br', path: '/' }] }) }).then(() => {
                            alert('Acesso concedido e cookies gravados! Você pode fechar esta aba e clicar novamente em Sincronizar na janela principal.');
                        });
                    }
                </script>
            </body>
        </html>
    `);
});

app.post('/api/save-cookies', (req, res) => {
    const { profId, cookies } = req.body;
    sessionsDb[profId] = cookies; // Grava os cookies
    res.json({ success: true });
});

// Nova Rota RPA: Buscar Turmas do Estado (Mapeamento)
app.post('/api/fetch-turmas-estado', async (req, res) => {
    const { professorId } = req.body;
    const cookies = sessionsDb[professorId];

    if (!cookies) {
        return res.status(401).json({ success: false, needsLogin: true, error: 'Sessão não encontrada.' });
    }

    let browser;
    try {
        console.log(`🤖 Buscando turmas do Estado para o Professor ${professorId}...`);
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        await context.addCookies(cookies);
        
        const page = await context.newPage();
        await page.goto('https://sed.educacao.sp.gov.br/');
        
        if (page.url().includes('login')) {
            delete sessionsDb[professorId];
            await browser.close();
            return res.status(401).json({ success: false, needsLogin: true });
        }

        // --- CÓDIGO DA NAVEGAÇÃO DA SED ---
        /* IMPORTANTE: Descomente e ajuste os IDs reais da página do governo abaixo */
        /*
        await page.click('text="Diário de Classe"');
        await page.click('text="Chamada"');
        const selectTurmaSelector = 'select#filtroTurma';
        await page.waitForSelector(selectTurmaSelector, { timeout: 15000 });
        
        const turmasEstado = await page.$$eval(`${selectTurmaSelector} option`, (options) => {
            return options.filter(opt => opt.value && opt.value.trim() !== '').map(opt => ({ id_sala_do_futuro: opt.value.trim(), nome_sala_do_futuro: opt.textContent ? opt.textContent.trim() : '' }));
        });
        */
        
        // Mock temporário para testes até adaptar o layout da SED:
        const turmasEstado = [{ id_sala_do_futuro: '101', nome_sala_do_futuro: '1º Ano A (Estado)' }, { id_sala_do_futuro: '102', nome_sala_do_futuro: '2º Ano B (Estado)' }];

        await browser.close();
        return res.json({ success: true, turmas: turmasEstado });
    } catch (error) {
        console.error("❌ Erro na extração RPA:", error);
        if (browser) await browser.close();
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(\`🤖 Servidor RPA rodando em http://localhost:\${PORT}\`);
    console.log('Lembre-se de verificar o mapeamento dos seletores do site da Secretaria Escolar.');
});