#!/usr/bin/env python3
"""Servidor de IA de texto do EdiProf (passa os pedidos do app para o Gemini).

Fica numa máquina sua (ex.: Oracle Cloud grátis), atrás do Caddy (HTTPS). O app manda o
pedido para cá; este programa chama o Gemini com as chaves guardadas SÓ nesta máquina
(arquivo chaves-gemini.txt) e devolve apenas o texto da resposta. Assim:
  - a rede da escola só precisa deixar passar o endereço desta máquina;
  - as chaves do Gemini nunca vão para o navegador.

Só usa a biblioteca padrão do Python 3 (nada para instalar). Ver LEIAME.md.

Rotas:
  GET  /saude       -> {"ok": true, "chaves": N}   (sem chave; serve de teste de alcance)
  POST /v1/gerar    -> corpo {"prompt": "...", "modelos": ["gemini-..."], "temperatura": 0.7,
                              "imagens": [{"mime": "image/jpeg", "dados": "<base64>"}] (opcional, até 4)}
                       cabeçalho Authorization: Bearer <chave do app>
                       resposta {"texto": "...", "modelo": "..."} ou
                       {"erro": "...", "detalhes": [{"chave": "…abcd", "modelo": "...", "erro": "..."}]}
"""
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PASTA = os.environ.get('SISPROF_IA_PASTA', '/opt/sisprof-ia')
ARQ_CHAVES = os.path.join(PASTA, 'chaves-gemini.txt')
ARQ_CHAVE_APP = os.path.join(PASTA, 'chave.txt')
PORTA = int(os.environ.get('SISPROF_IA_PORTA', '7862'))
ORIGENS = [o.strip().rstrip('/') for o in os.environ.get(
    'SISPROF_IA_ORIGENS', 'https://ediprof.vercel.app,https://rafanunesran.github.io').split(',') if o.strip()]
GEMINI_URL = os.environ.get('SISPROF_IA_GEMINI_URL', 'https://generativelanguage.googleapis.com')
MODELOS_PADRAO = ['gemini-3.6-flash', 'gemini-2.5-flash']
LIMITE_CORPO = 8 * 1024 * 1024
MIME_IMAGEM_OK = re.compile(r'^image/(jpeg|png|webp|heic|heif)$')        # prompts grandes (Anexo IV com fichas do AEE) cabem folgado
LIMITE_POR_CHAMADA_S = float(os.environ.get('SISPROF_IA_LIMITE_CHAMADA', '40'))
LIMITE_TOTAL_S = float(os.environ.get('SISPROF_IA_LIMITE_TOTAL', '80'))  # o app espera 90 s
MAX_SIMULTANEOS = int(os.environ.get('SISPROF_IA_SIMULTANEOS', '6'))
MODELO_OK = re.compile(r'^[A-Za-z0-9._-]{1,80}$')

_vagas = threading.BoundedSemaphore(MAX_SIMULTANEOS)
_cache = {'mtime': None, 'chaves': []}
_cache_lock = threading.Lock()


def ler_chaves():
    """Lê chaves-gemini.txt (uma por linha; # comenta). Relê só se o arquivo mudou."""
    try:
        mt = os.path.getmtime(ARQ_CHAVES)
    except OSError:
        return []
    with _cache_lock:
        if _cache['mtime'] != mt:
            with open(ARQ_CHAVES, encoding='utf-8') as f:
                linhas = [l.split('#', 1)[0].strip() for l in f]
            _cache['chaves'] = [l for l in linhas if l]
            _cache['mtime'] = mt
        return list(_cache['chaves'])


