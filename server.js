import http from 'node:http';
import { createServer as createViteServer } from 'vite';
import generativeSwap from './api/generative-swap.js';

const port = Number(process.env.PORT || 5173);
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });

const server = http.createServer(async (request, response) => {
  response.status = (code) => { response.statusCode = code; return response; };
  response.send = (body) => response.end(body);
  if (request.url?.split('?')[0] === '/api/generative-swap') return generativeSwap(request, response);
  return vite.middlewares(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`FaceUp Browser disponível em http://localhost:${port}`);
  console.log(process.env.OPENAI_API_KEY ? 'Modo generativo habilitado.' : 'Modo generativo desabilitado: configure OPENAI_API_KEY.');
});
