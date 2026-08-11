# FaceUp Browser

Aplicativo web para troca de rosto e cabelo com dois modos de processamento:

- **Generativo:** usa o `gpt-image-2` em um backend protegido para transferir rosto e penteado completos, preservando corpo, roupa, pose e cenário da foto de destino.
- **Local e privado:** usa MediaPipe Tasks Vision e Canvas 2D no navegador, sem enviar as imagens, com troca facial e harmonização da cor do cabelo.

## Recursos

- detecção facial e segmentação multiclasses de cabelo;
- transferência generativa com duas imagens de referência;
- alternativa local automática quando o backend não estiver configurado;
- validação de JPG, PNG e WebP, com limite de 25 MB por imagem;
- limite básico de requisições, timeout e mensagens de erro seguras;
- comparação entre original e resultado;
- exportação em PNG;
- interface responsiva e acessível;
- lint, testes e build automatizáveis.

## Executar localmente

Requer Node.js 20.19+ ou 22.12+.

```bash
npm install
cp .env.example .env
```

Preencha `OPENAI_API_KEY` no arquivo `.env` e execute:

```bash
npm run dev
```

Abra `http://localhost:5173`. Sem a chave, o aplicativo inicia normalmente no modo local.

## Testes e build

```bash
npm run lint
npm test
npm run build
```

## Implantação na Vercel

O repositório inclui `vercel.json` e a função `api/generative-swap.js`.

1. Importe o repositório na Vercel.
2. Cadastre `OPENAI_API_KEY` nas variáveis de ambiente do projeto.
3. Faça a implantação. A Vercel executará `npm run build` e publicará o frontend junto ao endpoint.

A chave fica somente no servidor. Nunca use uma variável prefixada com `VITE_` para armazená-la.

## Privacidade e uso responsável

No modo local, as fotos permanecem no dispositivo. No modo generativo, as duas imagens são enviadas à API configurada para produzir o resultado e não são salvas pelo código do aplicativo. A função remove os arquivos temporários ao final da requisição.

Use somente imagens próprias ou com autorização das pessoas retratadas. Não use o aplicativo para fraude, assédio ou falsidade ideológica.

## Limitações

O modo generativo tem custo por uso, depende da disponibilidade da API e pode variar entre execuções. A fidelidade melhora com fotografias nítidas, frontais e com boa iluminação. O modo local continua disponível sem custo de API.

## Licença

MIT.
