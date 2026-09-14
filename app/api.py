"""
API REST do Sistema de Controle de Projeto.
Todos os endpoints sob /api/*.
"""
from flask import Blueprint, request, jsonify, g
from app.database import get_db, query_db, execute_db
from app import business as B

api_bp = Blueprint('api', __name__)


def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    return d


# ──────────────────────────────────────────────────────────────
# Responsáveis
# ──────────────────────────────────────────────────────────────

@api_bp.route('/responsaveis', methods=['GET'])
def list_responsaveis():
    db = get_db()
    rows = db.execute("SELECT * FROM responsaveis ORDER BY Nome").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@api_bp.route('/responsaveis', methods=['POST'])
def create_responsavel():
    data = request.get_json()
    db = get_db()
    cur = db.execute("INSERT INTO responsaveis (Nome, email) VALUES (?, ?)",
                     (data.get('Nome'), data.get('email')))
    db.commit()
    return jsonify({'ID': cur.lastrowid, **data}), 201


@api_bp.route('/responsaveis/<int:rid>', methods=['PUT'])
def update_responsavel(rid):
    data = request.get_json()
    db = get_db()
    db.execute("UPDATE responsaveis SET Nome = ?, email = ? WHERE ID = ?",
               (data.get('Nome'), data.get('email'), rid))
    db.commit()
    return jsonify({'ID': rid, **data})


@api_bp.route('/responsaveis/<int:rid>', methods=['DELETE'])
def delete_responsavel(rid):
    db = get_db()
    db.execute("DELETE FROM responsaveis WHERE ID = ?", (rid,))
    db.commit()
    return jsonify({'ok': True})


# ──────────────────────────────────────────────────────────────
# Setores
# ──────────────────────────────────────────────────────────────

@api_bp.route('/setores', methods=['GET'])
def list_setores():
    db = get_db()
    rows = db.execute("SELECT * FROM setor ORDER BY Nome").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@api_bp.route('/setores', methods=['POST'])
def create_setor():
    data = request.get_json()
    db = get_db()
    cur = db.execute("INSERT INTO setor (Nome) VALUES (?)", (data.get('Nome'),))
    db.commit()
    return jsonify({'ID': cur.lastrowid, **data}), 201


@api_bp.route('/setores/<int:sid>', methods=['PUT'])
def update_setor(sid):
    data = request.get_json()
    db = get_db()
    db.execute("UPDATE setor SET Nome = ? WHERE ID = ?", (data.get('Nome'), sid))
    db.commit()
    return jsonify({'ID': sid, **data})


@api_bp.route('/setores/<int:sid>', methods=['DELETE'])
def delete_setor(sid):
    db = get_db()
    db.execute("DELETE FROM setor WHERE ID = ?", (sid,))
    db.commit()
    return jsonify({'ok': True})


# ──────────────────────────────────────────────────────────────
# Projetos
# ──────────────────────────────────────────────────────────────

@api_bp.route('/projetos', methods=['GET'])
def list_projetos():
    """Lista projetos com filtros opcionais (codigo, status[], responsavel[], setor[])."""
    db = get_db()
    args = []
    where = []

    codigo = request.args.get('codigo')
    if codigo:
        where.append("p.ID = ?")
        args.append(int(codigo))

    status = request.args.getlist('status')
    status = [s for s in status if s]
    if status:
        placeholders = ','.join('?' * len(status))
        where.append(f"p.Status IN ({placeholders})")
        args.extend(status)

    responsaveis = request.args.getlist('responsavel')
    responsaveis = [r for r in responsaveis if r]
    if responsaveis:
        placeholders = ','.join('?' * len(responsaveis))
        where.append(f"p.Responsavel IN ({placeholders})")
        args.extend(responsaveis)

    setores = request.args.getlist('setor')
    setores = [s for s in setores if s]
    if setores:
        placeholders = ','.join('?' * len(setores))
        where.append(f"p.Setor IN ({placeholders})")
        args.extend(setores)

    where_clause = ('WHERE ' + ' AND '.join(where)) if where else ''

    rows = db.execute(f"""
        SELECT p.* FROM projetos p
        {where_clause}
        ORDER BY p.ID DESC
    """, args).fetchall()

    result = []
    for r in rows:
        d = row_to_dict(r)
        d['Situacao'] = B.calcular_situacao(r['Status'], r['Previsao'], r['Finalizacao'])
        # Fim: Finalizacao se Finalizado/Cancelado/Pausado, senão Previsao
        if r['Status'] in ('Finalizado', 'Cancelado', 'Pausado'):
            d['Fim'] = r['Finalizacao']
        else:
            d['Fim'] = r['Previsao']
        result.append(d)

    return jsonify(result)


