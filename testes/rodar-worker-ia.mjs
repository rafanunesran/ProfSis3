// Roda servidor-ia/cloudflare-worker.js no Node, como se fosse a Cloudflare, para o
// teste-servidor-ia.js (SERVIDOR_IA=worker). Lê a chave do app e as chaves do Gemini dos
// mesmos arquivos que o servidor.py, a cada pedido (o teste troca as chaves no meio).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../servidor-ia/cloudflare-worker.js';

const pasta = process.env.SISPROF_IA_PASTA;
const porta = Number(process.env.SISPROF_IA_PORTA || 7862);
http.createServer(async (req, res) => {
    const corpo = await new Promise(r => { const p = []; req.on('data', c => p.push(c)); req.on('end', () => r(Buffer.concat(p))); });
    const env = {
        CHAVE_APP: fs.readFileSync(path.join(pasta, 'chave.txt'), 'utf8'),
        GEMINI_KEYS: fs.readFileSync(path.join(pasta, 'chaves-gemini.txt'), 'utf8'),
        ORIGENS: process.env.SISPROF_IA_ORIGENS, GEMINI_URL: process.env.SISPROF_IA_GEMINI_URL
    };
    // Workers AI falsa: liga/desliga pelo arquivo sem-ai.txt (o teste cria para simular "não ligada").
    if (!fs.existsSync(path.join(pasta, 'sem-ai.txt'))) {
        env.AI = { run: async (modelo, entrada) => {
            fs.appendFileSync(path.join(pasta, 'ai.log'), JSON.stringify({ modelo, entrada }) + '\n');
            return { image: Buffer.from('jpeg-falso').toString('base64') };
        } };
    }
    const r = await worker.fetch(new Request('http://x' + req.url, {
        method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo
    }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
}).listen(porta, '127.0.0.1', () => console.log('worker de teste em ' + porta));
