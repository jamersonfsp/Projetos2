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


def _status_projeto(db, pid):
    row = db.execute("SELECT Status FROM projetos WHERE ID = ?", (pid,)).fetchone()
    return row['Status'] if row else None


def _exigir_editavel(pid):
    """Retorna resposta de erro (400) caso o projeto esteja em um status
    bloqueado (Pausado/Cancelado/Aguardando/Finalizado). None = liberado."""
    db = get_db()
    st = _status_projeto(db, pid)
    if st is None:
        return jsonify({'error': 'Projeto não encontrado'}), 404
    if st not in ('Novo', 'Em Andamento'):
        return jsonify({'error': f"Projeto em status '{st}' não pode sofrer alterações."}), 400
    return None


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
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao, tipo)
        VALUES (?, ?, ?, 'S')
    """, (pid, B.today_iso(), f"Projeto criado: {data.get('Titulo')}"))
    db.commit()
    return jsonify({'ID': pid}), 201


@api_bp.route('/projetos/<int:pid>', methods=['PUT'])
def update_projeto(pid):
    # Projetos em status bloqueado não podem ser alterados
    err = _exigir_editavel(pid)
    if err:
        return err
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
    # Exclusão permitida apenas para projetos Novo/Em Andamento
    err = _exigir_editavel(pid)
    if err:
        return err
    db = get_db()
    # Remove registros filhos (atividades, atualizações, cobranças)
    db.execute("DELETE FROM atividades WHERE Id_projetos = ?", (pid,))
    db.execute("DELETE FROM atualizacoes WHERE Id_projetos = ?", (pid,))
    db.execute("DELETE FROM cobranca WHERE Id_projetos = ?", (pid,))
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
    # Inclusão de atividades apenas com projeto editável
    err = _exigir_editavel(pid)
    if err:
        return err
    data = request.get_json()
    db = get_db()

    # Calcula Inicio e Previsao conforme regras, se não vieram do cliente
    inicio = data.get('Inicio')
    duracao = int(data.get('Duracao', 1))
    skip_sat = bool(data.get('Sabado', 1))
    skip_sun = bool(data.get('Domingo', 1))

    # Se tem dependência (sequência), calcular inicio a partir da previsão da dependência
    dep_seq = data.get('Dependencia')
    dep_db_id = None
    if dep_seq:
        # Busca a atividade dependência pelo número de sequência
        dep = db.execute(
            "SELECT ID, Previsao FROM atividades WHERE Id_projetos = ? AND sequencia = ?",
            (pid, dep_seq)
        ).fetchone()
        if dep:
            dep_db_id = dep['ID']
            if dep['Previsao']:
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
        pid, seq, data.get('Atividade'), data.get('Responsavel'), dep_db_id,
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
    """Substitui todas as atividades de um projeto pela lista enviada.
    Atividades finalizadas já existentes são preservadas (não duplicadas).
    Dependências são resolvidas por número de sequência (não por ID do banco).
    Datas de atividades dependentes são recalculadas em cascata.
    """
    # Edição de atividades apenas com projeto editável
    err = _exigir_editavel(pid)
    if err:
        return err
    data = request.get_json()
    atividades = data.get('atividades', [])
    db = get_db()

    # Busca projeto para inicio
    proj = db.execute("SELECT * FROM projetos WHERE ID = ?", (pid,)).fetchone()
    if not proj:
        return jsonify({'error': 'Projeto não encontrado'}), 404

    # 1) Coleta IDs de atividades finalizadas já existentes no banco
    finalizadas_existentes = db.execute(
        "SELECT ID FROM atividades WHERE Id_projetos = ? AND status = 'Finalizado'",
        (pid,)
    ).fetchall()
    ids_finalizadas = {row['ID'] for row in finalizadas_existentes}

    # 2) Coleta IDs de atividades finalizadas que vêm do cliente
    ids_finalizadas_cliente = set()
    for a in atividades:
        if a.get('status') == 'Finalizado' and a.get('ID'):
            try:
                ids_finalizadas_cliente.add(int(a['ID']))
            except (ValueError, TypeError):
                pass

    # 3) Remove atividades NÃO finalizadas (serão recriadas)
    db.execute("DELETE FROM atividades WHERE Id_projetos = ? AND status != 'Finalizado'", (pid,))

    # 4) Remove finalizadas que NÃO estão na lista do cliente (foram removidas pelo usuário)
    for fid in ids_finalizadas:
        if fid not in ids_finalizadas_cliente:
            db.execute("DELETE FROM atividades WHERE ID = ?", (fid,))
    db.commit()

    # Mapeamento: sequência → novo ID do banco
    seq_to_id = {}

    for idx, a in enumerate(atividades, start=1):
        skip_sat = bool(a.get('Sabado', 1))
        skip_sun = bool(a.get('Domingo', 1))
        duracao = int(a.get('Duracao', 1))

        # Verifica se é uma atividade finalizada que já existe no banco
        if a.get('status') == 'Finalizado' and a.get('ID'):
            try:
                existing_id = int(a['ID'])
            except (ValueError, TypeError):
                existing_id = None
            if existing_id and existing_id in ids_finalizadas:
                # Já existe no banco — apenas atualiza campos não-sensíveis,
                # preservando Finalizacao e Status_Finalizacao
                db.execute("""
                    UPDATE atividades SET
                        sequencia = ?, Atividade = ?, Responsavel = ?,
                        Dependencia = ?, Inicio = ?, Previsao = ?,
                        Duracao = ?, Sabado = ?, Domingo = ?
                    WHERE ID = ?
                """, (
                    idx, a.get('Atividade'), a.get('Responsavel'),
                    None,  # dependência será resolvida depois
                    a.get('Inicio'), a.get('Previsao'),
                    duracao, 1 if skip_sat else 0, 1 if skip_sun else 0,
                    existing_id
                ))
                seq_to_id[idx] = existing_id
                continue

        # Atividade não-finalizada ou finalizada nova → INSERT

        # Inicio (sem dependência por agora, será recalculado na cascata)
        inicio = a.get('Inicio')
        if not inicio:
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
            pid, idx, a.get('Atividade'), a.get('Responsavel'), None,
            inicio, previsao, duracao, a.get('status', 'Novo'),
            a.get('Finalizacao'), a.get('Status_Finalizacao'),
            1 if skip_sat else 0, 1 if skip_sun else 0
        ))
        db.commit()
        seq_to_id[idx] = cur.lastrowid

    # 5) Resolve dependências: sequência → ID do banco
    for idx, a in enumerate(atividades, start=1):
        dep_seq = a.get('Dependencia')
        if dep_seq and dep_seq in seq_to_id:
            dep_db_id = seq_to_id[dep_seq]
            db.execute("UPDATE atividades SET Dependencia = ? WHERE ID = ?",
                       (dep_db_id, seq_to_id[idx]))
    db.commit()

    # 6) Cascata de datas: recalcula Inicio/Previsao de atividades dependentes
    # Ordena por sequência para processar na ordem correta
    all_ativs = db.execute(
        "SELECT * FROM atividades WHERE Id_projetos = ? ORDER BY sequencia", (pid,)
    ).fetchall()

    for a in all_ativs:
        if a['Dependencia']:
            dep = db.execute("SELECT Previsao FROM atividades WHERE ID = ?",
                             (a['Dependencia'],)).fetchone()
            if dep and dep['Previsao']:
                new_inicio = B.next_business_day(
                    dep['Previsao'],
                    bool(a['Sabado']),
                    bool(a['Domingo'])
                ).isoformat()
                if new_inicio != a['Inicio']:
                    new_previsao = B.calcular_previsao_atividade(
                        new_inicio, a['Duracao'] or 1,
                        bool(a['Sabado']), bool(a['Domingo'])
                    )
                    db.execute(
                        "UPDATE atividades SET Inicio = ?, Previsao = ? WHERE ID = ?",
                        (new_inicio, new_previsao, a['ID'])
                    )
    db.commit()

    # Recalcula previsão do projeto
    B.recalcular_previsao_projeto(db, pid)

    return jsonify({'ok': True, 'count': len(atividades)})


@api_bp.route('/atividades/<int:aid>', methods=['PUT'])
def update_atividade(aid):
    db = get_db()
    ativ = db.execute("SELECT Id_projetos FROM atividades WHERE ID = ?", (aid,)).fetchone()
    if not ativ:
        return jsonify({'error': 'Atividade não encontrada'}), 404
    err = _exigir_editavel(ativ['Id_projetos'])
    if err:
        return err
    data = request.get_json()
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
    if not ativ:
        return jsonify({'error': 'Atividade não encontrada'}), 404
    err = _exigir_editavel(ativ['Id_projetos'])
    if err:
        return err
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


@api_bp.route('/projetos/<int:pid>/cancelar', methods=['POST'])
def cancelar_projeto_route(pid):
    data = request.get_json(silent=True) or {}
    db = get_db()
    try:
        B.cancelar_projeto(db, pid, data.get('observacao'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/pausar', methods=['POST'])
def pausar_projeto_route(pid):
    data = request.get_json(silent=True) or {}
    db = get_db()
    try:
        B.pausar_projeto(db, pid, data.get('observacao'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/reativar', methods=['POST'])
def reativar_projeto_route(pid):
    """Reativa um projeto cancelado: projeto e atividades canceladas
    voltam para 'Em Andamento', liberando todas as funcionalidades."""
    data = request.get_json(silent=True) or {}
    db = get_db()
    try:
        B.reativar_projeto(db, pid, data.get('observacao'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/despausar', methods=['POST'])
def despausar_projeto_route(pid):
    """Despausa um projeto pausado: projeto e atividades pausadas
    voltam para 'Em Andamento', liberando todas as funcionalidades."""
    data = request.get_json(silent=True) or {}
    db = get_db()
    try:
        B.despausar_projeto(db, pid, data.get('observacao'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/retornar', methods=['POST'])
def retornar_projeto_route(pid):
    """Retorna um projeto 'Aguardando' ou 'Finalizado' ao fluxo.
    Corpo: { status: 'Novo' | 'Em Andamento', observacao?: string }."""
    data = request.get_json(silent=True) or {}
    db = get_db()
    try:
        B.retornar_projeto(db, pid, data.get('status'), data.get('observacao'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/cobranca', methods=['POST'])
def cobranca_route(pid):
    data = request.get_json()
    db = get_db()
    try:
        B.registrar_cobranca(db, pid, data.get('data'), data.get('observacao', ''))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})


@api_bp.route('/projetos/<int:pid>/atualizacoes', methods=['POST'])
def atualizacao_route(pid):
    data = request.get_json()
    db = get_db()
    try:
        B.registrar_atualizacao(db, pid, data.get('data', B.today_iso()), data.get('observacao', ''))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    # Marca como tipo 'U' (usuário)
    db.execute("""
        UPDATE atualizacoes SET tipo = 'U'
        WHERE Id_projetos = ? AND ID = (SELECT MAX(ID) FROM atualizacoes WHERE Id_projetos = ?)
    """, (pid, pid))
    db.commit()
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


# ──────────────────────────────────────────────────────────────
# Cobrança por Atividade
# ──────────────────────────────────────────────────────────────

@api_bp.route('/atividades/<int:aid>/cobranca', methods=['POST'])
def cobranca_atividade_route(aid):
    """Registra cobrança em uma atividade específica (data=today, obs padrão)."""
    db = get_db()
    ativ = db.execute("SELECT * FROM atividades WHERE ID = ?", (aid,)).fetchone()
    if not ativ:
        return jsonify({'error': 'Atividade não encontrada'}), 404
    st = _status_projeto(db, ativ['Id_projetos'])
    if st not in ('Novo', 'Em Andamento'):
        return jsonify({'error': f"Projeto em status '{st}' não permite cobrança."}), 400

    hoje = B.today_iso()
    observacao = 'Cobrança Realizada'

    db.execute("""
        INSERT INTO cobranca (Id_projetos, Id_Atividade, data, observacao)
        VALUES (?, ?, ?, ?)
    """, (ativ['Id_projetos'], aid, hoje, observacao))
    db.execute("UPDATE atividades SET Cobranca = ? WHERE ID = ?", (hoje, aid))
    db.execute("UPDATE projetos SET cobranca = ? WHERE ID = ?", (hoje, ativ['Id_projetos']))
    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao, tipo)
        VALUES (?, ?, ?, 'S')
    """, (ativ['Id_projetos'], hoje,
          f"Cobrança registrada na atividade {ativ['sequencia']} - {ativ['Atividade']}"))
    db.commit()
    return jsonify({'ok': True})


