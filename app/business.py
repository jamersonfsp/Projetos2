"""
Regras de negócio do Sistema de Controle de Projeto.

Contém:
- Cálculo de situação (No prazo / Atrasado / Finalizado em Dia / Finalizado em Atrasado)
- Cálculo de dias úteis (desconsiderando sábado e domingo conforme flags)
- Cálculo de previsão de atividade
- Geração do Relatório Diário (atrasadas, do dia, sem cobrança há >2 dias úteis)
- Helpers de data
"""
from datetime import datetime, timedelta


# ──────────────────────────────────────────────────────────────
# Helpers de data
# ──────────────────────────────────────────────────────────────

def parse_date(s):
    """Converte 'YYYY-MM-DD' para datetime.date. Retorna None se vazio/inválido."""
    if not s:
        return None
    try:
        return datetime.strptime(s, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def format_date_br(d):
    """Converte date ou 'YYYY-MM-DD' para 'DD/MM/YYYY'."""
    if not d:
        return ''
    if isinstance(d, str):
        d = parse_date(d)
        if not d:
            return ''
    return d.strftime('%d/%m/%Y')


def today():
    """Data de hoje (date)."""
    return datetime.now().date()


def today_iso():
    return today().isoformat()


# ──────────────────────────────────────────────────────────────
# Cálculo de dias úteis
# ──────────────────────────────────────────────────────────────

def add_business_days(start_date, days, skip_saturday=True, skip_sunday=True):
    """
    Adiciona `days` dias úteis a partir de `start_date` (inclusive).
    Sábado/domingo são pulados conforme as flags.
    Para duração: o dia de início conta como dia 1, então somamos (days-1) dias úteis.
    """
    if start_date is None:
        return None
    if not isinstance(start_date, datetime):
        start_date = parse_date(start_date) if isinstance(start_date, str) else start_date
    if days <= 0:
        return start_date
    # days=1 => o próprio start_date conta. days=2 => próximo dia útil, etc.
    count = 1
    current = start_date
    while count < days:
        current = current + timedelta(days=1)
        wd = current.weekday()  # 5=sáb, 6=dom
        if wd == 5 and skip_saturday:
            continue
        if wd == 6 and skip_sunday:
            continue
        count += 1
    return current


def next_business_day(d, skip_saturday=True, skip_sunday=True):
    """Próximo dia útil após `d`."""
    if d is None:
        return None
    if isinstance(d, str):
        d = parse_date(d)
    current = d + timedelta(days=1)
    while True:
        wd = current.weekday()
        if wd == 5 and skip_saturday:
            current += timedelta(days=1)
            continue
        if wd == 6 and skip_sunday:
            current += timedelta(days=1)
            continue
        return current


def business_days_between(d_start, d_end, skip_saturday=True, skip_sunday=True):
    """Conta dias úteis entre d_start e d_end (inclusive ambos)."""
    if not d_start or not d_end:
        return 0
    if isinstance(d_start, str):
        d_start = parse_date(d_start)
    if isinstance(d_end, str):
        d_end = parse_date(d_end)
    if d_start > d_end:
        return 0
    count = 0
    current = d_start
    while current <= d_end:
        wd = current.weekday()
        if (wd == 5 and skip_saturday) or (wd == 6 and skip_sunday):
            current += timedelta(days=1)
            continue
        count += 1
        current += timedelta(days=1)
    return count


# ──────────────────────────────────────────────────────────────
# Cálculo de Situação
# ──────────────────────────────────────────────────────────────

def calcular_situacao(status, previsao, finalizacao):
    """
    Retorna uma das strings:
    - 'No prazo'
    - 'Atrasado'
    - 'Finalizado em Dia'
    - 'Finalizado em Atrasado'
    - '' (não se aplica)
    """
    prev = parse_date(previsao)
    fin = parse_date(finalizacao)
    hoje = today()

    if status in ('Novo', 'Em Andamento'):
        if not prev:
            return ''
        if prev > hoje:
            return 'No prazo'
        if prev < hoje:
            return 'Atrasado'
        # igual a hoje → consideramos No prazo mas com atenção
        return 'No prazo'

    if status == 'Finalizado':
        if not prev or not fin:
            return ''
        if prev >= fin:
            return 'Finalizado em Dia'
        if prev < fin:
            return 'Finalizado em Atrasado'

    return ''


def situacao_atividade(row):
    """Atalho: recebe um dict/Row de atividade e devolve a situacao."""
    return calcular_situacao(
        row.get('status') or row.get('Status'),
        row.get('Previsao') or row.get('previsao'),
        row.get('Finalizacao') or row.get('finalizacao'),
    )


def situacao_projeto(row):
    """Atalho: recebe um dict/Row de projeto e devolve a situacao."""
    return calcular_situacao(
        row.get('Status'),
        row.get('Previsao'),
        row.get('Finalizacao'),
    )


# ──────────────────────────────────────────────────────────────
# Cálculo de Previsão de atividade
# ──────────────────────────────────────────────────────────────

def calcular_previsao_atividade(inicio, duracao, skip_saturday=True, skip_sunday=True):
    """Previsao = inicio + (duracao) dias úteis."""
    if not inicio or not duracao:
        return inicio
    d_ini = parse_date(inicio)
    if not d_ini:
        return None
    result = add_business_days(d_ini, int(duracao), skip_saturday, skip_sunday)
    return result.isoformat() if result else None


def calcular_inicio_atividade(dependencia_previsao, projeto_inicio, has_dependencia,
                              skip_saturday=True, skip_sunday=True):
    """
    Se tem dependência: inicio = próximo dia útil após previsao(dependência).
    Senão: inicio = projeto_inicio.
    """
    if has_dependencia and dependencia_previsao:
        d = parse_date(dependencia_previsao)
        if d:
            return next_business_day(d, skip_saturday, skip_sunday).isoformat()
    return projeto_inicio


# ──────────────────────────────────────────────────────────────
# Relatório Diário
# ──────────────────────────────────────────────────────────────

def relatorio_diario(db):
    """
    Retorna a lista de atividades a tratar no dia, conforme regras:

    Filtro geral:
    - Atividades com dependência em atividade NÃO finalizada são excluídas.

    Regras por faixa de dias (Previsao - hoje, em dias corridos):
    0. Previsão > 30 dias  → NÃO entra na lista.
    1. Previsão entre 16-30 dias → entra apenas se NÃO houve cobrança nos
       últimos 15 dias úteis.
    2. Previsão < 0 (atrasada) → entra, exceto se já cobrada hoje.
    3. Previsão = 0 (vence hoje) → entra, exceto se já cobrada hoje.
    4. Previsão 1-15 dias → entra se sem cobrança há >2 dias úteis.
    """
    hoje = today()
    hoje_iso = hoje.isoformat()

    # Busca todas as atividades relevantes (Novo/Em Andamento) com dados do projeto
    rows = db.execute("""
        SELECT a.ID            AS ativ_id,
               a.Atividade     AS ativ_nome,
               a.Previsao      AS ativ_previsao,
               a.Responsavel   AS ativ_responsavel,
               a.sequencia     AS sequencia,
               a.Dependencia   AS ativ_dep_id,
               p.ID            AS proj_id,
               p.Titulo        AS proj_titulo,
               p.Responsavel   AS proj_responsavel,
               p.cobranca      AS proj_cobranca,
               p.Status        AS proj_status
        FROM atividades a
        JOIN projetos p ON p.ID = a.Id_projetos
        WHERE a.status IN ('Novo', 'Em Andamento')
          AND a.Previsao IS NOT NULL
          AND a.Previsao != ''
        ORDER BY a.Previsao ASC
    """).fetchall()

    lista = []

    for r in rows:
        prev = parse_date(r['ativ_previsao'])
        if not prev:
            continue

        dias_corridos = (prev - hoje).days

        # ── Filtro 0: Previsão > 30 dias → não entra ──
        if dias_corridos > 30:
            continue

        # ── Filtro: dependência não finalizada → não entra ──
        if r['ativ_dep_id']:
            dep = db.execute(
                "SELECT status FROM atividades WHERE ID = ?",
                (r['ativ_dep_id'],)
            ).fetchone()
            if dep and dep['status'] != 'Finalizado':
                continue

        motivo = None
        cob = parse_date(r['proj_cobranca'])

        # ── Faixa 16-30 dias: entra só se sem cobrança nos últimos 15 dias úteis ──
        if 16 <= dias_corridos <= 30:
            if cob:
                dias_uteis_desde_cob = business_days_between(
                    cob, hoje, skip_saturday=True, skip_sunday=True
                )
                if dias_uteis_desde_cob <= 15:
                    continue  # cobrança recente, não entra
            motivo = 'Monitoramento (+15 dias)'

        # ── Atrasada (previsão < hoje) ──
        elif dias_corridos < 0:
            if cob and cob == hoje:
                continue  # já cobrada hoje
            motivo = 'Atrasada'

        # ── Vence hoje ──
        elif dias_corridos == 0:
            if cob and cob == hoje:
                continue  # já cobrada hoje
            motivo = 'Vence hoje'

        # ── 1 a 15 dias: regra de 2 dias úteis ──
        else:
            if cob is None:
                motivo = 'Sem cobrança registrada'
            else:
                dias_uteis = business_days_between(
                    cob, hoje, skip_saturday=True, skip_sunday=True
                )
                if dias_uteis > 2:
                    motivo = f'Sem cobrança há {dias_uteis} dias úteis'
                else:
                    continue  # cobrança recente, não entra

        lista.append({
            'ativ_id': r['ativ_id'],
            'proj_id': r['proj_id'],
            'proj_titulo': r['proj_titulo'],
            'proj_responsavel': r['proj_responsavel'],
            'ativ_nome': r['ativ_nome'],
            'ativ_previsao': r['ativ_previsao'],
            'ativ_previsao_br': format_date_br(r['ativ_previsao']),
            'ativ_responsavel': r['ativ_responsavel'],
            'dias': dias_corridos,
            'motivo': motivo,
        })

    return lista


# ──────────────────────────────────────────────────────────────
# Dashboard
# ──────────────────────────────────────────────────────────────

def dashboard_stats(db, filtros=None):
    """
    Retorna estatísticas para o Dashboard aplicando filtros.
    filtros: dict com chaves opcionais: inicio, previsao, termino, responsavel, status
    """
    where = []
    args = []

    if filtros:
        if filtros.get('inicio'):
            where.append("p.Inicio >= ?")
            args.append(filtros['inicio'])
        if filtros.get('previsao'):
            where.append("p.Previsao <= ?")
            args.append(filtros['previsao'])
        if filtros.get('termino'):
            where.append("p.Finalizacao <= ?")
            args.append(filtros['termino'])
        if filtros.get('responsavel'):
            where.append("p.Responsavel = ?")
            args.append(filtros['responsavel'])
        if filtros.get('status'):
            # pode ser lista
            statuses = filtros['status'] if isinstance(filtros['status'], list) else [filtros['status']]
            placeholders = ','.join('?' * len(statuses))
            where.append(f"p.Status IN ({placeholders})")
            args.extend(statuses)

    where_clause = ('WHERE ' + ' AND '.join(where)) if where else ''

    hoje = today()

    rows = db.execute(f"""
        SELECT p.*,
               (SELECT COUNT(*) FROM atividades a WHERE a.Id_projetos = p.ID) AS total_ativ
        FROM projetos p
        {where_clause}
        ORDER BY p.ID DESC
    """, args).fetchall()

    total = len(rows)
    em_dia = 0
    atrasados = 0
    finalizados = 0
    finalizados_em_dia = 0
    finalizados_em_atraso = 0

    timeline = []  # para o gráfico de linha

    for r in rows:
        situacao = calcular_situacao(r['Status'], r['Previsao'], r['Finalizacao'])
        if r['Status'] == 'Finalizado':
            finalizados += 1
            if situacao == 'Finalizado em Dia':
                finalizados_em_dia += 1
            elif situacao == 'Finalizado em Atrasado':
                finalizados_em_atraso += 1
        elif r['Status'] in ('Novo', 'Em Andamento'):
            if situacao == 'No prazo':
                em_dia += 1
            elif situacao == 'Atrasado':
                atrasados += 1
        # Aguardando/Pausado/Cancelado não entram nas contagens principais

    pct_atrasados = round((atrasados / total * 100), 1) if total > 0 else 0.0

    # Tabela por responsável
    resp_rows = db.execute(f"""
        SELECT p.Responsavel AS responsavel,
               SUM(CASE WHEN p.Status = 'Novo' THEN 1 ELSE 0 END) AS novos,
               SUM(CASE WHEN p.Status = 'Em Andamento' THEN 1 ELSE 0 END) AS em_andamento,
               SUM(CASE WHEN p.Status = 'Finalizado' THEN 1 ELSE 0 END) AS finalizados,
               COUNT(*) AS total
        FROM projetos p
        {where_clause}
        GROUP BY p.Responsavel
        ORDER BY p.Responsavel
    """, args).fetchall()

    tabela_responsavel = [dict(r) for r in resp_rows]

    # Timeline por mês (últimos 12 meses a partir do primeiro projeto)
    timeline_rows = db.execute(f"""
        SELECT substr(p.Inicio, 1, 7) AS mes,
               COUNT(*) AS total,
               SUM(CASE WHEN p.Status = 'Finalizado' THEN 1 ELSE 0 END) AS finalizados,
               SUM(CASE WHEN p.Status IN ('Novo','Em Andamento')
                        AND date(p.Previsao) < date('now') THEN 1 ELSE 0 END) AS atrasados
        FROM projetos p
        {where_clause}
        GROUP BY substr(p.Inicio, 1, 7)
        ORDER BY mes
    """, args).fetchall()

    timeline = [dict(r) for r in timeline_rows]

    return {
        'total': total,
        'em_dia': em_dia,
        'atrasados': atrasados,
        'finalizados': finalizados,
        'finalizados_em_dia': finalizados_em_dia,
        'finalizados_em_atraso': finalizados_em_atraso,
        'pct_atrasados': pct_atrasados,
        'tabela_responsavel': tabela_responsavel,
        'timeline': timeline,
        # para o pizza
        'pizza': {
            'finalizados': finalizados,
            'atrasados': atrasados,
            'em_dia': em_dia,
        },
    }


# ──────────────────────────────────────────────────────────────
# Finalização de atividade
# ──────────────────────────────────────────────────────────────

def finalizar_atividade(db, ativ_id, novo_status, data_fim):
    """
    Finaliza (ou atualiza status de) uma atividade.
    Se status=Finalizado, calcula Status_Finalizacao.
    Retorna a atividade atualizada.
    """
    ativ = db.execute("SELECT * FROM atividades WHERE ID = ?", (ativ_id,)).fetchone()
    if not ativ:
        raise ValueError('Atividade não encontrada')

    status_fin = None
    if novo_status == 'Finalizado' and data_fim:
        situacao = calcular_situacao('Finalizado', ativ['Previsao'], data_fim)
        status_fin = situacao  # 'Finalizado em Dia' ou 'Finalizado em Atrasado'

    db.execute("""
        UPDATE atividades
        SET status = ?, Finalizacao = ?, Status_Finalizacao = ?
        WHERE ID = ?
    """, (novo_status, data_fim, status_fin, ativ_id))
    db.commit()

    # Registra atualização no projeto
    obs = f"Atividade {ativ['sequencia']} - {ativ['Atividade']}: status alterado para {novo_status}"
    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
        VALUES (?, ?, ?)
    """, (ativ['Id_projetos'], today_iso(), obs))
    db.commit()

    return db.execute("SELECT * FROM atividades WHERE ID = ?", (ativ_id,)).fetchone()


# ──────────────────────────────────────────────────────────────
# Finalização / Análise de Projeto
# ──────────────────────────────────────────────────────────────

def pode_finalizar_projeto(db, proj_id):
    """Verifica se todas as atividades estão Finalizadas."""
    pendentes = db.execute("""
        SELECT COUNT(*) AS c FROM atividades
        WHERE Id_projetos = ? AND status != 'Finalizado'
    """, (proj_id,)).fetchone()['c']
    return pendentes == 0


def finalizar_projeto(db, proj_id, observacao_geral):
    """
    Finaliza o projeto:
    - Finalizacao = data da última atividade finalizada
    - Status = 'Finalizado'
    - Observacao_Geral = texto informado
    """
    if not pode_finalizar_projeto(db, proj_id):
        raise ValueError('Ainda existem atividades não finalizadas.')

    ultima = db.execute("""
        SELECT MAX(Finalizacao) AS ultima FROM atividades
        WHERE Id_projetos = ?
    """, (proj_id,)).fetchone()['ultima']

    db.execute("""
        UPDATE projetos
        SET Status = 'Finalizado',
            Finalizacao = ?,
            Observacao_Geral = ?
        WHERE ID = ?
    """, (ultima, observacao_geral, proj_id))
    db.commit()

    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
        VALUES (?, ?, ?)
    """, (proj_id, today_iso(), f"Projeto finalizado. Observação: {observacao_geral}"))
    db.commit()


