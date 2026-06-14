import { Request, Response } from 'express';
import { SalaDoFuturoService } from '../services/SalaDoFuturoService';

export class AttendanceController {
    private rpaService: SalaDoFuturoService;

    constructor() {
        // Instancia o serviço seguindo princípios de Injeção de Dependências (simplificado aqui)
        this.rpaService = new SalaDoFuturoService();
    }

    /**
     * POST /api/attendance/sync
     * Recebe os alunos ausentes de uma turma e dispara a injeção via RPA
     */
    public sync = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { turmaID, data, horarioInicio, alunosFaltantes } = req.body;

            // 1. Validação de contrato rigorosa
            if (!turmaID || !data || !horarioInicio || !Array.isArray(alunosFaltantes)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Parâmetros inválidos. Certifique-se de enviar turmaID, data, horarioInicio e alunosFaltantes.' 
                });
            }

            console.log(`[API] Solicitação de sync recebida -> Turma: ${turmaID} | Faltas: ${alunosFaltantes.length}`);

            // 2. Aciona o Serviço de RPA
            const success = await this.rpaService.syncAttendance({
                turmaID,
                data,
                horarioInicio,
                alunosFaltantes
            });

            // 3. Resposta padronizada
            if (success) {
                return res.status(200).json({ success: true, message: 'Diário sincronizado com a Sala do Futuro.' });
            } else {
                return res.status(500).json({ success: false, error: 'O robô encontrou um problema ao injetar os dados.' });
            }
        } catch (error: any) {
            console.error('[API] Falha fatal no fluxo de sincronização:', error);
            return res.status(500).json({ success: false, error: 'Erro interno no servidor RPA.' });
        }
    }
}