@api_bp.route('/cobranca/batch', methods=['POST'])
def cobranca_batch_route():
    """Registra cobrança em lote para múltiplas atividades."""
    data = request.get_json()
    atividade_ids = data.get('atividade_ids', [])
    if not atividade_ids:
        return jsonify({'error': 'Nenhuma atividade informada'}), 400

    db = get_db()
    hoje = B.today_iso()
    observacao = 'Cobrança Realizada'
    count = 0

    for aid in atividade_ids:
        ativ = db.execute("SELECT * FROM atividades WHERE ID = ?", (aid,)).fetchone()
        if not ativ:
            continue
        st = _status_projeto(db, ativ['Id_projetos'])
        if st not in ('Novo', 'Em Andamento'):
            continue

        db.execute("""
            INSERT INTO cobranca (Id_projetos, Id_Atividade, data, observacao)
            VALUES (?, ?, ?, ?)
        """, (ativ['Id_projetos'], aid, hoje, observacao))
        db.execute("UPDATE atividades SET Cobranca = ? WHERE ID = ?", (hoje, aid))
        db.execute("UPDATE projetos SET cobranca = ? WHERE ID = ?", (hoje, ativ['Id_projetos']))
        db.execute("""
            INSERT INTO atualizacoes (Id_projetos, Data, Observacao, tipo)
            VALUES (?, ?, ?, 'S')
        """, (ativ['Id_projetos'], hoje,
              f"Cobrança em lote — atividade {ativ['sequencia']} - {ativ['Atividade']}"))
        count += 1

    db.commit()
    return jsonify({'ok': True, 'count': count})


