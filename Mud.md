1º Mudanças e atualizações

Quero realizar algumas mudanças no sistema para corrigir alguns problemas.

1 - inclusão do logo

2 - Na tela de Relatório Diário tem um erro que eu não pensei antes: No caso dos "atrasados" e "Vence hoje" coloquei que caso eles estejam com esse Status aparecem no relatório, porém não coloquei que caso eles tenham cobrança com data de hoje, eles devem sair da lista. Acabando que quando faço a tratativa, eles ainda ficam na lista. Então, incremente a regra, para "atrasados" e "Vence hoje" somente quem não tem cobrança da feita no dia.

3 - na tela de cadastro de atividades tem alguns erro:

- começando pela inclusão de novas atividades, que deveria ser automatico a inclusão da dependencia da atividade anterior, junto com a data. Além disso, não está aparecendo a lista de atividades já criada para incluir a dependência. 
- O grafico de Gantt está marcando o dia errado. Sempre marcando o dia anterior.
- Quero que aumente a largura do pop-up, passando o grafico de gantt para o lado, dividindo a tela com as atividades, cada linda da atividade ligada a sua linha da tabela do grafico de gantt.

Continuar as correções:

1 - A tela de atividade dividida ficou bom, mas quero que melhore ainda mais. Primeiro quero que case as linhas da atividade com a linha correspondente no grafico de Gantt, ficando melhor para visualizar. Ou seja uma continuação de linha. Segundo, quero que o grafico inicialmente mostre 15 dias, a partir da data inicial, e caso as atividades ultrapasse 15 dias, quero que o grafico mostre até 3dias depois da data fim, isso melhora a vizualização. Terceiro quero que a linha da data pretendida fique na divisa do dia e não cortando a coluna do dia, ou seja de a data pretendida é dia quinze, a linha deve está na divisa entre o dia 15 e 16. As colunas do dia estão pequeno, acedito que o cabecalho está com a fonte pequena, aumente um pouco.

2 - Na Tela do Projeto quero que alterer os TextBox da Descrição, Resolução Final e Observação Geral estão muito pequeno para um local que pode receber até 500 Caracteres. Quero que eles fiquem um abaixo de outro e fiquem de ponta a ponta.

3 - Na Tela do Projeto, corrigir a coluna Atualizações e Cobranças, que quando muda para uma tela com resolução maior, ele se deconfigura ficando mais larga e o primeiro registro não fica organizada toda desconfigurada

────────────────────────────────────
2º Novas Melhorias
────────────────────────────────────

1 - Tela do Projeto: Botão Exportar PDF
- Adicionar botão "Exportar PDF" na Tela do Projeto.
- Ao clicar, abrir pop-up de confirmação com duas opções (checkboxes):
  ☐ Atualizações
  ☐ Cobranças
- O PDF deve conter toda a ficha do projeto:
  • Dados do projeto (título, descrição, responsável, setor, datas, status, tipo, resolução final, observação geral)
  • Tabela de atividades (sequência, atividade, responsável, dependência, início, fim, duração, status, finalização, situação)
  • Atualizações (opcional, conforme checkbox)
  • Cobranças (opcional, conforme checkbox)
- Permitir exportar apenas o "esqueleto" do projeto (sem atualizações/cobranças) se nenhum checkbox estiver marcado.

2 - Lista de Projetos: Ordenação por colunas
- Tornar os cabeçalhos da tabela clicáveis para ordenar a lista.
- Colunas ordenáveis: Código, Projeto, Responsável, Status, Início, Fim, Situação.
- Ordenação alfanumérica (A→Z ou 1→9) na primeira clique; inverte (Z→A ou 9→1) na segunda clique.
- Indicador visual (seta ▲/▼) no cabeçalho da coluna ativa.