def enviar_para_analise(db, proj_id, resolucao_final):
    """
    Envia projeto para Análise:
    - Status = 'Aguardando'
    - Resolucao_Final = texto informado
    """
    if not pode_finalizar_projeto(db, proj_id):
        raise ValueError('Ainda existem atividades não finalizadas.')

    db.execute("""
        UPDATE projetos
        SET Status = 'Aguardando',
            Resolucao_Final = ?
        WHERE ID = ?
    """, (resolucao_final, proj_id))
    db.commit()

    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
        VALUES (?, ?, ?)
    """, (proj_id, today_iso(), f"Projeto enviado para análise. Resolução: {resolucao_final}"))
    db.commit()


# ──────────────────────────────────────────────────────────────
# Cobrança
# ──────────────────────────────────────────────────────────────

def registrar_cobranca(db, proj_id, data, observacao):
    """Registra uma cobrança e atualiza projetos.cobranca."""
    db.execute("""
        INSERT INTO cobranca (Id_projetos, data, observacao)
        VALUES (?, ?, ?)
    """, (proj_id, data, observacao))
    db.execute("""
        UPDATE projetos SET cobranca = ? WHERE ID = ?
    """, (data, proj_id))
    db.commit()

    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
        VALUES (?, ?, ?)
    """, (proj_id, today_iso(), f"Cobrança registrada em {format_date_br(data)}: {observacao}"))
    db.commit()


