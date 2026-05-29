// rpa.controller.ts
import { chromium, TimeoutError, Browser } from 'playwright';
import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

export interface SalaDoFuturoTurma {
  id_sala_do_futuro: string;
  nome_sala_do_futuro: string;
}

// Simulando o armazenamento das sessões ativas do Gov.br
const sessionsDb: Record<string, any[]> = {};

app.post('/api/fetch-turmas-estado', async (req: Request, res: Response) => {
  const { professorId } = req.body;
  const cookies = sessionsDb[professorId];

  if (!cookies) {
    return res.status(401).json({ 
      success: false, 
      needsLogin: true, 
      error: 'Sessão não encontrada. Necessário re-autenticar no portal do Estado.' 
    });
  }

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addCookies(cookies);
    
    const page = await context.newPage();
    
    // Acessa o portal e confere se a sessão expirou redirecionando pro login
    await page.goto('https://sed.educacao.sp.gov.br/');
    if (page.url().includes('login')) {
       delete sessionsDb[professorId];
       return res.status(401).json({ success: false, needsLogin: true, error: 'Sessão expirada.' });
    }

    // Navega para a página onde o <select> de turmas se encontra
    await page.click('text="Diário de Classe"');
    await page.click('text="Chamada"');

    // Mapeamento do seletor da Sala do Futuro
    const selectTurmaSelector = 'select#filtroTurma';
    
    // Aguarda o select estar disponível na tela (timeout default 15s)
    await page.waitForSelector(selectTurmaSelector, { timeout: 15000 });

    // Extrai o 'value' e o 'text' visível de cada option
    const turmasEstado: SalaDoFuturoTurma[] = await page.$$eval(`${selectTurmaSelector} option`, (options) => {
      return options
        .filter(opt => (opt as HTMLOptionElement).value && (opt as HTMLOptionElement).value.trim() !== '')
        .map(opt => ({
          id_sala_do_futuro: (opt as HTMLOptionElement).value.trim(),
          nome_sala_do_futuro: opt.textContent?.trim() || ''
        }));
    });

    await browser.close();
    return res.json({ success: true, turmas: turmasEstado });

  } catch (error) {
    if (browser) await browser.close();
    
    // Tratamento específico de erro de carregamento (mudança de layout ou lentidão do portal)
    if (error instanceof TimeoutError) {
      return res.status(504).json({ success: false, error: 'Tempo limite excedido ao aguardar as turmas carregarem no portal do Estado.' });
    }
    
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro interno durante a raspagem de dados.' 
    });
  }
});
// MapeamentoTurmas.tsx
import React, { useState } from 'react';

export interface SalaDoFuturoTurma {
  id_sala_do_futuro: string;
  nome_sala_do_futuro: string;
}

export interface TurmaLocal {
  id: string;
  nome: string;
}

export interface Mapeamento {
  id_local: string;
  id_sala_do_futuro: string;
  nome_sala_do_futuro: string;
}

interface MapeamentoTurmasProps {
  professorId: string;
  turmasLocais: TurmaLocal[];
  onSalvarMapeamento: (mapeamentos: Mapeamento[]) => Promise<void>;
}

