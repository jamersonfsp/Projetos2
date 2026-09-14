# Sistema de Controle de Projeto — Especificação Técnica (Prompt Melhorado)

> **Versão:** 2.0 — PT-BR
> **Stack:** Python 3.10+ · pywebview · Flask · SQLite · HTML/CSS/JS vanilla
> **Tipo:** Aplicação desktop moderna com UI web (webview)

---

## 1. Visão Geral

### 1.1 Objetivo
Sistema desktop para **criar e administrar projetos de forma simples**, com foco em:
- Acompanhamento diário de atividades atrasadas / a vencer
- Gestão visual de cronogramas via gráfico de Gantt
- Centralização de cobranças, atualizações e finalizações
- Indicadores gerenciais em dashboard

### 1.2 Arquitetura
```
┌──────────────────────────────────────────────┐
│         pywebview (janela desktop)           │
│   ┌──────────────────────────────────────┐   │
│   │   Frontend (HTML + CSS + JS vanilla) │   │
│   │   ↕ fetch / JSON                     │   │
│   │   Flask (servidor local 127.0.0.1)   │   │
│   │   ↕ sqlite3                          │   │
│   │   SQLite (data/sistema.db)           │   │
│   └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 1.3 Convenções
- **Datas:** formato ISO `YYYY-MM-DD` no banco; exibição `DD/MM/YYYY`.
- **Horário:** não usado (apenas datas).
- **Status de projeto/atividade:** `Novo`, `Em Andamento`, `Aguardando`, `Finalizado`, `Pausado`, `Cancelado`.
- **Situacao (calculada):** `No prazo`, `Atrasado`, `Finalizado em Dia`, `Finalizado em Atrasado`.
- **Dias úteis:** sábado e domingo podem ser desconsiderados nos cálculos de duração/previsão (configurável por atividade).

---

## 2. Schema do Banco de Dados (SQLite)

```sql
-- Projetos (item principal)
CREATE TABLE projetos (
    ID                INTEGER PRIMARY KEY AUTOINCREMENT,
    Titulo            TEXT NOT NULL,
    Descricao         TEXT,
    Responsavel       TEXT,
    Setor             TEXT,
    Inicio            TEXT,          -- YYYY-MM-DD
    Previsao          TEXT,          -- YYYY-MM-DD
    Status            TEXT DEFAULT 'Novo',
    Tipo              TEXT,
    Finalizacao       TEXT,
    Resolucao_Final   TEXT,
    Observacao_Geral  TEXT,
    cobranca          TEXT           -- data da última cobrança
);

-- Atualizações (histórico por projeto)
CREATE TABLE atualizacoes (
    ID           INTEGER PRIMARY KEY AUTOINCREMENT,
    Id_projetos  INTEGER NOT NULL,
    Data         TEXT,
    Observacao   TEXT,
    FOREIGN KEY (Id_projetos) REFERENCES projetos(ID)
);

-- Atividades (passo a passo do projeto)
CREATE TABLE atividades (
    ID                INTEGER PRIMARY KEY AUTOINCREMENT,
    Id_projetos       INTEGER NOT NULL,
    sequencia         INTEGER,
    Atividade         TEXT,
    Responsavel       TEXT,
    Dependencia       INTEGER,       -- ID da atividade predecessora
    Inicio            TEXT,
    Previsao          TEXT,
    Duracao           INTEGER DEFAULT 1,
    status            TEXT DEFAULT 'Novo',
    Finalizacao       TEXT,
    Status_Finalizacao TEXT,         -- "No prazo" | "Atrasado"
    Sabado            INTEGER DEFAULT 1,  -- 1 = desconsiderar, 0 = contar
    Domingo           INTEGER DEFAULT 1,  -- 1 = desconsiderar, 0 = contar
    FOREIGN KEY (Id_projetos) REFERENCES projetos(ID)
);

-- Cobranças (registros individuais)
CREATE TABLE cobranca (
    ID           INTEGER PRIMARY KEY AUTOINCREMENT,
    Id_projetos  INTEGER NOT NULL,
    data         TEXT,
    observacao   TEXT,
    FOREIGN KEY (Id_projetos) REFERENCES projetos(ID)
);

