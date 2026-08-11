# FaceUp Browser

Aplicativo web de troca de rostos que processa as imagens localmente no navegador. Usa MediaPipe Face Mesh para detecção, triangulação de Delaunay para deformação da malha e Canvas 2D para composição.

## Recursos

- processamento privado, sem upload das fotos;
- arrastar e soltar imagens JPG, PNG e WebP;
- correção automática de orientação e redução segura de imagens grandes;
- alinhamento por malha facial, com ajuste de cor, suavização e opacidade;
- comparação entre original e resultado;
- exportação em PNG na resolução de processamento;
- interface responsiva e acessível;
- lint e build automatizados pelo GitHub Actions.

## Executar

Requer Node.js 20.19+ ou 22.12+.

```bash
npm install
npm run dev
```

Abra o endereço exibido no terminal. Para gerar a versão de produção:

```bash
npm run build
npm run preview
```

## Privacidade e uso responsável

As fotos permanecem no dispositivo. Os arquivos JavaScript das bibliotecas são carregados pelo jsDelivr, mas as imagens não são transmitidas. Use somente imagens próprias ou com autorização das pessoas retratadas. Não use o aplicativo para fraude, assédio ou falsidade ideológica.

## Limitações

O resultado depende de pose, expressão, iluminação e resolução semelhantes. O aplicativo não usa um modelo generativo e, por isso, ângulos muito diferentes podem produzir distorções.

## Licença

MIT.