@api_bp.route('/projetos/<int:pid>', methods=['GET'])
def get_projeto(pid):
    db = get_db()
    p = db.execute("SELECT * FROM projetos WHERE ID = ?", (pid,)).fetchone()
    if not p:
        return jsonify({'error': 'Projeto não encontrado'}), 404

    atividades = db.execute("""
        SELECT * FROM atividades WHERE Id_projetos = ? ORDER BY sequencia
    """, (pid,)).fetchall()

    atualizacoes = db.execute("""
        SELECT * FROM atualizacoes WHERE Id_projetos = ?
        ORDER BY Data DESC, ID DESC
    """, (pid,)).fetchall()

    cobrancas = db.execute("""
        SELECT * FROM cobranca WHERE Id_projetos = ? ORDER BY data DESC
    """, (pid,)).fetchall()

    proj_dict = row_to_dict(p)
    proj_dict['Situacao'] = B.calcular_situacao(p['Status'], p['Previsao'], p['Finalizacao'])

    return jsonify({
        'projeto': proj_dict,
        'atividades': [row_to_dict(a) for a in atividades],
        'atualizacoes': [row_to_dict(a) for a in atualizacoes],
        'cobrancas': [row_to_dict(c) for c in cobrancas],
    })


@api_bp.route('/projetos', methods=['POST'])
def create_projeto():
    data = request.get_json()
    db = get_db()
    # Previsao NÃO é informada pelo cliente — ela é calculada a partir
    # das atividades (maior Previsao entre elas). Por isso não entra no INSERT.
    cur = db.execute("""
        INSERT INTO projetos
        (Titulo, Descricao, Responsavel, Setor, Inicio, Status, Tipo,
         Finalizacao, Resolucao_Final, Observacao_Geral, cobranca)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get('Titulo'),
        data.get('Descricao'),
        data.get('Responsavel'),
        data.get('Setor'),
        data.get('Inicio'),
        data.get('Status', 'Novo'),
        data.get('Tipo'),
        data.get('Finalizacao'),
        data.get('Resolucao_Final'),
        data.get('Observacao_Geral'),
        data.get('cobranca'),
    ))
    db.commit()
    pid = cur.lastrowid
    # Recalcula Previsao (defensivo — se ainda não há atividades, mantém NULL)
    B.recalcular_previsao_projeto(db, pid)
    # Registra atualização
    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
        VALUES (?, ?, ?)
    """, (pid, B.today_iso(), f"Projeto criado: {data.get('Titulo')}"))
    db.commit()
    return jsonify({'ID': pid}), 201


