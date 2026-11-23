# Monitor Hidrológico da Amazônia

[Abrir o monitor](https://thiagosfsilva.github.io/amazon-hydro-monitor/).
O painel compara níveis diários em 23 estações da ANA com o ciclo sazonal de
1980–2010 e com anos de cheia e seca. Cada estação informa a data da última
leitura disponível. As cotas em metros são relativas à régua de cada estação.

## Dados e atualização

`data/reference.json` reúne o catálogo, as curvas históricas, o número de
observações por dia do calendário e as estatísticas da referência. Belém
mostra curvas anuais desde 2016. Em Tefé, o painel compensa o salto de
6 de setembro de 2024 subtraindo 4,963 m das cotas posteriores, inclusive
na data de transição.

Os arquivos em `data/<estação>/<ano>.json` guardam níveis médios diários
por data. A rotina consulta a telemetria da ANA para dias completos,
exclui níveis com indicador de qualidade 2 antes de calcular a média e
converte centímetros em metros. A janela de revisão cobre pelo menos os
últimos 14 dias e recua até o último registro quando há atraso.
Uma consulta sem resposta útil preserva as leituras já salvas.

A ação **Morning refresh trigger** tem chamadas às 22:23 UTC da véspera, 04:23 e 06:23 UTC para compensar atrasos no agendamento do GitHub. Entre 04:00 e 22:00 UTC, solicita a publicação se ainda não houve sucesso no dia e nenhuma execução está em andamento. A ação **Refresh and publish monitor** também
pode ser iniciada manualmente. Usa os segredos de repositório `ANA_USER`
e `ANA_PASS`. O histórico de execuções mostra quais estações responderam.
Após a atualização, a ação registra os dados em git e publica o diretório
`site/` no GitHub Pages.

## Gerar uma cópia local

Com Python 3, execute `python scripts/build.py` a partir da raiz deste
repositório. Em seguida, execute `python -m http.server --directory site`
e abra `http://localhost:8000/`. A geração usa os dados deste repositório.
`scripts/seed.py` importa a referência inicial do projeto de pesquisa
amazon-hydro e é usado apenas na preparação de uma versão histórica.
