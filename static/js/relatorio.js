/* =========================================================
   relatorio.js - Módulo Relatório Diário
   v2: Checkboxes + Cobrança em lote + Regras atualizadas
   ========================================================= */

const RelatorioView = (() => {

    // Cache local da lista completa + lista de responsáveis
    let cacheLista = [];
    let filtroResponsavel = '';
    let selectedIds = new Set(); // IDs de atividades selecionadas

    async function render() {
        const view = document.getElementById('view');
        view.className = 'view-container relatorio-view';

        // Carrega lista de responsáveis para popular o select
        let resps = [];
        try {
            resps = await API.responsaveis.list();
        } catch (e) {}

        view.innerHTML = `
            <div class="page-header">
                <h2>Relatório Diário</h2>
                <div class="actions">
                    <button class="btn btn-primary" id="btnCobrancaLote" disabled title="Registrar cobrança nas atividades selecionadas">📢 Cobrança em Lote (<span id="selectedCount">0</span>)</button>
                    <button class="btn btn-secondary" id="btnRefresh">Atualizar</button>
                </div>
            </div>

            <div class="filter-bar mb-3">
                <div class="form-group">
                    <label>Responsável do Projeto</label>
                    <select id="fRespProj" name="responsavel">
                        <option value="">Todos</option>
                        ${resps.map(r => `<option value="${escapeHtml(r.Nome)}">${escapeHtml(r.Nome)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-actions">
                    <button class="btn btn-primary" id="btnFiltrar">Filtrar</button>
                    <button class="btn btn-secondary" id="btnLimpar">Limpar</button>
                </div>
            </div>

            <div class="card mb-3">
                <p class="text-sm text-muted">
                    Atividades a tratar: <strong>atrasadas</strong>, <strong>vencendo hoje</strong>, e <strong>vencendo em até 2 dias</strong>.
                    Atividades já cobradas hoje são ocultadas automaticamente.
                    Use os checkboxes para selecionar e registrar cobrança em lote.
                </p>
            </div>
            <div class="table-wrap">
                <table class="data-table" id="relTable">
                    <thead>
                        <tr>
                            <th style="width:36px"><input type="checkbox" id="chkAll" title="Selecionar todas"></th>
                            <th>Código</th>
                            <th>Responsável (Projeto)</th>
                            <th>Atividade</th>
                            <th>Previsão</th>
                            <th>Resp. Atividade</th>
                            <th class="text-right">Dias</th>
                            <th>Motivo</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody><tr><td colspan="9" class="text-center text-muted">Carregando...</td></tr></tbody>
                </table>
            </div>
        `;

        // Reset do filtro e seleção a cada render
        filtroResponsavel = '';
        selectedIds.clear();

        document.getElementById('btnRefresh').addEventListener('click', load);
        document.getElementById('btnFiltrar').addEventListener('click', aplicarFiltro);
        document.getElementById('btnLimpar').addEventListener('click', () => {
            document.getElementById('fRespProj').value = '';
            filtroResponsavel = '';
            renderTabela();
        });
        document.getElementById('fRespProj').addEventListener('change', aplicarFiltro);

        // Select all checkbox
        document.getElementById('chkAll').addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.chk-ativ').forEach(chk => {
                chk.checked = checked;
                const aid = parseInt(chk.dataset.aid);
                if (checked) selectedIds.add(aid);
                else selectedIds.delete(aid);
            });
            updateSelectedCount();
        });

        // Batch cobrança button
        document.getElementById('btnCobrancaLote').addEventListener('click', cobrancaEmLote);

        load();
    }

    async function load() {
        try {
            const lista = await API.relatorioDiario();
            cacheLista = lista;
            selectedIds.clear();
            renderTabela();
        } catch (e) {
            App.toast('Erro: ' + e.message, 'error');
        }
    }

    function aplicarFiltro() {
        filtroResponsavel = document.getElementById('fRespProj').value;
        selectedIds.clear();
        renderTabela();
    }

    function updateSelectedCount() {
        const count = selectedIds.size;
        document.getElementById('selectedCount').textContent = count;
        document.getElementById('btnCobrancaLote').disabled = count === 0;
    }

    function renderTabela() {
        const tbody = document.querySelector('#relTable tbody');
        if (!tbody) return;

        // Aplica filtro por responsável do projeto
        const lista = filtroResponsavel
            ? cacheLista.filter(a => (a.proj_responsavel || '') === filtroResponsavel)
            : cacheLista;

        if (!lista.length) {
            tbody.innerHTML = `
                <tr><td colspan="9">
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                        <h3>Tudo em dia!</h3>
                        <p>${filtroResponsavel
                            ? `Nenhuma atividade pendente para <strong>${escapeHtml(filtroResponsavel)}</strong>.`
                            : 'Nenhuma atividade pendente para hoje.'}</p>
                    </div>
                </td></tr>
            `;
            updateSelectedCount();
            return;
        }
        tbody.innerHTML = lista.map(a => {
            const diasCls = a.dias < 0 ? 'dias-neg' : (a.dias === 0 ? 'dias-zero' : '');
            const motivoCls = a.motivo === 'Atrasada' ? 'atrasado' : (a.motivo === 'Vence hoje' ? 'hoje' : '');
            const isChecked = selectedIds.has(a.ativ_id) ? 'checked' : '';
            return `
                <tr>
                    <td><input type="checkbox" class="chk-ativ" data-aid="${a.ativ_id}" ${isChecked}></td>
                    <td><strong>#${a.proj_id}</strong></td>
                    <td>${a.proj_responsavel || '—'}</td>
                    <td>${escapeHtml(a.ativ_nome || '')}</td>
                    <td>${a.ativ_previsao_br}</td>
                    <td>${a.ativ_responsavel || '—'}</td>
                    <td class="text-right ${diasCls}">${a.dias}</td>
                    <td><span class="motivo-badge ${motivoCls}">${a.motivo}</span></td>
                    <td><button class="btn btn-sm btn-primary" onclick="App.navigate('/projeto/${a.proj_id}')">Analisar</button></td>
                </tr>
            `;
        }).join('');

        // Bind checkboxes
        document.querySelectorAll('.chk-ativ').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const aid = parseInt(e.target.dataset.aid);
                if (e.target.checked) selectedIds.add(aid);
                else selectedIds.delete(aid);
                updateSelectedCount();
            });
        });

        // Reset select all
        const chkAll = document.getElementById('chkAll');
        if (chkAll) chkAll.checked = false;
        updateSelectedCount();
    }

    async function cobrancaEmLote() {
        if (selectedIds.size === 0) return;

        const count = selectedIds.size;
        if (!App.confirm(`Registrar cobrança em ${count} atividade(s)?\n\nData: hoje\nObservação: Cobrança Realizada`)) return;

        const btn = document.getElementById('btnCobrancaLote');
        btn.disabled = true;
        btn.textContent = 'Registrando...';

        try {
            const result = await API.cobrancaBatch({
                atividade_ids: [...selectedIds]
            });
            App.toast(`Cobrança registrada em ${result.count} atividade(s)!`, 'success');
            selectedIds.clear();
            // Recarrega a lista (atividades cobradas hoje saem da lista)
            await load();
        } catch (e) {
            App.toast('Erro: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '📢 Cobrança em Lote (<span id="selectedCount">0</span>)';
        }
    }

    function escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    return { render };
})();