@api_bp.route('/projetos/<int:pid>', methods=['PUT'])
def update_projeto(pid):
    data = request.get_json()
    db = get_db()
    # Previsao NÃO é atualizada aqui — ela é sempre recalculada pelas atividades.
    # Se o cliente enviar Previsao, será ignorado.
    db.execute("""
        UPDATE projetos SET
            Titulo = ?, Descricao = ?, Responsavel = ?, Setor = ?,
            Inicio = ?, Status = ?, Tipo = ?,
            Finalizacao = ?, Resolucao_Final = ?, Observacao_Geral = ?, cobranca = ?
        WHERE ID = ?
    """, (
        data.get('Titulo'), data.get('Descricao'), data.get('Responsavel'), data.get('Setor'),
        data.get('Inicio'), data.get('Status'), data.get('Tipo'),
        data.get('Finalizacao'), data.get('Resolucao_Final'), data.get('Observacao_Geral'),
        data.get('cobranca'), pid
    ))
    db.commit()
    # Sempre recalcula a Previsao com base nas atividades (maior Previsao)
    B.recalcular_previsao_projeto(db, pid)
    return jsonify({'ID': pid, **data})


@api_bp.route('/projetos/<int:pid>', methods=['DELETE'])
def delete_projeto(pid):
    db = get_db()
    db.execute("DELETE FROM projetos WHERE ID = ?", (pid,))
    db.commit()
    return jsonify({'ok': True})


# ──────────────────────────────────────────────────────────────
# Atividades
# ──────────────────────────────────────────────────────────────

@api_bp.route('/projetos/<int:pid>/atividades', methods=['GET'])
def list_atividades(pid):
    db = get_db()
    rows = db.execute("SELECT * FROM atividades WHERE Id_projetos = ? ORDER BY sequencia", (pid,)).fetchall()
    result = []
    for r in rows:
        d = row_to_dict(r)
        d['Situacao'] = B.calcular_situacao(r['status'], r['Previsao'], r['Finalizacao'])
        result.append(d)
    return jsonify(result)


