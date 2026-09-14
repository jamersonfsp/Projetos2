/* =========================================================
   relatorio.js - Módulo Relatório Diário
   ========================================================= */

const RelatorioView = (() => {

    async function render() {
        const view = document.getElementById('view');
        view.className = 'view-container relatorio-view';
        view.innerHTML = `
            <div class="page-header">
                <h2>Relatório Diário</h2>
                <div class="actions">
                    <button class="btn btn-secondary" id="btnRefresh">Atualizar</button>
                </div>
            </div>
            <div class="card mb-3">
                <p class="text-sm text-muted">
                    Lista das atividades a tratar no dia: atrasadas, com previsão para hoje, e sem cobrança há mais de 2 dias úteis.
                </p>
            </div>
            <div class="table-wrap">
                <table class="data-table" id="relTable">
                    <thead>
                        <tr>
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
                    <tbody><tr><td colspan="8" class="text-center text-muted">Carregando...</td></tr></tbody>
                </table>
            </div>
        `;
        document.getElementById('btnRefresh').addEventListener('click', load);
        load();
    }

    async function load() {
        try {
            const lista = await API.relatorioDiario();
            const tbody = document.querySelector('#relTable tbody');
            if (!lista.length) {
                tbody.innerHTML = `
                    <tr><td colspan="8">
                        <div class="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                            <h3>Tudo em dia!</h3>
                            <p>Nenhuma atividade pendente para hoje.</p>
                        </div>
                    </td></tr>
                `;
                return;
            }
            tbody.innerHTML = lista.map(a => {
                const diasCls = a.dias < 0 ? 'dias-neg' : (a.dias === 0 ? 'dias-zero' : '');
                const motivoCls = a.motivo === 'Atrasada' ? 'atrasado' : (a.motivo === 'Vence hoje' ? 'hoje' : '');
                return `
                    <tr>
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
        } catch (e) {
            App.toast('Erro: ' + e.message, 'error');
        }
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    return { render };
})();
