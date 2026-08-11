import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import handler from '../api/generative-swap.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw54WQAAAABJRU5ErkJggg==';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function appServer() {
  return http.createServer((request, response) => {
    response.status = (code) => { response.statusCode = code; return response; };
    response.send = (body) => response.end(body);
    handler(request, response);
  });
}

test('backend generativo', async (context) => {
  await context.test('informa quando a chave não está configurada', async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const server = appServer(); const port = await listen(server);
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { available: false, model: 'gpt-image-2' });
    } finally { await close(server); if (previous) process.env.OPENAI_API_KEY = previous; }
  });

  await context.test('envia destino e origem ao modelo e devolve PNG', async () => {
    let receivedBody = '';
    const mock = http.createServer((request, response) => {
      request.setEncoding('latin1');
      request.on('data', (chunk) => { receivedBody += chunk; });
      request.on('end', () => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }));
      });
    });
    const mockPort = await listen(mock);
    const previousKey = process.env.OPENAI_API_KEY; const previousBase = process.env.OPENAI_BASE_URL;
    process.env.OPENAI_API_KEY = 'test-key'; process.env.OPENAI_BASE_URL = `http://127.0.0.1:${mockPort}/v1`;
    const app = appServer(); const appPort = await listen(app);
    try {
      const form = new FormData();
      form.append('target', new Blob(['target-image'], { type: 'image/png' }), 'target.png');
      form.append('source', new Blob(['source-image'], { type: 'image/jpeg' }), 'source.jpg');
      form.append('includeHair', 'true');
      const response = await fetch(`http://127.0.0.1:${appPort}`, { method: 'POST', body: form });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { image: PNG_BASE64, mimeType: 'image/png', model: 'gpt-image-2' });
      assert.match(receivedBody, /name="image\[\]"/);
      assert.match(receivedBody, /gpt-image-2/);
      assert.match(receivedBody, /TARGET photograph/);
    } finally {
      await close(app); await close(mock);
      if (previousKey) process.env.OPENAI_API_KEY = previousKey; else delete process.env.OPENAI_API_KEY;
      if (previousBase) process.env.OPENAI_BASE_URL = previousBase; else delete process.env.OPENAI_BASE_URL;
    }
  });
});