@api_bp.route('/projetos/<int:pid>/atividades/cobrancas', methods=['GET'])
def list_cobrancas_atividades(pid):
    """Lista cobranças de todas as atividades de um projeto."""
    db = get_db()
    rows = db.execute("""
        SELECT c.*, a.sequencia, a.Atividade AS ativ_nome
        FROM cobranca c
        LEFT JOIN atividades a ON a.ID = c.Id_Atividade
        WHERE c.Id_projetos = ?
        ORDER BY c.data DESC, c.ID DESC
    """, (pid,)).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


# ──────────────────────────────────────────────────────────────
# Exportar PDF do Projeto
# ──────────────────────────────────────────────────────────────
import os, time, hashlib

# Pasta de exportação dentro do projeto
EXPORT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'exports')

@api_bp.route('/projetos/<int:pid>/pdf', methods=['POST'])
def export_pdf_route(pid):
    """Gera PDF da ficha do projeto e salva em disco. Retorna URL para download."""
    data = request.get_json() or {}
    incluir_atualizacoes = bool(data.get('atualizacoes', False))
    incluir_cobrancas = bool(data.get('cobrancas', False))
    db = get_db()

    p = db.execute("SELECT * FROM projetos WHERE ID = ?", (pid,)).fetchone()
    if not p:
        return jsonify({'error': 'Projeto não encontrado'}), 404

    atividades = db.execute(
        "SELECT * FROM atividades WHERE Id_projetos = ? ORDER BY sequencia", (pid,)
    ).fetchall()

    atualizacoes = []
    if incluir_atualizacoes:
        atualizacoes = db.execute(
            "SELECT * FROM atualizacoes WHERE Id_projetos = ? ORDER BY Data DESC, ID DESC", (pid,)
        ).fetchall()

    cobrancas = []
    if incluir_cobrancas:
        cobrancas = db.execute(
            "SELECT * FROM cobranca WHERE Id_projetos = ? ORDER BY data DESC", (pid,)
        ).fetchall()

    # Mapa ID→sequência para dependências
    id_to_seq = {a['ID']: a['sequencia'] for a in atividades}

    html = _build_pdf_html(p, atividades, atualizacoes, cobrancas, id_to_seq)

    from xhtml2pdf import pisa
    import io
    pdf_buffer = io.BytesIO()
    status = pisa.CreatePDF(html, dest=pdf_buffer)
    if status.err:
        return jsonify({'error': 'Erro ao gerar PDF'}), 500

    # Salva em disco
    os.makedirs(EXPORT_DIR, exist_ok=True)
    titulo = (p['Titulo'] or 'projeto').strip()[:60]
    safe_name = ''.join(c if c.isalnum() or c in ' _-' else '_' for c in titulo)
    filename = f'Projeto_{pid}_{safe_name}.pdf'
    filepath = os.path.join(EXPORT_DIR, filename)
    pdf_buffer.seek(0)
    with open(filepath, 'wb') as f:
        f.write(pdf_buffer.read())

    return jsonify({
        'ok': True,
        'filename': filename,
        'download_url': f'/api/exports/{filename}',
        'filepath': filepath,
    })


