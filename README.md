# Reference Forge

Sistema para pesquisar, organizar e preparar referências visuais de veículos para modelagem 3D no Blender.

## Objetivo

Reduzir o tempo gasto procurando blueprints, fotos e medidas e padronizar a criação de projetos para miniaturas e STL.

## Arquitetura

- `index.html`, `style.css`, `app.js`: interface web de pesquisa de referências.
- `src/reference_forge/models.py`: modelo de dados do veículo.
- `src/reference_forge/project.py`: cria a estrutura padronizada de pastas.
- `src/reference_forge/blender_script.py`: gera um script de preparação automática do Blender.
- `src/reference_forge/cli.py`: CLI para criar o projeto pelo terminal.
- `tests/`: testes básicos do pipeline.

## Estrutura gerada

```text
projects/<veiculo>/
├── vehicle.json
├── references/
│   ├── blueprints/
│   └── photos/
├── sources/
│   └── README.md
├── blender/
│   └── setup_reference_forge.py
└── export/
    └── stl/
```

## Exemplo: BMW 1M Coupe 2011

```bash
python -m src.reference_forge.cli \
  --make BMW \
  --model "1M Coupe" \
  --year 2011 \
  --length 4373 \
  --width 1956 \
  --height 1400 \
  --wheelbase 2660
```

Depois execute o script gerado com Blender:

```bash
blender --background --python projects/bmw-1m-coupe-2011/blender/setup_reference_forge.py
```

O Blender é configurado em milímetros, cria uma caixa-guia com as dimensões externas e marcadores do entre-eixos, e salva um `.blend` inicial dentro da pasta do projeto.

## Próximas etapas

1. Automatizar busca de ficha técnica em provedores confiáveis.
2. Detectar e classificar imagens por vista: frente, traseira, lateral, superior e 3/4.
3. Validar medidas conflitantes entre fontes.
4. Importar automaticamente blueprints no Blender.
5. Gerar uma base 3D inicial para a carroceria.

## Segurança e licenças

O sistema deve registrar a URL e a licença de cada referência. Não assumir que uma imagem encontrada na internet pode ser redistribuída ou revendida.