# ──────────────────────────────────────────────────────────────
# Atualização livre
# ──────────────────────────────────────────────────────────────

def registrar_atualizacao(db, proj_id, data, observacao):
    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
        VALUES (?, ?, ?)
    """, (proj_id, data, observacao))
    db.commit()


# ──────────────────────────────────────────────────────────────
# Recalcula Previsão do projeto pela última atividade
# ──────────────────────────────────────────────────────────────

def recalcular_previsao_projeto(db, proj_id):
    """
    Atualiza projetos.Previsao com a maior Previsao das atividades.
    Se ultrapassar a previsão atual, registra uma atualização informando a mudança.
    """
    projeto = db.execute("SELECT * FROM projetos WHERE ID = ?", (proj_id,)).fetchone()
    if not projeto:
        return

    maior = db.execute("""
        SELECT MAX(Previsao) AS maior FROM atividades
        WHERE Id_projetos = ?
    """, (proj_id,)).fetchone()['maior']

    if not maior:
        return

    anterior = projeto['Previsao']
    if anterior != maior:
        db.execute("UPDATE projetos SET Previsao = ? WHERE ID = ?", (maior, proj_id))
        db.execute("""
            INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
            VALUES (?, ?, ?)
        """, (proj_id, today_iso(),
              f"Previsão do projeto alterada de {format_date_br(anterior)} para {format_date_br(maior)} (devido às atividades)."))
        db.commit()


# ──────────────────────────────────────────────────────────────
# Cancelar / Pausar projeto
# ──────────────────────────────────────────────────────────────

def cancelar_projeto(db, proj_id):
    """
    Cancela o projeto:
    - Todas as atividades NÃO finalizadas recebem status='Cancelado' e
      Finalizacao = data de hoje.
    - Atividades já Finalizadas são preservadas.
    - O projeto recebe Status='Cancelado' e Finalizacao = hoje.
    """
    projeto = db.execute("SELECT * FROM projetos WHERE ID = ?", (proj_id,)).fetchone()
    if not projeto:
        raise ValueError('Projeto não encontrado')

    hoje = today_iso()

    # Atividades não finalizadas → Cancelado + Finalizacao = hoje
    db.execute("""
        UPDATE atividades
        SET status = 'Cancelado', Finalizacao = ?
        WHERE Id_projetos = ? AND status != 'Finalizado'
    """, (hoje, proj_id))

    # Projeto → Cancelado + Finalizacao = hoje
    db.execute("""
        UPDATE projetos
        SET Status = 'Cancelado', Finalizacao = ?
        WHERE ID = ?
    """, (hoje, proj_id))
    db.commit()

    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
        VALUES (?, ?, ?)
    """, (proj_id, hoje, "Projeto cancelado. Atividades não finalizadas marcadas como canceladas."))
    db.commit()


