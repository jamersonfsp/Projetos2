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
  ✅ IMPLEMENTADO

2 - Lista de Projetos: Ordenação por colunas
- Tornar os cabeçalhos da tabela clicáveis para ordenar a lista.
- Colunas ordenáveis: Código, Projeto, Responsável, Status, Início, Fim, Situação.
- Ordenação alfanumérica (A→Z ou 1→9) na primeira clique; inverte (Z→A ou 9→1) na segunda clique.
- Indicador visual (seta ▲/▼) no cabeçalho da coluna ativa.
  ✅ IMPLEMENTADO

────────────────────────────────────
3º Correções e Melhorias Adicionais
────────────────────────────────────

1 - PDF: corrigir CSS incompatível com xhtml2pdf (border-collapse, opacity) e garantir download direto.
  ✅ IMPLEMENTADO

2 - Tela de Atividades: datas de dependência
  - Ao carregar atividades salvas do banco, ler as datas do banco (não recalcular).
  - Ao mudar dependência, auto-setar data posterior à atividade mãe.
  - Usuário pode trocar data manualmente, desde que não seja inferior à previsão da atividade mãe.
  ✅ IMPLEMENTADO

3 - Tela de Atividades: exportar Gráfico de Gantt em JPG ou PNG.
  ✅ IMPLEMENTADO

────────────────────────────────────
4º Correções — Máquina de estados do projeto + detecção do Outlook
────────────────────────────────────

1 - Tela do Projeto: controle de status (máquina de estados)

Regras gerais:
- Sair, Enviar E-mail e Exportar PDF NÃO são afetados pelo status (permanecem sempre ativos).
- As regras abaixo valem na interface E no servidor (a API rejeita operações bloqueadas com erro 400).
- "Modo consulta" = a tela de Cadastro de Atividades abre somente para consulta: campos
  desabilitados, sem "Adicionar linha", sem "Importar" de modelo, sem excluir/arrastar e sem salvar.
  A exportação do Gantt (PNG/JPG) permanece ativa.

Matriz de botões por status do projeto:

| Botão               | Novo / Em Andamento | Pausado   | Cancelado | Aguardando | Finalizado |
|---------------------|---------------------|-----------|-----------|------------|------------|
| Sair / E-mail / PDF | ativo               | ativo     | ativo     | ativo      | ativo      |
| Para Análise        | ativo               | desativado| desativado| vira RETORNAR | desativado |
| Finalizar Projeto   | ativo               | desativado| desativado| ativo      | vira RETORNAR |
| Cobrança            | ativo               | desativado| desativado| desativado | desativado |
| Atualização         | ativo               | desativado| desativado| ativo      | desativado |
| Pausar              | ativo               | vira DESPAUSAR | desativado | desativado | desativado |
| Cancelar            | ativo               | desativado| vira REATIVAR | desativado | desativado |
| Excluir Projeto     | ativo               | desativado| desativado| desativado | desativado |
| Esquema (atividades)| edição              | consulta  | consulta  | consulta   | consulta   |
| Finalizar atividade | ativo               | desativado| desativado| desativado | desativado |

Transições e efeitos:
- PAUSAR: projeto → "Pausado"; todas as atividades "Novo"/"Em Andamento" → "Pausado"
  (Finalizacao = data da pausa). Projeto bloqueado até Despausar.
- DESPAUSAR: projeto → "Em Andamento" (Finalizacao limpa); atividades "Pausadas" →
  "Em Andamento" (Finalizacao limpa). Todas as funcionalidades voltam.
- CANCELAR: projeto → "Cancelado"; todas as atividades "Novo"/"Em Andamento" → "Cancelado"
  (Finalizacao = data do cancelamento). Projeto bloqueado até Reativar.
- REATIVAR: projeto → "Em Andamento" (Finalizacao limpa); atividades "Canceladas" →
  "Em Andamento" (Finalizacao limpa). Todas as funcionalidades voltam.
- PARA ANÁLISE (pré-requisito: todas as atividades finalizadas): projeto → "Aguardando".
  Bloqueia Cobrança, Pausar, Cancelar e Excluir; Atualização e Finalizar permanecem ativos.
- RETORNAR (disponível em "Aguardando" e "Finalizado"): o usuário escolhe o novo status
  ("Novo" ou "Em Andamento"); a data de finalização do projeto é limpa; os status das
  atividades são preservados (podem ser editados novamente via Esquema).
- FINALIZAR (pré-requisito: todas as atividades finalizadas; permitido também a partir de
  "Aguardando"): projeto → "Finalizado". Bloqueia Cobrança, Atualização, Pausar, Cancelar,
  Excluir e Para Análise.

2 - Outlook não é localizado apesar de instalado

Causa mais provável: o pacote pywin32 (que fornece o módulo win32com) não estava declarado
no requirements.txt — sem ele a detecção falha silenciosamente.

Correções:
- pywin32 declarado no requirements.txt (apenas para Windows).
- Detecção robusta: tenta o ProgID "Outlook.Application" e as versões específicas
  (Outlook.Application.16/15/14); consulta o registro do Windows para confirmar a instalação.
- Diagnóstico exibido na tela de Configurações (motivo + sugestão) quando o Outlook
  não é encontrado (ex.: pywin32 ausente, automação COM bloqueada, novo Outlook web).