def ler_chave_app():
    try:
        with open(ARQ_CHAVE_APP, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return ''


def fim_da_chave(k):
    return '…' + k[-4:] if len(k) > 4 else '…'


def chamar_gemini(chave, modelo, prompt, temperatura, limite_s, imagens=None):
    partes_pedido = [{'text': prompt}] + [{'inline_data': {'mime_type': i['mime'], 'data': i['dados']}} for i in (imagens or [])]
    corpo = json.dumps({
        'contents': [{'parts': partes_pedido}],
        'generationConfig': {'temperature': temperatura, 'response_mime_type': 'application/json'},
        # Mesmos limiares do app: documentos sobre deficiência/apoio a estudantes são legítimos.
        'safetySettings': [
            {'category': c, 'threshold': 'BLOCK_NONE'} for c in (
                'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
                'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT')
        ],
    }).encode('utf-8')
    url = f'{GEMINI_URL}/v1beta/models/{modelo}:generateContent'
    req = urllib.request.Request(url, data=corpo, method='POST', headers={
        'Content-Type': 'application/json', 'x-goog-api-key': chave})
    try:
        with urllib.request.urlopen(req, timeout=limite_s) as r:
            dados = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        msg = e.reason
        try:
            j = json.loads(e.read().decode('utf-8'))
            msg = (j.get('error') or {}).get('message') or msg
        except Exception:
            pass
        raise RuntimeError(f'Gemini {e.code}: {msg}')
    except (TimeoutError, OSError) as e:
        if 'timed out' in str(e):
            raise RuntimeError(f'o Gemini não respondeu em {int(limite_s)} s')
        raise RuntimeError(f'esta máquina não conectou no Gemini ({e})')
    cands = dados.get('candidates') or []
    if not cands or not cands[0].get('content'):
        motivo = (dados.get('promptFeedback') or {}).get('blockReason') or (cands[0].get('finishReason') if cands else '')
        if motivo:
            raise RuntimeError(f'o Gemini bloqueou a resposta pelo filtro de segurança (motivo: {motivo})')
        raise RuntimeError('a IA não devolveu conteúdo')
    partes = cands[0]['content'].get('parts') or []
    texto = ''.join(p.get('text', '') for p in partes)
    if not texto:
        raise RuntimeError('a IA não devolveu conteúdo')
    return texto


def substituto(msg):
    m = re.search(r'use\s+models/([A-Za-z0-9._-]+)', msg or '', re.I)
    return m.group(1) if m else None


def gerar(prompt, modelos, temperatura, imagens=None):
    chaves = ler_chaves()
    if not chaves:
        return 503, {'erro': 'O servidor não tem nenhuma chave do Gemini. Ponha as chaves em '
                              f'{ARQ_CHAVES} (uma por linha).'}
    inicio = time.monotonic()
    detalhes = []
    fila = list(modelos)
    tentados = set()
    while fila:
        modelo = fila.pop(0)
        if modelo in tentados:
            continue
        tentados.add(modelo)
        for chave in chaves:
            resta = LIMITE_TOTAL_S - (time.monotonic() - inicio)
            if resta < 3:
                detalhes.append({'chave': '', 'modelo': modelo, 'erro': f'tempo total esgotado ({int(LIMITE_TOTAL_S)} s)'})
                return 502, {'erro': 'Nenhuma chave respondeu a tempo.', 'detalhes': detalhes}
            try:
                texto = chamar_gemini(chave, modelo, prompt, temperatura, min(LIMITE_POR_CHAMADA_S, resta), imagens)
                resp = {'texto': texto, 'modelo': modelo}
                if imagens:
                    resp['leuImagens'] = len(imagens)
                return 200, resp
            except RuntimeError as e:
                msg = str(e)
                detalhes.append({'chave': fim_da_chave(chave), 'modelo': modelo, 'erro': msg})
                novo = substituto(msg)
                if novo and novo not in tentados and MODELO_OK.match(novo):
                    fila.insert(0, novo)   # modelo aposentado: o próprio Google diz qual usar
                    break
    return 502, {'erro': 'Todas as chaves do servidor falharam.', 'detalhes': detalhes}


class Tratador(BaseHTTPRequestHandler):
    server_version = 'EdiProfIA/1'

    def log_message(self, fmt, *args):  # sem conteúdo do pedido no log (só rota e código)
        sys.stderr.write('%s %s\n' % (self.log_date_time_string(), fmt % args))

    def _origem(self):
        o = (self.headers.get('Origin') or '').rstrip('/')
        return o if o in ORIGENS else ''

    def _responder(self, codigo, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(codigo)
        o = self._origem()
        if o:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corpo)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(corpo)

    def do_OPTIONS(self):
        self.send_response(204)
        o = self._origem()
        if o:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.send_header('Access-Control-Max-Age', '86400')
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/saude':
            return self._responder(200, {'ok': True, 'servico': 'EdiProf IA', 'chaves': len(ler_chaves())})
        self._responder(404, {'erro': 'não encontrado'})

    def do_POST(self):
        if self.path.split('?')[0] != '/v1/gerar':
            return self._responder(404, {'erro': 'não encontrado'})
        # Pedido de outro site (navegador manda Origin): recusa. Sem Origin (curl) passa, mas
        # ainda precisa da chave.
        if self.headers.get('Origin') and not self._origem():
            return self._responder(403, {'erro': 'site não autorizado'})
        chave_app = ler_chave_app()
        if not chave_app or self.headers.get('Authorization', '') != 'Bearer ' + chave_app:
            return self._responder(401, {'erro': 'chave errada'})
        try:
            tam = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            tam = 0
        if tam <= 0 or tam > LIMITE_CORPO:
            return self._responder(413, {'erro': 'pedido vazio ou grande demais'})
        try:
            pedido = json.loads(self.rfile.read(tam).decode('utf-8'))
        except Exception:
            return self._responder(400, {'erro': 'pedido inválido'})
        prompt = pedido.get('prompt') if isinstance(pedido, dict) else None
        if not isinstance(prompt, str) or not prompt.strip():
            return self._responder(400, {'erro': 'faltou o prompt'})
        modelos = [m for m in (pedido.get('modelos') or []) if isinstance(m, str) and MODELO_OK.match(m)][:4] or MODELOS_PADRAO
        try:
            temperatura = max(0.0, min(2.0, float(pedido.get('temperatura', 0.7))))
        except (TypeError, ValueError):
            temperatura = 0.7
        imagens = pedido.get('imagens') or []
        if (not isinstance(imagens, list) or len(imagens) > 4 or any(
                not isinstance(i, dict) or not isinstance(i.get('dados'), str) or not i.get('dados')
                or not MIME_IMAGEM_OK.match(str(i.get('mime') or '')) for i in imagens)):
            return self._responder(400, {'erro': 'imagens inválidas (até 4, jpeg/png/webp)'})
        if not _vagas.acquire(timeout=20):
            return self._responder(503, {'erro': 'servidor ocupado, tente de novo em instantes'})
        try:
            codigo, resp = gerar(prompt, modelos, temperatura, [{'mime': i['mime'], 'dados': i['dados']} for i in imagens])
        finally:
            _vagas.release()
        self._responder(codigo, resp)


def main():
    srv = ThreadingHTTPServer(('127.0.0.1', PORTA), Tratador)
    srv.daemon_threads = True
    print(f'EdiProf IA ouvindo em 127.0.0.1:{PORTA} (origens: {", ".join(ORIGENS)})', flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()