export const MapeamentoTurmas: React.FC<MapeamentoTurmasProps> = ({ professorId, turmasLocais, onSalvarMapeamento }) => {
  const [turmasEstado, setTurmasEstado] = useState<SalaDoFuturoTurma[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mapeamentos, setMapeamentos] = useState<Record<string, SalaDoFuturoTurma>>({});

  const buscarTurmasDoEstado = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/fetch-turmas-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professorId })
      });
      const data = await response.json();
      
      if (data.success) {
        setTurmasEstado(data.turmas);
      } else if (data.needsLogin) {
        alert('Sua sessão expirou. Você precisa re-autenticar o robô.');
      } else {
        alert(`Erro ao buscar turmas: ${data.error}`);
      }
    } catch (error) {
      alert('Falha de conexão com o backend de automação (RPA).');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectChange = (idLocal: string, externalId: string) => {
    const selectedExterna = turmasEstado.find(t => t.id_sala_do_futuro === externalId);
    
    setMapeamentos(prev => {
      const newMap = { ...prev };
      if (selectedExterna) {
        newMap[idLocal] = selectedExterna;
      } else {
        delete newMap[idLocal];
      }
      return newMap;
    });
  };

  const handleSalvar = async () => {
    const payload: Mapeamento[] = Object.entries(mapeamentos).map(
      ([id_local, externa]) => ({
        id_local,
        id_sala_do_futuro: externa.id_sala_do_futuro,
        nome_sala_do_futuro: externa.nome_sala_do_futuro
      })
    );

    if (payload.length === 0) return alert('Por favor, defina ao menos um mapeamento.');

    setIsSaving(true);
    try {
      await onSalvarMapeamento(payload);
      alert('✅ Mapeamento de turmas consolidado com sucesso!');
    } catch (error) {
      console.error(error);
      alert('❌ Erro ao salvar o mapeamento na nuvem.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mapeamento-container">
      <h2>Mapeamento de Turmas: ProfSis3 ↔ Sala do Futuro</h2>
      <button 
        onClick={buscarTurmasDoEstado} 
        disabled={isLoading} 
        className="btn btn-primary"
      >
        {isLoading ? '⏳ O Robô está buscando... (Aguarde)' : '🔍 Buscar Turmas do Estado (RPA)'}
      </button>

      {turmasEstado.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Sua Turma no ProfSis3</th>
                <th>Vincular Turma Externa (Portal SED)</th>
              </tr>
            </thead>
            <tbody>
              {turmasLocais.map(turma => (
                <tr key={turma.id}>
                  <td>{turma.nome}</td>
                  <td>
                    <select 
                      value={mapeamentos[turma.id]?.id_sala_do_futuro || ""}
                      onChange={e => handleSelectChange(turma.id, e.target.value)}
                    >
                      <option value="">-- Ignorar ou Não Vinculada --</option>
                      {turmasEstado.map(tExt => (
                        <option key={tExt.id_sala_do_futuro} value={tExt.id_sala_do_futuro}>
                          {tExt.nome_sala_do_futuro}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <button 
            onClick={handleSalvar} 
            disabled={isSaving || Object.keys(mapeamentos).length === 0} 
            className="btn btn-success"
            style={{ marginTop: '15px' }}
          >
            {isSaving ? 'Salvando Vínculos...' : '💾 Salvar Mapeamento'}
          </button>
        </div>
      )}
    </div>
  );
};
// firebaseSyncService.ts
import * as admin from 'firebase-admin';

// Presume que o admin já está inicializado no escopo principal do NodeJS.
const db = admin.database();

export interface Mapeamento {
  id_local: string;
  id_sala_do_futuro: string;
  nome_sala_do_futuro: string;
}

/**
 * Persiste o mapeamento de Turmas via atualização atômica (Multipath).
 * 
 * @param escolaId O ID da escola atual
 * @param mapeamentos O array gerado pelo front-end com as turmas vinculadas
 */
export async function salvarIntegracaoSalaFuturo(escolaId: string, mapeamentos: Mapeamento[]): Promise<void> {
  if (!mapeamentos || mapeamentos.length === 0) {
    throw new Error("Lista de mapeamentos está vazia e não pode ser salva.");
  }

  try {
    const updates: Record<string, any> = {};

    mapeamentos.forEach(map => {
      // Define a rota do update no Realtime Database dinamicamente
      const path = `/escolas/${escolaId}/turmas/${map.id_local}/integracao_estado`;
      
      updates[path] = {
        sincronizado: true,
        id_sala_do_futuro: map.id_sala_do_futuro,
        nome_sala_do_futuro: map.nome_sala_do_futuro,
        atualizado_em: admin.database.ServerValue.TIMESTAMP
      };
    });

    // Realiza todas as substituições no Firebase ao mesmo tempo (comportamento atômico)
    await db.ref().update(updates);
    
    console.log(`✅ [Firebase RTDB] Foram vinculadas ${mapeamentos.length} turmas com sucesso.`);
  } catch (error) {
    console.error("❌ Erro ao persistir integração de turmas no Firebase:", error);
    throw new Error("Transação atômica falhou. Os mapeamentos não foram salvos.");
  }
}
