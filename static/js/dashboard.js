/* =========================================================
   dashboard.js - Módulo Dashboard
   ========================================================= */

const DashboardView = (() => {

    let filtros = {
        inicio: '', previsao: '', termino: '', responsavel: '', status: []
    };
    let timelineFilter = 'Todos';

    async function render() {
        const view = document.getElementById('view');
        view.className = 'view-container dashboard-view';
        view.innerHTML = `
            <div class="page-header">
                <h2>Dashboard</h2>
            </div>

            <div class="filter-bar" id="dashFilters">
                <div class="form-group">
                    <label>Início (a partir de)</label>
                    <input type="date" id="fInicio" value="${filtros.inicio}">
                </div>
                <div class="form-group">
                    <label>Previsão (até)</label>
                    <input type="date" id="fPrevisao" value="${filtros.previsao}">
                </div>
                <div class="form-group">
                    <label>Término (até)</label>
                    <input type="date" id="fTermino" value="${filtros.termino}">
                </div>
                <div class="form-group">
                    <label>Responsável</label>
                    <select id="fResponsavel"><option value="">Todos</option></select>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="fStatus">
                        <option value="">Todos</option>
                        <option>Novo</option>
                        <option>Em Andamento</option>
                        <option>Aguardando</option>
                        <option>Finalizado</option>
                        <option>Pausado</option>
                        <option>Cancelado</option>
                    </select>
                </div>
                <div class="filter-actions">
                    <button class="btn btn-primary" id="btnApply">Aplicar</button>
                    <button class="btn btn-secondary" id="btnClear">Limpar</button>
                </div>
            </div>

            <div class="stat-grid" id="statGrid">
                <div class="loading">Carregando indicadores...</div>
            </div>

            <div class="chart-grid">
                <div class="chart-card">
                    <h3>Linha do Tempo</h3>
                    <div class="chart-filters" id="timelineFilters">
                        <span class="chip active" data-tf="Todos">Todos</span>
                        <span class="chip" data-tf="Total">Total</span>
                        <span class="chip" data-tf="Atrasados">Atrasados</span>
                        <span class="chip" data-tf="Finalizados">Finalizados</span>
                    </div>
                    <div class="chart-canvas-wrap"><canvas id="timelineChart"></canvas></div>
                </div>
                <div class="chart-card">
                    <h3>Distribuição</h3>
                    <div class="chart-canvas-wrap"><canvas id="pizzaChart"></canvas></div>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h3>Status por Responsável</h3></div>
                <div class="table-wrap" style="border:none">
                    <table class="data-table" id="respTable">
                        <thead>
                            <tr>
                                <th>Responsável</th>
                                <th class="text-right">Novos</th>
                                <th class="text-right">Em Andamento</th>
                                <th class="text-right">Finalizados</th>
                                <th class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody><tr><td colspan="5" class="text-center text-muted">Carregando...</td></tr></tbody>
                    </table>
                </div>
            </div>
        `;

        // Carrega responsáveis para o filtro
        try {
            const resps = await API.responsaveis.list();
            const sel = document.getElementById('fResponsavel');
            resps.forEach(r => {
                const o = document.createElement('option');
                o.value = r.Nome; o.textContent = r.Nome;
                sel.appendChild(o);
            });
            sel.value = filtros.responsavel;
        } catch (e) {}

        // Eventos
        document.getElementById('btnApply').addEventListener('click', applyFilters);
        document.getElementById('btnClear').addEventListener('click', clearFilters);

        document.querySelectorAll('#timelineFilters .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('#timelineFilters .chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                timelineFilter = chip.dataset.tf;
                loadDashboard();
            });
        });

        loadDashboard();
    }

    async function loadDashboard() {
        try {
            const params = {};
            if (filtros.inicio)      params.inicio = filtros.inicio;
            if (filtros.previsao)    params.previsao = filtros.previsao;
            if (filtros.termino)     params.termino = filtros.termino;
            if (filtros.responsavel) params.responsavel = filtros.responsavel;
            if (filtros.status && filtros.status.length) params.status = filtros.status;

            const data = await API.dashboard(params);
            renderStats(data);
            renderTimeline(data.timeline);
            renderPizza(data.pizza);
            renderRespTable(data.tabela_responsavel);
        } catch (e) {
            App.toast('Erro ao carregar dashboard: ' + e.message, 'error');
        }
    }

    function renderStats(d) {
        const grid = document.getElementById('statGrid');
        const pct = d.pct_atrasados;
        let pctCls = 'pct-low';
        if (pct > 5 && pct <= 8) pctCls = 'pct-medium';
        else if (pct > 8) pctCls = 'pct-high';

        grid.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Total de Projetos</div>
                <div class="stat-value">${d.total}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Projetos em Dia</div>
                <div class="stat-value success">${d.em_dia}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Projetos Finalizados</div>
                <div class="stat-value">${d.finalizados}</div>
                <div class="stat-sub">${d.finalizados_em_dia} em dia · ${d.finalizados_em_atraso} atrasados</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Projetos Atrasados</div>
                <div class="stat-value danger">${d.atrasados}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">% Atrasados</div>
                <div class="stat-value ${pctCls}">${pct}%</div>
                <div class="stat-sub">Verde ≤5% · Amarelo 5-8% · Vermelho >8%</div>
            </div>
        `;
    }

    let timelineChartObj = null;
    function renderTimeline(timeline) {
        const canvas = document.getElementById('timelineChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (timelineChartObj) timelineChartObj.destroy();

        if (typeof Chart === 'undefined') {
            console.warn('Chart.js não carregado');
            return;
        }

        const labels = timeline.map(t => {
            const [y, m] = t.mes.split('-');
            const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            return `${months[parseInt(m)-1]}/${y.slice(2)}`;
        });

        const datasets = [];
        if (timelineFilter === 'Todos' || timelineFilter === 'Total') {
            datasets.push({
                label: 'Total',
                data: timeline.map(t => t.total),
                borderColor: '#36373D',
                backgroundColor: 'rgba(54,55,61,0.1)',
                tension: 0.3,
                fill: true,
            });
        }
        if (timelineFilter === 'Todos' || timelineFilter === 'Atrasados') {
            datasets.push({
                label: 'Atrasados',
                data: timeline.map(t => t.atrasados),
                borderColor: '#EF4444',
                backgroundColor: 'rgba(239,68,68,0.1)',
                tension: 0.3,
                fill: true,
            });
        }
        if (timelineFilter === 'Todos' || timelineFilter === 'Finalizados') {
            datasets.push({
                label: 'Finalizados',
                data: timeline.map(t => t.finalizados),
                borderColor: '#10B981',
                backgroundColor: 'rgba(16,185,129,0.1)',
                tension: 0.3,
                fill: true,
            });
        }

        timelineChartObj = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                }
            }
        });
    }

    let pizzaChartObj = null;
    function renderPizza(p) {
        const canvas = document.getElementById('pizzaChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (pizzaChartObj) pizzaChartObj.destroy();

        if (typeof Chart === 'undefined') {
            console.warn('Chart.js não carregado');
            return;
        }

        const data = [p.finalizados, p.atrasados, p.em_dia];
        const total = data.reduce((a, b) => a + b, 0);

        // Se não há dados, mostra mensagem
        if (total === 0) {
            ctx.font = '13px Segoe UI';
            ctx.fillStyle = '#6B7280';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados para exibir', canvas.width / 2, canvas.height / 2);
            return;
        }

        pizzaChartObj = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Finalizados', 'Atrasados', 'Em Dia'],
                datasets: [{
                    data,
                    backgroundColor: ['#10B981', '#EF4444', '#3B82F6'],
                    borderWidth: 2,
                    borderColor: '#fff',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed;
                                const pct = total ? ((v/total)*100).toFixed(1) : 0;
                                return `${ctx.label}: ${v} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }

    function renderRespTable(rows) {
        const tbody = document.querySelector('#respTable tbody');
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Nenhum dado</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.responsavel || '—'}</td>
                <td class="text-right">${r.novos || 0}</td>
                <td class="text-right">${r.em_andamento || 0}</td>
                <td class="text-right">${r.finalizados || 0}</td>
                <td class="text-right"><strong>${r.total || 0}</strong></td>
            </tr>
        `).join('');
    }

    function applyFilters() {
        filtros.inicio      = document.getElementById('fInicio').value;
        filtros.previsao    = document.getElementById('fPrevisao').value;
        filtros.termino     = document.getElementById('fTermino').value;
        filtros.responsavel = document.getElementById('fResponsavel').value;
        const st = document.getElementById('fStatus').value;
        filtros.status = st ? [st] : [];
        loadDashboard();
    }

    function clearFilters() {
        filtros = { inicio: '', previsao: '', termino: '', responsavel: '', status: [] };
        render();
    }

    return { render };
})();