def pausar_projeto(db, proj_id):
    """
    Pausa o projeto:
    - Todas as atividades NÃO finalizadas recebem status='Pausado' e
      Finalizacao = data de hoje (registro da parada).
    - Atividades já Finalizadas são preservadas.
    - O projeto recebe Status='Pausado' e Finalizacao = hoje.
    """
    projeto = db.execute("SELECT * FROM projetos WHERE ID = ?", (proj_id,)).fetchone()
    if not projeto:
        raise ValueError('Projeto não encontrado')

    hoje = today_iso()

    # Atividades não finalizadas → Pausado + Finalizacao = hoje
    db.execute("""
        UPDATE atividades
        SET status = 'Pausado', Finalizacao = ?
        WHERE Id_projetos = ? AND status != 'Finalizado'
    """, (hoje, proj_id))

    # Projeto → Pausado + Finalizacao = hoje
    db.execute("""
        UPDATE projetos
        SET Status = 'Pausado', Finalizacao = ?
        WHERE ID = ?
    """, (hoje, proj_id))
    db.commit()

    db.execute("""
        INSERT INTO atualizacoes (Id_projetos, Data, Observacao)
        VALUES (?, ?, ?)
    """, (proj_id, hoje, "Projeto pausado. Atividades não finalizadas marcadas como pausadas."))
    db.commit()