-- Responsáveis
CREATE TABLE responsaveis (
    ID    INTEGER PRIMARY KEY AUTOINCREMENT,
    Nome  TEXT NOT NULL,
    email TEXT
);

-- Setores
CREATE TABLE setor (
    ID   INTEGER PRIMARY KEY AUTOINCREMENT,
    Nome TEXT NOT NULL
);

-- Índices recomendados
CREATE INDEX idx_atividades_projeto ON atividades(Id_projetos);
CREATE INDEX idx_atividades_status ON atividades(status);
CREATE INDEX idx_atividades_previsao ON atividades(Previsao);
CREATE INDEX idx_projetos_status ON projetos(Status);
CREATE INDEX idx_cobranca_projeto ON cobranca(Id_projetos);
CREATE INDEX idx_atualizacoes_projeto ON atualizacoes(Id_projetos);
```

---

## 3. Regras de Negócio

### 3.1 Cálculo de Situação (projeto e atividade)

| Status             | Condição de data                                  | Situação resultante       |
|--------------------|---------------------------------------------------|---------------------------|
| Novo / Em Andamento| Previsao > hoje                                   | No prazo                  |
| Novo / Em Andamento| Previsao < hoje                                   | Atrasado                  |
| Finalizado         | Previsao >= Finalizacao                           | Finalizado em Dia         |
| Finalizado         | Previsao < Finalizacao                            | Finalizado em Atrasado    |
| Aguardando/Pausado/Cancelado | —                                       | (não se aplica)           |

### 3.2 Cálculo de dias úteis
- Se `Sabado=1`, sábado é desconsiderado.
- Se `Domingo=1`, domingo é desconsiderado.
- Cálculo de Previsao: `Inicio + Duracao dias úteis`.
- Cálculo de Inicio com dependência: `Previsao(dependência) + 1 dia útil`.

### 3.3 Regras do Relatório Diário

A lista do Relatório Diário reúne **atividades a tratar no dia**, composta por:

1. **Atividades Atrasadas** — Status Novo/Em Andamento e Previsao < hoje.
2. **Atividades no prazo com previsão para o dia** — Status Novo/Em Andamento e Previsao = hoje.
3. **Atividades no prazo sem cobrança há mais de 2 dias úteis** — Status Novo/Em Andamento, Previsao > hoje, e `projetos.cobranca` é nula ou mais antiga que 2 dias úteis (desconsiderando sábado e domingo).

> **Exemplo de contagem de dias úteis para cobrança:**
> Última cobrança sexta 04/09/2026 → próxima cobrança esperada 09/09/2026
> (05 e 06 são sábado e domingo, não contam).

> **Não entrar na lista (item 3) se já está contemplado nos itens 1 ou 2.**

**Exemplo:**
- Atividade 1: Cobrança 09/09/2026 / Previsao 10/09/2026 → entra (item 2)
- Atividade 2: Cobrança 10/09/2026 / Previsao 15/09/2026 → não entra
- Atividade 3: Cobrança 08/09/2026 / Previsao 15/09/2026 → entra (item 3)
- Atividade 4: Cobrança 10/09/2026 / Previsao 11/09/2026 → entra (item 2)

### 3.4 Colunas da lista do Relatório Diário
`Codigo | Responsável | Atividade | Previsão | Responsável Atividade | Dias (Previsao - hoje) | Analisar (link)`

---

## 4. Layout Geral

### 4.1 Shell
- **Sidebar retrátil** à esquerda, cinza-escuro `#36373D`, largura 220px aberta / 60px retraída.
- **Toggle**: clique no logo circular no topo da sidebar.
- **Tema**: claro por padrão, com paleta corporativa moderna (cantos arredondados 8px, sombras suaves).
- **Topbar**: logo + título da página atual + relógio/data.

### 4.2 Menu lateral
1. Dashboard
2. Relatório Diário
3. Cadastro de Projeto
4. Lista de Projetos
5. Calendário *(em breve)*
6. Responsáveis
7. Setor