@api_bp.route('/exports/<filename>', methods=['GET'])
def download_export(filename):
    """Serve arquivos exportados para download."""
    from flask import send_from_directory
    if not os.path.isfile(os.path.join(EXPORT_DIR, filename)):
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    return send_from_directory(EXPORT_DIR, filename, as_attachment=True)


@api_bp.route('/exports/gantt', methods=['POST'])
def export_gantt_route():
    """Recebe imagem do Gantt em base64, salva e retorna URL de download."""
    import base64
    data = request.get_json()
    if not data or not data.get('image'):
        return jsonify({'error': 'Dados da imagem não informados'}), 400

    image_b64 = data['image']  # data:image/png;base64,...
    filename = data.get('filename', 'gantt.png')

    # Remove o prefixo data:image/...;base64,
    if ',' in image_b64:
        image_b64 = image_b64.split(',', 1)[1]

    os.makedirs(EXPORT_DIR, exist_ok=True)
    filepath = os.path.join(EXPORT_DIR, filename)
    with open(filepath, 'wb') as f:
        f.write(base64.b64decode(image_b64))

    return jsonify({
        'ok': True,
        'filename': filename,
        'download_url': f'/api/exports/{filename}',
    })


def _build_pdf_html(projeto, atividades, atualizacoes, cobrancas, id_to_seq):
    """Monta o HTML para conversão em PDF."""
    from app.business import format_date_br, calcular_situacao

    p = projeto
    sit = calcular_situacao(p['Status'], p['Previsao'], p['Finalizacao'])

    def esc(s):
        if s is None:
            return ''
        return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    # Tabela de atividades
    ativ_rows = ''
    for a in atividades:
        dep_label = str(id_to_seq.get(a['Dependencia'], '—')) if a['Dependencia'] else '—'
        sit_ativ = calcular_situacao(a['status'], a['Previsao'], a['Finalizacao'])
        ativ_rows += f'''
        <tr>
            <td style="text-align:center">{a["sequencia"]}</td>
            <td>{esc(a["Atividade"])}</td>
            <td>{esc(a["Responsavel"])}</td>
            <td style="text-align:center">{dep_label}</td>
            <td style="text-align:center">{format_date_br(a["Inicio"])}</td>
            <td style="text-align:center">{format_date_br(a["Previsao"])}</td>
            <td style="text-align:center">{a["Duracao"] or 1}</td>
            <td style="text-align:center">{esc(a["status"])}</td>
            <td style="text-align:center">{format_date_br(a["Finalizacao"])}</td>
            <td style="text-align:center">{esc(sit_ativ)}</td>
        </tr>'''

    if not ativ_rows:
        ativ_rows = '<tr><td colspan="10" style="text-align:center;padding:12px;color:#888;">Nenhuma atividade cadastrada.</td></tr>'

    # Atualizações
    atual_html = ''
    if atualizacoes:
        atual_items = ''
        for a in atualizacoes:
            atual_items += f'<p style="margin:4px 0;"><strong>{format_date_br(a["Data"])}:</strong> {esc(a["Observacao"])}</p>'
        atual_html = f'''
        <div style="margin-top:20px;">
            <h3 style="background:#36373D;color:#fff;padding:8px 12px;font-size:13px;margin:0;">ATUALIZAÇÕES</h3>
            <div style="border:1px solid #ddd;padding:12px;font-size:11px;">{atual_items}</div>
        </div>'''

    # Cobranças
    cobr_html = ''
    if cobrancas:
        cobr_items = ''
        for c in cobrancas:
            cobr_items += f'<p style="margin:4px 0;"><strong>{format_date_br(c["data"])}:</strong> {esc(c["observacao"])}</p>'
        cobr_html = f'''
        <div style="margin-top:20px;">
            <h3 style="background:#36373D;color:#fff;padding:8px 12px;font-size:13px;margin:0;">COBRANÇAS</h3>
            <div style="border:1px solid #ddd;padding:12px;font-size:11px;">{cobr_items}</div>
        </div>'''

    html = f'''
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <style>
        @page {{ size: A4 landscape; margin: 15mm; }}
        body {{ font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #1a1a1a; }}
        h1 {{ font-size: 20px; margin: 0 0 4px; color: #36373D; }}
        h2 {{ font-size: 14px; margin: 16px 0 8px; color: #36373D; border-bottom: 2px solid #E7D264; padding-bottom: 4px; }}
        .header-bar {{ background: #36373D; color: #fff; padding: 12px 16px; margin-bottom: 16px; }}
        .header-bar h1 {{ color: #fff; font-size: 18px; }}
        .header-bar .meta {{ font-size: 11px; color: #cccccc; margin-top: 4px; }}
        .dados-grid {{ display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 12px; }}
        .dados-grid .item {{ min-width: 180px; }}
        .dados-grid .item label {{ font-size: 10px; color: #888; text-transform: uppercase; display: block; }}
        .dados-grid .item span {{ font-size: 12px; font-weight: 600; }}
        .textarea-block {{ margin-bottom: 10px; }}
        .textarea-block label {{ font-size: 10px; color: #888; text-transform: uppercase; display: block; margin-bottom: 2px; }}
        .textarea-block .content {{ border: 1px solid #ddd; padding: 8px; font-size: 11px; min-height: 40px; background: #fafafa; white-space: pre-wrap; }}
        table {{ width: 100%; font-size: 10px; }}
        table th {{ background: #36373D; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; border: 1px solid #36373D; }}
        table td {{ padding: 5px 8px; border: 1px solid #e5e7eb; }}
        table tr td {{ background: #ffffff; }}
        .footer {{ margin-top: 20px; font-size: 9px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 6px; }}
    </style>
    </head>
    <body>
        <div class="header-bar">
            <h1>FICHA DO PROJETO #{p["ID"]}</h1>
            <div class="meta">{esc(p["Titulo"])} — {esc(p["Status"])} — {esc(sit)}</div>
        </div>

        <h2>DADOS DO PROJETO</h2>
        <div class="dados-grid">
            <div class="item"><label>Código</label><span>#{p["ID"]}</span></div>
            <div class="item"><label>Título</label><span>{esc(p["Titulo"])}</span></div>
            <div class="item"><label>Responsável</label><span>{esc(p["Responsavel"])}</span></div>
            <div class="item"><label>Setor</label><span>{esc(p["Setor"])}</span></div>
            <div class="item"><label>Tipo</label><span>{esc(p["Tipo"])}</span></div>
            <div class="item"><label>Status</label><span>{esc(p["Status"])}</span></div>
            <div class="item"><label>Situação</label><span>{esc(sit)}</span></div>
            <div class="item"><label>Início</label><span>{format_date_br(p["Inicio"])}</span></div>
            <div class="item"><label>Previsão</label><span>{format_date_br(p["Previsao"])}</span></div>
            <div class="item"><label>Finalização</label><span>{format_date_br(p["Finalizacao"])}</span></div>
        </div>

        <div class="textarea-block">
            <label>Descrição</label>
            <div class="content">{esc(p["Descricao"] or '—')}</div>
        </div>
        <div class="textarea-block">
            <label>Resolução Final</label>
            <div class="content">{esc(p["Resolucao_Final"] or '—')}</div>
        </div>
        <div class="textarea-block">
            <label>Observação Geral</label>
            <div class="content">{esc(p["Observacao_Geral"] or '—')}</div>
        </div>

        <h2>ATIVIDADES</h2>
        <table>
            <thead>
                <tr>
                    <th style="text-align:center;width:30px">#</th>
                    <th>Atividade</th>
                    <th>Responsável</th>
                    <th style="text-align:center;width:40px">Dep.</th>
                    <th style="text-align:center;width:70px">Início</th>
                    <th style="text-align:center;width:70px">Previsão</th>
                    <th style="text-align:center;width:35px">Dur.</th>
                    <th style="text-align:center;width:80px">Status</th>
                    <th style="text-align:center;width:70px">Finalização</th>
                    <th style="text-align:center;width:100px">Situação</th>
                </tr>
            </thead>
            <tbody>{ativ_rows}</tbody>
        </table>

        {atual_html}
        {cobr_html}

        <div class="footer">Gerado em {{data_geracao}} — Sistema de Controle de Projeto</div>
    </body>
    </html>
    '''

    from datetime import datetime
    html = html.replace('{data_geracao}', datetime.now().strftime('%d/%m/%Y %H:%M'))
    return html


