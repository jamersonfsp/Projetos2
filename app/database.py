"""
Camada de banco de dados SQLite.
Cria o schema na primeira execução e fornece helper de conexão.
"""
import os
import sqlite3
from flask import g

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'sistema.db')

SCHEMA_SQL = """
-- Projetos
CREATE TABLE IF NOT EXISTS projetos (
    ID                INTEGER PRIMARY KEY AUTOINCREMENT,
    Titulo            TEXT NOT NULL,
    Descricao         TEXT,
    Responsavel       TEXT,
    Setor             TEXT,
    Inicio            TEXT,
    Previsao          TEXT,
    Status            TEXT DEFAULT 'Novo',
    Tipo              TEXT,
    Finalizacao       TEXT,
    Resolucao_Final   TEXT,
    Observacao_Geral  TEXT,
    cobranca          TEXT
);

-- Atualizações (histórico por projeto)
CREATE TABLE IF NOT EXISTS atualizacoes (
    ID           INTEGER PRIMARY KEY AUTOINCREMENT,
    Id_projetos  INTEGER NOT NULL,
    Data         TEXT,
    Observacao   TEXT,
    FOREIGN KEY (Id_projetos) REFERENCES projetos(ID) ON DELETE CASCADE
);

-- Atividades
CREATE TABLE IF NOT EXISTS atividades (
    ID                 INTEGER PRIMARY KEY AUTOINCREMENT,
    Id_projetos        INTEGER NOT NULL,
    sequencia          INTEGER,
    Atividade          TEXT,
    Responsavel        TEXT,
    Dependencia        INTEGER,
    Inicio             TEXT,
    Previsao           TEXT,
    Duracao            INTEGER DEFAULT 1,
    status             TEXT DEFAULT 'Novo',
    Finalizacao        TEXT,
    Status_Finalizacao TEXT,
    Sabado             INTEGER DEFAULT 1,
    Domingo            INTEGER DEFAULT 1,
    FOREIGN KEY (Id_projetos) REFERENCES projetos(ID) ON DELETE CASCADE
);

-- Cobranças
CREATE TABLE IF NOT EXISTS cobranca (
    ID           INTEGER PRIMARY KEY AUTOINCREMENT,
    Id_projetos  INTEGER NOT NULL,
    data         TEXT,
    observacao   TEXT,
    FOREIGN KEY (Id_projetos) REFERENCES projetos(ID) ON DELETE CASCADE
);

-- Responsáveis
CREATE TABLE IF NOT EXISTS responsaveis (
    ID    INTEGER PRIMARY KEY AUTOINCREMENT,
    Nome  TEXT NOT NULL,
    email TEXT
);

-- Setores
CREATE TABLE IF NOT EXISTS setor (
    ID   INTEGER PRIMARY KEY AUTOINCREMENT,
    Nome TEXT NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ativ_projeto  ON atividades(Id_projetos);
CREATE INDEX IF NOT EXISTS idx_ativ_status   ON atividades(status);
CREATE INDEX IF NOT EXISTS idx_ativ_previsao ON atividades(Previsao);
CREATE INDEX IF NOT EXISTS idx_proj_status   ON projetos(Status);
CREATE INDEX IF NOT EXISTS idx_cobr_projeto  ON cobranca(Id_projetos);
CREATE INDEX IF NOT EXISTS idx_atlz_projeto  ON atualizacoes(Id_projetos);
"""


def get_db():
    """Retorna conexão SQLite por request (Flask g)."""
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db


def close_db(e=None):
    """Fecha conexão ao final do request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """Cria o banco e o schema se não existirem."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
    finally:
        conn.close()


def query_db(query, args=(), one=False):
    """Helper para SELECT."""
    cur = get_db().execute(query, args)
    rows = cur.fetchall()
    cur.close()
    return (rows[0] if rows else None) if one else rows


def execute_db(query, args=()):
    """Helper para INSERT/UPDATE/DELETE. Retorna lastrowid."""
    db = get_db()
    cur = db.execute(query, args)
    db.commit()
    last_id = cur.lastrowid
    cur.close()
    return last_id


def init_app(app):
    """Registra hooks no app Flask."""
    app.teardown_appcontext(close_db)