### 4.3 Identidade visual
- Cor primária: `#36373D` (cinza-escuro)
- Cor primária escura: `#2A2B30`
- Cor de destaque: `#E7D264` (dourado)
- Fundo: `#F5F7FA`
- Cartões: `#FFFFFF`
- Texto: `#1A1A1A`
- Texto secundário: `#6B7280`
- Borda: `#E5E7EB`
- Sucesso: `#10B981`
- Aviso: `#F59E0B`
- Perigo: `#EF4444`

> **Observação:** o usuário enviará posteriormente o logo da empresa, que atualizará as cores do projeto.

---

## 5. Módulos

### 5.1 Dashboard
**Estrutura:**
- Título no topo à esquerda.
- Linha de filtros: `Inicio`, `Previsao`, `Termino`, `Responsavel`, `Status` (afetam todo o dashboard).
- **Cards**: Total Projetos, Projetos em Dia, Projetos Finalizados, Projetos Atrasados, % Atrasados.
  - Cor da fonte do card % Atrasados: verde ≤5%, amarelo >5% e ≤8%, vermelho >8%.
- **Gráfico de Linha do Tempo**: linhas Total, Atrasados, Finalizados, com mini-filtro Status.
- **Gráfico de Pizza**: % Finalizados / Atrasados / Em Dia.
- **Tabela Status por Responsável**: linhas = responsáveis; colunas = Novos, Em Andamento, Finalizados, Total.

### 5.2 Relatório Diário
Lista de atividades a tratar no dia (ver regras em 3.3). Coluna "Analisar" leva à Tela do Projeto (5.5).

### 5.3 Cadastro de Projeto
**Formulário:**
- Titulo (text), Descrição (textarea máx 500), Responsavel (select), Setor (select), Inicio (date), Previsao (date — preenchida pela última atividade), Tipo (select: Projeto, Melhoria de Mão-de-obra, Melhoria de Processo, Atividades, Outros), Status (default "Novo").
- Botão **"Incluir Atividades"** abre popup com a tela de Cadastro de Atividades (5.4).

### 5.4 Cadastro de Atividades
**Topo:** data de início do projeto + campo "data pretendida para finalização" (apenas visual, linha vermelha no Gantt).

**Layout em 2 colunas:**
- Esquerda: **tabela editável** de atividades.
- Direita: **gráfico de Gantt** em SVG.

**Colunas da tabela:**
- Sequencia (auto 1, 2, 3...)
- Atividade (text)
- Responsavel (select)
- Status (default "Novo")
- Dependencia (default = atividade anterior; pode ser Null ou outra)
- Inicio (default = início do projeto p/ 1ª; p/ demais = previsao da dependência + 1 dia útil)
- Duracao (integer, default 1)
- Previsao (calculada: Inicio + Duracao em dias úteis)
- Sabado (checkbox, default marcado = desconsiderar)
- Domingo (checkbox, default marcado = desconsiderar)
- Excluir (botão com confirmação)

**Interações:**
- Drag-and-drop para reordenar (atualiza Sequencia).
- Enter adiciona nova linha.
- Salvar fecha popup e leva tabela para a tela do projeto; atualiza Previsao do projeto.

**Gantt SVG:**
- Barra de ano (topo), mês, dia.
- Cada dia = coluna.
- Inicia no dia de início do projeto.
- Linha vermelha vertical na "data pretendida para finalização".

### 5.5 Lista de Projetos
**Filtros em cascata** (multiseleção, filtros se atualizam entre si):
- Codigo (busca por ID)
- Status (Novo, Em Andamento, Aguardando, Finalizado, Pausado, Cancelado)
- Responsavel
- Setor
- Botão Buscar.

**Colunas:** Codigo, Projeto, Responsavel, Inicio, Fim (Finalizacao ou Previsao conforme status), Situacao, Abrir (botão → Tela do Projeto 5.6).

### 5.6 Tela do Projeto
**Layout 2 colunas:**
- Esquerda: dados do projeto + tabela de atividades + botão "Esquema" (reabre 5.4 com regras extras).
- Direita: atualizações (multiline, scroll próprio, mais recente primeiro).

**Tabela de atividades:** Sequencia, Atividade, Responsavel, Dependencia, Inicio, Fim, Duracao, Status, Finalizacao, Situacao, Sabado, Domingo, Finalizar (botão).

