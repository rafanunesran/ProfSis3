import puppeteer, { Browser } from 'puppeteer';

export interface SyncAttendanceParams {
    turmaID: string;
    data: string;
    horarioInicio: string;
    alunosFaltantes: string[];
}

export class SalaDoFuturoService {
    private readonly browserURL = 'http://127.0.0.1:9222';

    /**
     * Sincroniza a chamada de uma turma específica interagindo com a interface da SEDUC
     */
    public async syncAttendance(params: SyncAttendanceParams): Promise<boolean> {
        console.log(`[RPA] Iniciando sincronização: Turma ${params.turmaID}, Data ${params.data}, Horário ${params.horarioInicio}`);
        let browser: Browser | null = null;

        try {
            console.log('[RPA] Conectando ao Chrome em execução via Porta 9222...');
            browser = await puppeteer.connect({ browserURL: this.browserURL });

            const pages = await browser.pages();
            // Procura a aba correta
            const page = pages.find(p => p.url().includes('diario-classe'));

            if (!page) {
                throw new Error('Aba "diario-classe" não encontrada. Verifique se a página da turma está aberta no Chrome.');
            }

            console.log('[RPA] Aba localizada. Aguardando o carregamento da lista de alunos no DOM...');
            
            // Prevenção de Race Conditions: Aguarda até a tabela principal existir
            await page.waitForSelector('.grid-listagem', { timeout: 15000 });
            console.log('[RPA] Lista carregada. Aplicando faltas...');

            // A lógica de injeção precisa que a tipagem do payload seja simples, 
            // por isso repassamos `params` inteiramente.
            const faltasAplicadas = await page.evaluate((dados) => {
                
                // Função utilitária de sanitização para casar strings de forma resiliente
                const normalize = (str: string) => {
                    if (!str) return '';
                    return str.normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "") // Remove acentuações
                              .replace(/\s+/g, ' ')            // Remove espaços múltiplos
                              .trim()
                              .toUpperCase();
                };

                const alunosAlvo = dados.alunosFaltantes.map(normalize);
                const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"]');
                let interagidos = 0;

                cardsAlunos.forEach((card) => {
                    const nomeElement = card.querySelector('.nome_aluno');
                    if (!nomeElement) return;

                    const nomeAlunoNormalizado = normalize(nomeElement.textContent || '');
                    if (!nomeAlunoNormalizado) return;

                    const checkbox = card.querySelector(`input[type="checkbox"][hrinicio="${dados.horarioInicio}"]`) as HTMLInputElement | null;
                    if (!checkbox) return; // Aluno dispensado ou sem o horário específico

                    const levouFalta = alunosAlvo.includes(nomeAlunoNormalizado);

                    // Lógica para marcar como ausente (falta = checked) e retirar caso não tenha faltado (reversão de erro)
                    if (levouFalta && !checkbox.checked) {
                        checkbox.click();
                        interagidos++;
                    } else if (!levouFalta && checkbox.checked) {
                        checkbox.click(); 
                    }
                });

                return interagidos;
            }, params);

            console.log(`[RPA] Sucesso! Foram marcadas/verificadas faltas para ${faltasAplicadas} estudantes faltosos.`);
            
            // Descomente abaixo se a automação for quem salva definitivamente no sistema do governo
            // await page.click('.conteudo-btns .btn-primary');
            // console.log('[RPA] Chamada salva no portal.');

            return true;
        } catch (error: any) {
            console.error(`[RPA] Erro crítico durante sincronização da turma ${params.turmaID}:`, error.message);
            return false;
        } finally {
            // IMPORTANTE: Liberar conexão sem fechar a janela do Chrome (browser.disconnect != browser.close)
            if (browser) browser.disconnect();
        }
    }
}