# ──────────────────────────────────────────────────────────────
# Configuração de E-mail
# ──────────────────────────────────────────────────────────────

@api_bp.route('/config/email', methods=['GET'])
def get_email_config():
    from app.email_sender import load_config, outlook_diagnostics
    config = load_config()
    diag = outlook_diagnostics()
    outlook_ok = diag.get('com', False)
    metodo = config.get('metodo', 'auto')
    # Determina se está configurado
    if metodo == 'outlook' or (metodo == 'auto' and outlook_ok):
        configured = True
    else:
        configured = bool(config.get('email') and config.get('password'))
    return jsonify({
        'smtp_server': config.get('smtp_server', 'smtp.office365.com'),
        'smtp_port': config.get('smtp_port', 587),
        'email': config.get('email', ''),
        'nome_remetente': config.get('nome_remetente', ''),
        'metodo': metodo,
        'outlook_disponivel': outlook_ok,
        'outlook_detalhe': diag,
        'configured': configured,
    })


@api_bp.route('/config/email', methods=['POST'])
def save_email_config():
    from app.email_sender import load_config, save_config
    data = request.get_json()
    config = load_config()
    if 'smtp_server' in data:
        config['smtp_server'] = data['smtp_server']
    if 'smtp_port' in data:
        config['smtp_port'] = int(data['smtp_port'])
    if 'email' in data:
        config['email'] = data['email']
    if 'password' in data and data['password']:  # só atualiza se não vazio
        config['password'] = data['password']
    if 'nome_remetente' in data:
        config['nome_remetente'] = data['nome_remetente']
    if 'metodo' in data:
        config['metodo'] = data['metodo']
    save_config(config)
    return jsonify({'ok': True})