**Popup Finalizar Atividade:**
- Dados em default, exceto: Status (Novo/Em Andamento/Finalizado), Fim (obrigatório se Finalizado).
- Situacao calculada automaticamente.

**Botões de ação geral:**
- **Sair** → volta à Lista de Projetos.
- **Para Analise** → requer todas as atividades Finalizadas; solicita Resolucao_Final (até 500 chars); status → "Aguardando".
- **Finalizar** → requer todas as atividades Finalizadas; solicita Observacao_Geral (até 500 chars); Finalizacao = data da última atividade; status → "Finalizado".
- **Cobranca** → registra data + texto em `cobranca` e atualiza `projetos.cobranca`.
- **Atualizacoes** → popup para registrar atualização livre.

### 5.7 Calendário *(em breve)*
Placeholder no menu. Implementação futura.

### 5.8 Responsáveis
Formulário CRUD: Nome, Email. Lista lateral com os já cadastrados.

### 5.9 Setor
Formulário CRUD: Nome. Lista lateral com os já cadastrados.

---

## 6. Critérios de Aceitação

- [ ] Aplicação abre como janela desktop via pywebview.
- [ ] Sidebar retrái/expandi ao clicar no logo.
- [ ] Dashboard carrega com filtros funcionais e gráficos renderizados.
- [ ] Relatório Diário retorna lista correta conforme regras de 3.3.
- [ ] Cadastro de Projeto valida campos obrigatórios e cria registro.
- [ ] Cadastro de Atividades calcula Inicio, Previsao e dias úteis corretamente.
- [ ] Gantt SVG renderiza atividades e linha vermelha de data pretendida.
- [ ] Lista de Projetos aplica filtros em cascata.
- [ ] Tela do Projeto permite finalizar atividades, registrar cobranças e atualizações.
- [ ] Responsáveis e Setor permitem CRUD completo.
- [ ] Banco SQLite criado automaticamente no primeiro uso (vazio).

---

## 7. Como Executar

```bash
# 1. Criar ambiente virtual
python3 -m venv venv
source venv/bin/activate    # Linux/Mac
# venv\Scripts\activate     # Windows

# 2. Instalar dependências
pip install -r requirements.txt

# 3. Executar
python main.py
```

Na primeira execução, o arquivo `data/sistema.db` é criado automaticamente com todas as tabelas (vazio).

---

## 8. Estrutura de Diretórios

```
sistema-controle-projeto/
├── README.md                    # Esta especificação
├── requirements.txt
├── main.py                      # Entry point (pywebview + Flask)
├── app/
│   ├── __init__.py              # Flask app factory
│   ├── database.py              # SQLite setup + conexão
│   ├── business.py              # Regras de negócio
│   └── api.py                   # Rotas Flask (REST JSON)
├── templates/
│   ├── index.html               # Shell SPA
│   └── partials/                # HTML das telas (carregados via fetch)
├── static/
│   ├── css/
│   │   ├── main.css             # Tema + layout
│   │   ├── components.css       # Botões, cards, tabelas
│   │   └── modules.css          # Estilos por módulo
│   ├── js/
│   │   ├── app.js               # Router SPA + sidebar
│   │   ├── api.js               # Cliente HTTP
│   │   ├── dashboard.js
│   │   ├── relatorio.js
│   │   ├── projeto.js           # Cadastro + Lista + Tela
│   │   ├── atividades.js        # Tabela + Gantt SVG
│   │   ├── responsaveis.js
│   │   └── setor.js
│   └── assets/
│       └── logo.svg             # Placeholder (substituir depois)
└── data/
    └── sistema.db               # SQLite (auto-criado)
```

---

## 9. Notas de Implementação

- **Drag-and-drop** das atividades: implementado via HTML5 Drag API nativa (sem libs externas).
- **Gantt SVG**: gerado dinamicamente em JS, sem dependências externas.
- **Gráficos do Dashboard**: Chart.js via CDN local (offline-first).
- **Validações de data**: cliente + servidor (defensivo).
- **Tema**: variáveis CSS em `:root` para facilitar troca posterior quando o logo chegar.
