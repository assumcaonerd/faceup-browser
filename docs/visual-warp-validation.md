# Protocolo de validação visual do warping facial

Este protocolo compara o alinhamento rígido pelos olhos com a nova malha triangular antes da incorporação do recurso. Use apenas imagens sintéticas ou de domínio público que não identifiquem pessoas reais.

## Cenários mínimos

1. Rosto frontal com iluminação neutra.
2. Inclinação lateral moderada, entre 15° e 25°.
3. Inclinação lateral forte, entre 35° e 45°.
4. Ângulo de três quartos.
5. Sorriso aberto.
6. Expressão neutra com diferença clara de escala.
7. Diferença marcante de iluminação.
8. Geometria propositalmente inválida para verificar o fallback.

Em cada cenário válido, registre lado a lado o método rígido e a malha. No cenário inválido, registre também o fallback.

## Escala de avaliação

| Critério | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Olhos | Deslocamento óbvio | Pequeno desvio aceitável | Bem alinhados |
| Nariz | Distorção ou deslocamento claro | Leve desvio | Natural |
| Boca | Torta ou deslocada | Pequena imperfeição | Natural |
| Mandíbula | Esticamento ou corte evidente | Leve irregularidade | Contorno crível |
| Fissuras | Visíveis em tamanho normal | Visíveis somente ampliadas | Ausentes |
| Bordas | Corte seco ou halo | Feather irregular | Transição suave |
| Cor e iluminação | Diferença gritante | Perceptível, mas aceitável | Boa harmonia |
| Esticamento | Evidente | Leve | Proporções preservadas |
| Tempo | Acima de 3 segundos | Entre 1 e 3 segundos | Abaixo de 1 segundo |
| Fallback | Incorreto | Não aplicável | Correto |

Os critérios críticos são olhos, nariz, boca, fissuras e fallback.

## Regras de aprovação

- Nenhum critério crítico pode receber nota 0.
- A média geral deve ser igual ou superior a 1,6.
- A malha deve ser igual ou superior ao método rígido em pelo menos 80% dos cenários válidos.
- O fallback deve funcionar em 100% das geometrias inválidas.
- Fotografias reais identificáveis não podem entrar no repositório, nos artefatos ou nos logs.

## Registro

| Cenário | Método | Olhos | Nariz | Boca | Mandíbula | Fissuras | Bordas | Cor | Esticamento | Tempo | Fallback | Média | Observações |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Rígido | | | | | | | | | | | | |
| 1 | Malha | | | | | | | | | | | | |

Ao final, registre a média de cada método, a quantidade de vitórias da malha e qualquer cenário que tenha acionado o fallback.