@api_bp.route('/config/email/test', methods=['POST'])
def test_email_config():
    from app.email_sender import send_email
    data = request.get_json()
    to = data.get('to', '')
    if not to:
        return jsonify({'error': 'Informe um e-mail de destino para teste'}), 400
    result = send_email(
        [to],
        'Teste - Sistema de Controle de Projeto',
        '<p>Este é um e-mail de teste do Sistema de Controle de Projeto.</p><p>Se você recebeu esta mensagem, a configuração está funcionando corretamente.</p>',
    )
    if result.get('ok'):
        return jsonify({'ok': True, 'message': 'E-mail de teste enviado com sucesso!'})
    return jsonify(result), 400


# ──────────────────────────────────────────────────────────────
# Enviar E-mail do Projeto
# ──────────────────────────────────────────────────────────────

@api_bp.route('/projetos/<int:pid>/enviar-email', methods=['POST'])
def enviar_email_projeto(pid):
    """Envia e-mail de abertura do projeto para todos os responsáveis envolvidos."""
    from app.email_sender import send_email, load_config
    from app.business import format_date_br, calcular_situacao
    data = request.get_json() or {}
    incluir_gantt = bool(data.get('incluir_gantt', False))
    gantt_image_b64 = data.get('gantt_image', None)  # base64 data URL
    db = get_db()

    # Busca projeto
    p = db.execute("SELECT * FROM projetos WHERE ID = ?", (pid,)).fetchone()
    if not p:
        return jsonify({'error': 'Projeto não encontrado'}), 404

    # Busca atividades
    atividades = db.execute(
        "SELECT * FROM atividades WHERE Id_projetos = ? ORDER BY sequencia", (pid,)
    ).fetchall()

    # Coleta e-mails dos responsáveis (projeto + atividades)
    emails_set = set()
    responsavel_projeto = p['Responsavel'] or ''

    # Busca e-mail do responsável do projeto
    if responsavel_projeto:
        resp_row = db.execute(
            "SELECT email FROM responsaveis WHERE Nome = ?", (responsavel_projeto,)
        ).fetchone()
        if resp_row and resp_row['email']:
            emails_set.add(resp_row['email'].strip())

    # Busca e-mails dos responsáveis das atividades
    for a in atividades:
        resp_nome = a['Responsavel'] or ''
        if resp_nome:
            resp_row = db.execute(
                "SELECT email FROM responsaveis WHERE Nome = ?", (resp_nome,)
            ).fetchone()
            if resp_row and resp_row['email']:
                emails_set.add(resp_row['email'].strip())

    if not emails_set:
        return jsonify({'error': 'Nenhum responsável com e-mail cadastrado. Cadastre e-mails na tela de Responsáveis.'}), 400

    # Gera PDF
    id_to_seq = {a['ID']: a['sequencia'] for a in atividades}
    html_pdf = _build_pdf_html(p, atividades, [], [], id_to_seq)
    from xhtml2pdf import pisa
    import io
    pdf_buffer = io.BytesIO()
    pisa.CreatePDF(html_pdf, dest=pdf_buffer)
    pdf_buffer.seek(0)
    pdf_data = pdf_buffer.read()

    titulo = (p['Titulo'] or 'projeto').strip()[:60]
    safe_name = ''.join(c if c.isalnum() or c in ' _-' else '_' for c in titulo)

    attachments = [{
        'filename': f'Projeto_{pid}_{safe_name}.pdf',
        'data': pdf_data,
        'mimetype': 'application/pdf',
    }]

    # Gantt (opcional)
    if incluir_gantt and gantt_image_b64:
        import base64
        b64_str = gantt_image_b64
        ext = 'png'
        if ',' in b64_str:
            header, b64_str = b64_str.split(',', 1)
            if 'jpeg' in header:
                ext = 'jpg'
        img_data = base64.b64decode(b64_str)
        attachments.append({
            'filename': f'Gantt_Projeto_{pid}.{ext}',
            'data': img_data,
            'mimetype': f'image/{ext}',
        })

    # Monta o corpo do e-mail
    config = load_config()
    from datetime import datetime
    data_hoje = datetime.now().strftime('%d/%m/%Y')

    # Lista de atividades para o e-mail
    ativ_html = ''
    for a in atividades:
        dep_label = str(id_to_seq.get(a['Dependencia'], '—')) if a['Dependencia'] else '—'
        ativ_html += f'''
        <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">{a["sequencia"]}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee">{(a["Atividade"] or "").replace("<", "&lt;")}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee">{(a["Responsavel"] or "—").replace("<", "&lt;")}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">{format_date_br(a["Inicio"])}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">{format_date_br(a["Previsao"])}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">{a["Duracao"] or 1} dia(s)</td>
        </tr>'''

    email_html = f'''
    <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:700px;margin:0 auto;color:#1a1a1a">
        <div style="background:#36373D;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
            <h1 style="margin:0;font-size:20px;font-weight:600">Novo Projeto Aberto</h1>
            <p style="margin:6px 0 0;font-size:13px;opacity:0.9">{data_hoje}</p>
        </div>

        <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none">
            <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
                Olá, tudo bem?
            </p>
            <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
                O projeto <strong style="color:#36373D">{(p["Titulo"] or "").replace("<", "&lt;")}</strong> acabou de ser aberto e você está entre os colaboradores envolvidos.
            </p>
            <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
                Seguem abaixo os dados principais e as atividades que foram definidas. Peço que verifiquem seus prazos e se organizem para cumprir os cronogramas estabelecidos. Qualquer divergência ou necessidade de ajuste, por favor me avisem o quanto antes para que possamos alinhar.
            </p>
            <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
            O compromisso de cada um com os prazos faz toda a diferença para o resultado final. Conto com a colaboração de todos.
            </p>

            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:20px">
                <h3 style="margin:0 0 12px;font-size:15px;color:#36373D;border-bottom:2px solid #E7D264;padding-bottom:6px">Dados do Projeto</h3>
                <table style="width:100%;font-size:13px">
                    <tr><td style="padding:4px 0;color:#6b7280;width:120px">Código</td><td style="padding:4px 0;font-weight:600">#{p["ID"]}</td></tr>
                    <tr><td style="padding:4px 0;color:#6b7280">Responsável</td><td style="padding:4px 0">{(p["Responsavel"] or "—").replace("<", "&lt;")}</td></tr>
                    <tr><td style="padding:4px 0;color:#6b7280">Setor</td><td style="padding:4px 0">{(p["Setor"] or "—").replace("<", "&lt;")}</td></tr>
                    <tr><td style="padding:4px 0;color:#6b7280">Tipo</td><td style="padding:4px 0">{(p["Tipo"] or "—").replace("<", "&lt;")}</td></tr>
                    <tr><td style="padding:4px 0;color:#6b7280">Início</td><td style="padding:4px 0">{format_date_br(p["Inicio"])}</td></tr>
                    <tr><td style="padding:4px 0;color:#6b7280">Previsão</td><td style="padding:4px 0;font-weight:600">{format_date_br(p["Previsao"])}</td></tr>
                </table>
            </div>

            <h3 style="margin:0 0 12px;font-size:15px;color:#36373D;border-bottom:2px solid #E7D264;padding-bottom:6px">Atividades</h3>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead>
                    <tr style="background:#36373D;color:#fff">
                        <th style="padding:8px 10px;text-align:left">#</th>
                        <th style="padding:8px 10px;text-align:left">Atividade</th>
                        <th style="padding:8px 10px;text-align:left">Responsável</th>
                        <th style="padding:8px 10px;text-align:center">Início</th>
                        <th style="padding:8px 10px;text-align:center">Previsão</th>
                        <th style="padding:8px 10px;text-align:center">Duração</th>
                    </tr>
                </thead>
                <tbody>{ativ_html}</tbody>
            </table>

            <p style="font-size:13px;color:#6b7280;margin:20px 0 0;line-height:1.5">
                Em anexo, o PDF completo do projeto{", além do gráfico de Gantt com o cronograma visual." if incluir_gantt else "."}
            </p>
        </div>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:14px 24px;border-radius:0 0 8px 8px;font-size:11px;color:#9ca3af;text-align:center">
            Esta mensagem foi enviada automaticamente pelo Sistema de Controle de Projeto.
        </div>
    </div>
    '''

    assunto = f'[{p["Status"]}] Projeto #{p["ID"]} — {(p["Titulo"] or "").replace("<", "&lt;")}'

    result = send_email(
        list(emails_set),
        assunto,
        email_html,
        attachments=attachments,
    )

    if result.get('ok'):
        # Registra no histórico
        db.execute("""
            INSERT INTO atualizacoes (Id_projetos, Data, Observacao, tipo)
            VALUES (?, ?, ?, 'S')
        """, (pid, B.today_iso(),
              f"E-mail de abertura enviado para: {', '.join(emails_set)}"))
        db.commit()
        return jsonify({
            'ok': True,
            'message': f'E-mail enviado com sucesso para {len(emails_set)} destinatário(s).',
            'destinatarios': list(emails_set),
        })
    return jsonify(result), 400