@api_bp.route('/projetos/<int:pid>/atividades', methods=['POST'])
def create_atividade(pid):
    data = request.get_json()
    db = get_db()

    # Calcula Inicio e Previsao conforme regras, se não vieram do cliente
    inicio = data.get('Inicio')
    duracao = int(data.get('Duracao', 1))
    skip_sat = bool(data.get('Sabado', 1))
    skip_sun = bool(data.get('Domingo', 1))

    # Se tem dependência, calcular inicio a partir da previsão da dependência
    dep_id = data.get('Dependencia')
    if dep_id:
        dep = db.execute("SELECT Previsao FROM atividades WHERE ID = ?", (dep_id,)).fetchone()
        if dep and dep['Previsao']:
            inicio = B.next_business_day(dep['Previsao'], skip_sat, skip_sun).isoformat()
    else:
        # Se não tem dependência, usar inicio do projeto
        if not inicio:
            proj = db.execute("SELECT Inicio FROM projetos WHERE ID = ?", (pid,)).fetchone()
            if proj:
                inicio = proj['Inicio']

    # Calcula Previsao se não veio
    previsao = data.get('Previsao')
    if not previsao and inicio and duracao:
        previsao = B.calcular_previsao_atividade(inicio, duracao, skip_sat, skip_sun)

    # Sequencia: próxima
    if not data.get('sequencia'):
        max_seq = db.execute(
            "SELECT MAX(sequencia) AS m FROM atividades WHERE Id_projetos = ?", (pid,)
        ).fetchone()['m']
        seq = (max_seq or 0) + 1
    else:
        seq = int(data.get('sequencia'))

    cur = db.execute("""
        INSERT INTO atividades
        (Id_projetos, sequencia, Atividade, Responsavel, Dependencia, Inicio,
         Previsao, Duracao, status, Finalizacao, Status_Finalizacao, Sabado, Domingo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        pid, seq, data.get('Atividade'), data.get('Responsavel'), dep_id,
        inicio, previsao, duracao, data.get('status', 'Novo'),
        data.get('Finalizacao'), data.get('Status_Finalizacao'),
        1 if skip_sat else 0, 1 if skip_sun else 0
    ))
    db.commit()
    aid = cur.lastrowid

    # Recalcula previsão do projeto
    B.recalcular_previsao_projeto(db, pid)

    return jsonify({'ID': aid, 'Id_projetos': pid}), 201


@api_bp.route('/projetos/<int:pid>/atividades/batch', methods=['POST'])
def batch_atividades(pid):
    """Substitui todas as atividades de um projeto pela lista enviada."""
    data = request.get_json()
    atividades = data.get('atividades', [])
    db = get_db()

    # Apaga as existentes (não-finalizadas)
    db.execute("DELETE FROM atividades WHERE Id_projetos = ? AND status != 'Finalizado'", (pid,))
    db.commit()

    # Busca projeto para inicio
    proj = db.execute("SELECT * FROM projetos WHERE ID = ?", (pid,)).fetchone()
    if not proj:
        return jsonify({'error': 'Projeto não encontrado'}), 404

    # Mapeia IDs antigos de dependência para novos (quando recria)
    id_map = {}

    for idx, a in enumerate(atividades, start=1):
        skip_sat = bool(a.get('Sabado', 1))
        skip_sun = bool(a.get('Domingo', 1))
        duracao = int(a.get('Duracao', 1))

        # Dependência (pode ser ID antigo ou sequencia)
        dep_id = None
        dep_seq = a.get('Dependencia')
        if dep_seq and dep_seq in id_map:
            dep_id = id_map[dep_seq]

        # Inicio
        inicio = a.get('Inicio')
        if dep_id:
            dep = db.execute("SELECT Previsao FROM atividades WHERE ID = ?", (dep_id,)).fetchone()
            if dep and dep['Previsao']:
                inicio = B.next_business_day(dep['Previsao'], skip_sat, skip_sun).isoformat()
        elif not inicio:
            inicio = proj['Inicio']

        # Previsao
        previsao = a.get('Previsao')
        if not previsao and inicio and duracao:
            previsao = B.calcular_previsao_atividade(inicio, duracao, skip_sat, skip_sun)

        cur = db.execute("""
            INSERT INTO atividades
            (Id_projetos, sequencia, Atividade, Responsavel, Dependencia, Inicio,
             Previsao, Duracao, status, Finalizacao, Status_Finalizacao, Sabado, Domingo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, idx, a.get('Atividade'), a.get('Responsavel'), dep_id,
            inicio, previsao, duracao, a.get('status', 'Novo'),
            a.get('Finalizacao'), a.get('Status_Finalizacao'),
            1 if skip_sat else 0, 1 if skip_sun else 0
        ))
        db.commit()
        # Mapeia sequencia -> novo ID
        id_map[idx] = cur.lastrowid

    # Atualiza Dependencia com os novos IDs (já foi feito acima via id_map)

    # Recalcula previsão do projeto
    B.recalcular_previsao_projeto(db, pid)

    return jsonify({'ok': True, 'count': len(atividades)})


@api_bp.route('/atividades/<int:aid>', methods=['PUT'])
def update_atividade(aid):
    data = request.get_json()
    db = get_db()
    db.execute("""
        UPDATE atividades SET
            sequencia = ?, Atividade = ?, Responsavel = ?, Dependencia = ?,
            Inicio = ?, Previsao = ?, Duracao = ?, status = ?,
            Finalizacao = ?, Status_Finalizacao = ?, Sabado = ?, Domingo = ?
        WHERE ID = ?
    """, (
        data.get('sequencia'), data.get('Atividade'), data.get('Responsavel'),
        data.get('Dependencia'), data.get('Inicio'), data.get('Previsao'),
        data.get('Duracao'), data.get('status'),
        data.get('Finalizacao'), data.get('Status_Finalizacao'),
        1 if data.get('Sabado') else 0,
        1 if data.get('Domingo') else 0,
        aid
    ))
    db.commit()
    # Recalcula previsão do projeto
    ativ = db.execute("SELECT Id_projetos FROM atividades WHERE ID = ?", (aid,)).fetchone()
    if ativ:
        B.recalcular_previsao_projeto(db, ativ['Id_projetos'])
    return jsonify({'ID': aid, **data})