# ──────────────────────────────────────────────────────────────
# Modelos de Atividades
# ──────────────────────────────────────────────────────────────

@api_bp.route('/modelos', methods=['GET'])
def list_modelos():
    db = get_db()
    rows = db.execute("SELECT * FROM modelo_atividades ORDER BY Nome").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@api_bp.route('/modelos', methods=['POST'])
def create_modelo():
    data = request.get_json()
    db = get_db()
    cur = db.execute("INSERT INTO modelo_atividades (Nome) VALUES (?)", (data.get('Nome'),))
    db.commit()
    return jsonify({'ID': cur.lastrowid, **data}), 201


@api_bp.route('/modelos/<int:mid>', methods=['GET'])
def get_modelo(mid):
    db = get_db()
    m = db.execute("SELECT * FROM modelo_atividades WHERE ID = ?", (mid,)).fetchone()
    if not m:
        return jsonify({'error': 'Modelo não encontrado'}), 404
    atividades = db.execute(
        "SELECT * FROM lista_atividades WHERE Id_modelo_atividades = ? ORDER BY sequencia",
        (mid,)
    ).fetchall()
    return jsonify({
        'modelo': row_to_dict(m),
        'atividades': [row_to_dict(a) for a in atividades],
    })


@api_bp.route('/modelos/<int:mid>', methods=['PUT'])
def update_modelo(mid):
    data = request.get_json()
    db = get_db()
    db.execute("UPDATE modelo_atividades SET Nome = ? WHERE ID = ?", (data.get('Nome'), mid))
    db.commit()
    return jsonify({'ID': mid, **data})


@api_bp.route('/modelos/<int:mid>', methods=['DELETE'])
def delete_modelo(mid):
    db = get_db()
    db.execute("DELETE FROM modelo_atividades WHERE ID = ?", (mid,))
    db.commit()
    return jsonify({'ok': True})


@api_bp.route('/modelos/<int:mid>/atividades', methods=['GET'])
def list_modelo_atividades(mid):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM lista_atividades WHERE Id_modelo_atividades = ? ORDER BY sequencia",
        (mid,)
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@api_bp.route('/modelos/<int:mid>/atividades', methods=['POST'])
def save_modelo_atividades(mid):
    """Substitui todas as atividades do modelo pela lista enviada."""
    data = request.get_json()
    atividades = data.get('atividades', [])
    db = get_db()

    # Remove as existentes
    db.execute("DELETE FROM lista_atividades WHERE Id_modelo_atividades = ?", (mid,))
    db.commit()

    # Mapeia sequência → novo ID (para resolver dependências)
    seq_to_id = {}

    for idx, a in enumerate(atividades, start=1):
        cur = db.execute("""
            INSERT INTO lista_atividades
            (sequencia, Atividade, Dependencia, Responsavel, Duracao, Id_modelo_atividades)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            idx,
            a.get('Atividade'),
            None,  # dependência resolvida depois
            a.get('Responsavel'),
            int(a.get('Duracao', 1)),
            mid
        ))
        db.commit()
        seq_to_id[idx] = cur.lastrowid

    # Resolve dependências: sequência → ID do banco
    for idx, a in enumerate(atividades, start=1):
        dep_seq = a.get('Dependencia')
        if dep_seq and int(dep_seq) in seq_to_id:
            db.execute(
                "UPDATE lista_atividades SET Dependencia = ? WHERE ID = ?",
                (seq_to_id[int(dep_seq)], seq_to_id[idx])
            )
    db.commit()

    return jsonify({'ok': True, 'count': len(atividades)})