@api_bp.route('/atividades/<int:aid>', methods=['DELETE'])
def delete_atividade(aid):
    db = get_db()
    ativ = db.execute("SELECT Id_projetos FROM atividades WHERE ID = ?", (aid,)).fetchone()
    db.execute("DELETE FROM atividades WHERE ID = ?", (aid,))
    db.commit()
    if ativ:
        B.recalcular_previsao_projeto(db, ativ['Id_projetos'])
    return jsonify({'ok': True})


@api_bp.route('/atividades/<int:aid>/finalizar', methods=['POST'])
def finalizar_atividade_route(aid):
    data = request.get_json()
    db = get_db()
    try:
        B.finalizar_atividade(db, aid, data.get('status'), data.get('Fim'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


# ──────────────────────────────────────────────────────────────
# Ações de projeto (Análise, Finalizar, Cobrança, Atualização)
# ──────────────────────────────────────────────────────────────

@api_bp.route('/projetos/<int:pid>/analise', methods=['POST'])
def enviar_analise_route(pid):
    data = request.get_json()
    db = get_db()
    try:
        B.enviar_para_analise(db, pid, data.get('resolucao', ''))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/finalizar', methods=['POST'])
def finalizar_projeto_route(pid):
    data = request.get_json()
    db = get_db()
    try:
        B.finalizar_projeto(db, pid, data.get('observacao', ''))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/cobranca', methods=['POST'])
def cobranca_route(pid):
    data = request.get_json()
    db = get_db()
    B.registrar_cobranca(db, pid, data.get('data'), data.get('observacao', ''))
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/atualizacoes', methods=['POST'])
def atualizacao_route(pid):
    data = request.get_json()
    db = get_db()
    B.registrar_atualizacao(db, pid, data.get('data', B.today_iso()), data.get('observacao', ''))
    return jsonify({'ok': True})


# ──────────────────────────────────────────────────────────────
# Dashboard
# ──────────────────────────────────────────────────────────────

@api_bp.route('/dashboard', methods=['GET'])
def dashboard_route():
    db = get_db()
    filtros = {}
    for k in ('inicio', 'previsao', 'termino', 'responsavel', 'status'):
        v = request.args.get(k)
        if v:
            filtros[k] = v.split(',') if k in ('status',) else v
    # status pode vir múltiplas vezes
    statuses = request.args.getlist('status')
    if statuses:
        filtros['status'] = statuses

    stats = B.dashboard_stats(db, filtros)
    return jsonify(stats)


# ──────────────────────────────────────────────────────────────
# Relatório Diário
# ──────────────────────────────────────────────────────────────

@api_bp.route('/relatorio-diario', methods=['GET'])
def relatorio_diario_route():
    db = get_db()
    lista = B.relatorio_diario(db)
    return jsonify(lista)


# ──────────────────────────────────────────────────────────────
# Calcular previsão (helper para o frontend)
# ──────────────────────────────────────────────────────────────

@api_bp.route('/calcular/previsao', methods=['POST'])
def calcular_previsao_route():
    data = request.get_json()
    inicio = data.get('inicio')
    duracao = int(data.get('duracao', 1))
    skip_sat = bool(data.get('sabado', True))
    skip_sun = bool(data.get('domingo', True))
    result = B.calcular_previsao_atividade(inicio, duracao, skip_sat, skip_sun)
    return jsonify({'previsao': result, 'previsao_br': B.format_date_br(result)})


@api_bp.route('/calcular/inicio', methods=['POST'])
def calcular_inicio_route():
    data = request.get_json()
    dep_previsao = data.get('dependencia_previsao')
    skip_sat = bool(data.get('sabado', True))
    skip_sun = bool(data.get('domingo', True))
    if dep_previsao:
        result = B.next_business_day(dep_previsao, skip_sat, skip_sun).isoformat()
    else:
        result = data.get('projeto_inicio')
    return jsonify({'inicio': result, 'inicio_br': B.format_date_br(result)})
