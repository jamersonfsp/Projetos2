/* =========================================================
   projeto.js - Cadastro de Projeto + Lista + Tela do Projeto
   ========================================================= */

const ProjetoView = (() => {

    // ───────── CADASTRO DE PROJETO ─────────
    async function renderCadastro() {
        const view = document.getElementById('view');
        view.className = 'view-container cadastro-view';

        // Carrega listas de apoio
        let resps = [], setores = [];
        try {
            resps = await API.responsaveis.list();
            setores = await API.setores.list();
        } catch (e) {}

        view.innerHTML = `
            <div class="page-header">
                <h2>Cadastro de Projeto</h2>
                <div class="actions">
                    <button class="btn btn-secondary" onclick="App.navigate('/projetos')">Cancelar</button>
                </div>
            </div>

            <div class="card form-card">
                <form id="formProjeto">
                    <div class="form-grid">
                        <div class="form-group span-2">
                            <label>Título do Projeto *</label>
                            <input type="text" name="Titulo" required maxlength="200">
                        </div>
                        <div class="form-group">
                            <label>Tipo</label>
                            <select name="Tipo">
                                <option value="Projeto">Projeto</option>
                                <option value="Melhoria de Mão-de-obra">Melhoria de Mão-de-obra</option>
                                <option value="Melhoria de Processo">Melhoria de Processo</option>
                                <option value="Atividades">Atividades</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Responsável</label>
                            <select name="Responsavel">
                                <option value="">—</option>
                                ${resps.map(r => `<option value="${r.Nome}">${r.Nome}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Setor</label>
                            <select name="Setor">
                                <option value="">—</option>
                                ${setores.map(s => `<option value="${s.Nome}">${s.Nome}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Início *</label>
                            <input type="date" name="Inicio" required value="${App.todayISO()}">
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <input type="text" name="Status" value="Novo" readonly>
                        </div>
                        <div class="form-group">
                            <label>Previsão (auto: última atividade)</label>
                            <input type="date" name="Previsao" id="fPrevisao" disabled>
                        </div>
                        <div class="form-group span-3">
                            <label>Descrição (até 500 caracteres)</label>
                            <textarea name="Descricao" maxlength="500" rows="3" placeholder="Descreva o projeto..."></textarea>
                        </div>
                    </div>

                    <div class="mt-4 flex gap-3" style="border-top: 1px solid var(--border); padding-top: 14px;">
                        <button type="submit" class="btn btn-primary">Salvar Projeto</button>
                        <button type="button" class="btn btn-secondary" id="btnAtividades" disabled>
                            Incluir Atividades (salve o projeto primeiro)
                        </button>
                        <button type="button" class="btn btn-success" id="btnNovo" style="display:none;">
                            + Novo
                        </button>
                    </div>
                </form>
            </div>
        `;

        const form = document.getElementById('formProjeto');
        let projetoId = null;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const data = {};
            fd.forEach((v, k) => data[k] = v);

            if (projetoId) {
                // Update
                await API.projetos.update(projetoId, data);
                App.toast('Projeto atualizado!', 'success');
            } else {
                // Create
                const r = await API.projetos.create(data);
                projetoId = r.ID;
                App.toast('Projeto criado! Agora inclua as atividades.', 'success');
                document.getElementById('btnAtividades').disabled = false;
                document.getElementById('btnAtividades').textContent = 'Incluir Atividades';
                // Mostra o botão "Novo" para permitir cadastrar outro projeto
                document.getElementById('btnNovo').style.display = 'inline-block';
            }
        });

        document.getElementById('btnAtividades').addEventListener('click', () => {
            if (!projetoId) return;
            AtividadesView.openModal(projetoId, () => {
                // Após fechar, recarrega a previsão do projeto
                loadProjetoPrevisao(projetoId);
            });
        });

        // Botão "Novo" — recarrega a tela de cadastro limpa para um novo projeto
        document.getElementById('btnNovo').addEventListener('click', () => {
            if (!App.confirm('Iniciar o cadastro de um novo projeto? As alterações atuais já foram salvas.')) return;
            renderCadastro();
        });
    }

    async function loadProjetoPrevisao(pid) {
        try {
            const p = await API.projetos.get(pid);
            const inp = document.getElementById('fPrevisao');
            if (inp) inp.value = p.projeto.Previsao || '';
        } catch (e) {}
    }

    // ───────── LISTA DE PROJETOS ─────────
    async function renderLista() {
        const view = document.getElementById('view');
        view.className = 'view-container projetos-view';

        // Carrega opções de filtros
        let resps = [], setores = [];
        try {
            resps = await API.responsaveis.list();
            setores = await API.setores.list();
        } catch (e) {}

        view.innerHTML = `
            <div class="page-header">
                <h2>Lista de Projetos</h2>
                <div class="actions">
                    <button class="btn btn-primary" onclick="App.navigate('/cadastro')">+ Novo Projeto</button>
                </div>
            </div>

            <div class="filter-bar">
                <div class="form-group">
                    <label>Código</label>
                    <input type="number" id="fCodigo" placeholder="ID">
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <div id="msStatus"></div>
                </div>
                <div class="form-group">
                    <label>Responsável</label>
                    <div id="msResp"></div>
                </div>
                <div class="form-group">
                    <label>Setor</label>
                    <div id="msSetor"></div>
                </div>
                <div class="filter-actions">
                    <button class="btn btn-primary" id="btnBuscar">Buscar</button>
                    <button class="btn btn-secondary" id="btnLimpar">Limpar</button>
                </div>
            </div>

            <div class="table-wrap">
                <table class="data-table" id="projetosTable">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Projeto</th>
                            <th>Responsável</th>
                            <th>Status</th>
                            <th>Início</th>
                            <th>Fim</th>
                            <th>Situação</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody><tr><td colspan="8" class="text-center text-muted">Use os filtros e clique em Buscar</td></tr></tbody>
                </table>
            </div>
        `;

        // Multiselects em cascata
        const statusOpts = ['Novo','Em Andamento','Aguardando','Finalizado','Pausado','Cancelado'].map(s => ({value: s, label: s}));
        const respOpts = resps.map(r => ({value: r.Nome, label: r.Nome}));
        const setorOpts = setores.map(s => ({value: s.Nome, label: s.Nome}));

        let selStatus = [], selResp = [], selSetor = [];

        const msS = App.multiselect({
            options: statusOpts, selected: selStatus, placeholder: 'Todos',
            onChange: (v) => { selStatus = v; refreshCascata(); }
        });
        const msR = App.multiselect({
            options: respOpts, selected: selResp, placeholder: 'Todos',
            onChange: (v) => { selResp = v; refreshCascata(); }
        });
        const msT = App.multiselect({
            options: setorOpts, selected: selSetor, placeholder: 'Todos',
            onChange: (v) => { selSetor = v; refreshCascata(); }
        });

        document.getElementById('msStatus').appendChild(msS.wrap);
        document.getElementById('msResp').appendChild(msR.wrap);
        document.getElementById('msSetor').appendChild(msT.wrap);

        async function refreshCascata() {
            // Busca projetos com filtros atuais para atualizar opções dos outros multiselects
            const params = {};
            if (document.getElementById('fCodigo').value) params.codigo = document.getElementById('fCodigo').value;
            if (selStatus.length) params.status = selStatus;
            if (selResp.length) params.responsavel = selResp;
            if (selSetor.length) params.setor = selSetor;

            try {
                const projetos = await API.projetos.list(params);
                const respDisponiveis = [...new Set(projetos.map(p => p.Responsavel).filter(Boolean))];
                const setDisponiveis = [...new Set(projetos.map(p => p.Setor).filter(Boolean))];

                msR.set(respDisponiveis);
                msT.set(setDisponiveis);
                // Não refaz options para não perder seleção; apenas atualiza options
                const newRespOpts = respDisponiveis.map(n => ({value: n, label: n}));
                const newSetorOpts = setDisponiveis.map(n => ({value: n, label: n}));
                // (Atualizar options do multiselect requer re-render interno; para simplicidade, mantemos.)
            } catch (e) {}
        }

        document.getElementById('btnBuscar').addEventListener('click', () => buscar(selStatus, selResp, selSetor));
        document.getElementById('btnLimpar').addEventListener('click', () => {
            document.getElementById('fCodigo').value = '';
            selStatus = []; selResp = []; selSetor = [];
            msS.set([]); msR.set([]); msT.set([]);
            buscar([], [], []);
        });

        // Busca inicial (sem filtros)
        buscar([], [], []);
    }

    async function buscar(statuses, resps, setores) {
        const codigo = document.getElementById('fCodigo').value;
        const params = {};
        if (codigo) params.codigo = codigo;
        if (statuses.length) params.status = statuses;
        if (resps.length) params.responsavel = resps;
        if (setores.length) params.setor = setores;

        const tbody = document.querySelector('#projetosTable tbody');
        try {
            const lista = await API.projetos.list(params);
            if (!lista.length) {
                tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>Nenhum projeto encontrado</h3><p>Tente ajustar os filtros.</p></div></td></tr>`;
                return;
            }
            tbody.innerHTML = lista.map(p => `
                <tr>
                    <td><strong>#${p.ID}</strong></td>
                    <td>${escapeHtml(p.Titulo || '')}</td>
                    <td>${p.Responsavel || '—'}</td>
                    <td>${App.statusBadge(p.Status)}</td>
                    <td>${App.fmtDate(p.Inicio)}</td>
                    <td>${App.fmtDate(p.Fim)}</td>
                    <td class="situacao-cell">${App.situacaoBadge(p.Situacao)}</td>
                    <td><button class="btn btn-sm btn-primary" onclick="App.navigate('/projeto/${p.ID}')">Abrir</button></td>
                </tr>
            `).join('');
        } catch (e) {
            App.toast('Erro: ' + e.message, 'error');
        }
    }

    // ───────── TELA DO PROJETO ─────────
    async function renderTela(pid) {
        const view = document.getElementById('view');
        view.className = 'view-container projeto-view';
        view.innerHTML = '<div class="loading">Carregando projeto...</div>';

        try {
            const data = await API.projetos.get(pid);
            const p = data.projeto;
            const atividades = data.atividades;
            const atualizacoes = data.atualizacoes;

            view.innerHTML = `
                <div class="page-header">
                    <h2>Tela do Projeto</h2>
                    <div class="actions">
                        <button class="btn btn-secondary" onclick="App.navigate('/projetos')">← Voltar à Lista</button>
                    </div>
                </div>

                <div class="projeto-header">
                    <div>
                        <h2>${escapeHtml(p.Titulo || '')}</h2>
                        <div class="meta">
                            <span>#${p.ID}</span>
                            <span>${App.statusBadge(p.Status)}</span>
                            <span>${App.situacaoBadge(p.Situacao)}</span>
                            <span>Tipo: ${p.Tipo || '—'}</span>
                        </div>
                    </div>
                    <div class="meta">
                        <span>Início: ${App.fmtDate(p.Inicio)}</span>
                        <span>Previsão: ${App.fmtDate(p.Previsao)}</span>
                        ${p.Finalizacao ? `<span>Finalização: ${App.fmtDate(p.Finalizacao)}</span>` : ''}
                    </div>
                </div>

                <div class="two-col">
                    <!-- Coluna esquerda: dados + atividades -->
                    <div>
                        <div class="card mb-3">
                            <div class="card-header"><h3>Dados do Projeto</h3></div>
                            <div class="dados-grid">
                                <div class="form-group"><label>Código</label><input type="text" value="${p.ID}" disabled></div>
                                <div class="form-group"><label>Título</label><input type="text" value="${escapeHtml(p.Titulo || '')}" disabled></div>
                                <div class="form-group"><label>Responsável</label><input type="text" value="${escapeHtml(p.Responsavel || '')}" disabled></div>
                                <div class="form-group"><label>Setor</label><input type="text" value="${escapeHtml(p.Setor || '')}" disabled></div>
                                <div class="form-group"><label>Início</label><input type="text" value="${App.fmtDate(p.Inicio)}" disabled></div>
                                <div class="form-group"><label>Previsão</label><input type="text" value="${App.fmtDate(p.Previsao)}" disabled></div>
                                <div class="form-group"><label>Tipo</label><input type="text" value="${p.Tipo || ''}" disabled></div>
                                <div class="form-group"><label>Status</label><input type="text" value="${p.Status || ''}" disabled></div>
                                <div class="form-group"><label>Finalização</label><input type="text" value="${App.fmtDate(p.Finalizacao)}" disabled></div>
                            </div>
                            <div class="textareas-full">
                                <div class="form-group"><label>Descrição</label><textarea disabled rows="3">${escapeHtml(p.Descricao || '')}</textarea></div>
                                <div class="form-group"><label>Resolução Final</label><textarea disabled rows="3">${escapeHtml(p.Resolucao_Final || '')}</textarea></div>
                                <div class="form-group"><label>Observação Geral</label><textarea disabled rows="3">${escapeHtml(p.Observacao_Geral || '')}</textarea></div>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-header">
                                <h3>Atividades</h3>
                                <div class="actions">
                                    <button class="btn btn-sm btn-secondary" id="btnEsquema">Esquema (editar atividades)</button>
                                </div>
                            </div>
                            <div class="atividades-scroll">
                                <table class="data-table" id="ativTable">
                                    <thead>
                                        <tr>
                                            <th>Seq</th>
                                            <th>Atividade</th>
                                            <th>Resp.</th>
                                            <th>Dep.</th>
                                            <th>Início</th>
                                            <th>Fim</th>
                                            <th>Dur.</th>
                                            <th>Status</th>
                                            <th>Finalização</th>
                                            <th>Situação</th>
                                            <th>Sáb</th>
                                            <th>Dom</th>
                                            <th>Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${atividades.length ? atividades.map(a => `
                                            <tr>
                                                <td>${a.sequencia}</td>
                                                <td>${escapeHtml(a.Atividade || '')}</td>
                                                <td>${a.Responsavel || '—'}</td>
                                                <td>${a.Dependencia || '—'}</td>
                                                <td>${App.fmtDate(a.Inicio)}</td>
                                                <td>${App.fmtDate(a.Previsao)}</td>
                                                <td>${a.Duracao || 1}</td>
                                                <td>${App.statusBadge(a.status)}</td>
                                                <td>${App.fmtDate(a.Finalizacao)}</td>
                                                <td>${App.situacaoBadge(a.Situacao)}</td>
                                                <td>${a.Sabado ? '✓' : '—'}</td>
                                                <td>${a.Domingo ? '✓' : '—'}</td>
                                                <td>
                                                    ${a.status !== 'Finalizado' ? `<button class="btn btn-sm btn-warning" onclick="ProjetoView.finalizarAtividade(${a.ID})">Finalizar</button>` : '<span class="badge badge-success">OK</span>'}
                                                </td>
                                            </tr>
                                        `).join('') : `<tr><td colspan="13" class="text-center text-muted">Nenhuma atividade. Clique em "Esquema".</td></tr>`}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="acoes-gerais">
                            <button class="btn btn-secondary" onclick="App.navigate('/projetos')">Sair</button>
                            <button class="btn btn-warning" id="btnAnalise">Para Análise</button>
                            <button class="btn btn-success" id="btnFinalizar">Finalizar Projeto</button>
                            <button class="btn btn-primary" id="btnCobranca">Cobrança</button>
                            <button class="btn btn-secondary" id="btnAtualizacao">Atualização</button>
                        </div>
                    </div>

                    <!-- Coluna direita: atualizações -->
                    <div class="card">
                        <div class="card-header"><h3>Atualizações</h3></div>
                        <div class="notes-box" id="atualizacoesBox">
                            ${atualizacoes.length ? atualizacoes.map(a => `<div class="note-entry"><span class="note-date">${App.fmtDate(a.Data)}</span><span class="note-text">${escapeHtml(a.Observacao || '')}</span></div>`).join('') : '<div class="text-muted">Sem atualizações registradas.</div>'}
                        </div>
                        <div class="mt-3">
                            <h4 style="font-size:13px;margin-bottom:6px">Cobranças Registradas</h4>
                            <div class="notes-box" style="max-height:200px;min-height:120px">
                                ${data.cobrancas.length ? data.cobrancas.map(c => `<div class="note-entry"><span class="note-date">${App.fmtDate(c.data)}</span><span class="note-text">${escapeHtml(c.observacao || '')}</span></div>`).join('') : '<div class="text-muted">Sem cobranças registradas.</div>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Eventos
            document.getElementById('btnEsquema').addEventListener('click', () => {
                AtividadesView.openModal(pid, () => renderTela(pid));
            });
            document.getElementById('btnAnalise').addEventListener('click', () => analise(pid));
            document.getElementById('btnFinalizar').addEventListener('click', () => finalizar(pid));
            document.getElementById('btnCobranca').addEventListener('click', () => cobranca(pid));
            document.getElementById('btnAtualizacao').addEventListener('click', () => atualizacao(pid));

        } catch (e) {
            view.innerHTML = `<div class="empty-state"><h3>Erro</h3><p>${e.message}</p></div>`;
        }
    }

    async function finalizarAtividade(aid) {
        const m = App.modal({
            title: 'Finalizar Atividade',
            size: 'sm',
            body: `
                <div class="form-group mb-3">
                    <label>Novo Status</label>
                    <select id="fStatus">
                        <option value="Novo">Novo</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Finalizado" selected>Finalizado</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Data de Fim (obrigatório se Finalizado)</label>
                    <input type="date" id="fFim" value="${App.todayISO()}">
                </div>
                <p class="text-sm text-muted mt-2">A situação será calculada automaticamente comparando a data de fim com a previsão.</p>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                App.el('button', { class: 'btn btn-success', id: 'btnSaveFinalizar' }, 'Salvar'),
            ]
        });
        document.getElementById('btnSaveFinalizar').addEventListener('click', async () => {
            const status = document.getElementById('fStatus').value;
            const fim = document.getElementById('fFim').value;
            if (status === 'Finalizado' && !fim) {
                App.toast('Informe a data de fim', 'warning');
                return;
            }
            try {
                await API.atividades.finalizar(aid, { status, Fim: fim });
                App.toast('Atividade atualizada!', 'success');
                m.close();
                // Recarrega a tela atual
                const view = document.getElementById('view');
                const pid = view.querySelector('.projeto-header h2').textContent;
                // pid não vem do título; precisamos do ID. Vamos ler do hash.
                const hash = window.location.hash.match(/\/projeto\/(\d+)/);
                if (hash) renderTela(hash[1]);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    function analise(pid) {
        const m = App.modal({
            title: 'Enviar para Análise',
            size: 'md',
            body: `
                <p class="text-sm text-muted mb-3">Requer que todas as atividades estejam finalizadas. O projeto passa para status "Aguardando" e a resolução final é registrada.</p>
                <div class="form-group">
                    <label>Resolução do Problema (até 500 caracteres) *</label>
                    <textarea id="fResolucao" maxlength="500" rows="5" placeholder="Descreva a resolução..."></textarea>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                App.el('button', { class: 'btn btn-warning', id: 'btnSaveAnalise' }, 'Enviar para Análise'),
            ]
        });
        document.getElementById('btnSaveAnalise').addEventListener('click', async () => {
            const r = document.getElementById('fResolucao').value.trim();
            if (!r) { App.toast('Informe a resolução', 'warning'); return; }
            try {
                await API.projetos.analise(pid, { resolucao: r });
                App.toast('Projeto enviado para análise', 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    function finalizar(pid) {
        const m = App.modal({
            title: 'Finalizar Projeto',
            size: 'md',
            body: `
                <p class="text-sm text-muted mb-3">Requer que todas as atividades estejam finalizadas. A data de finalização será a maior data entre as atividades.</p>
                <div class="form-group">
                    <label>Observação sobre o encerramento (até 500 caracteres) *</label>
                    <textarea id="fObs" maxlength="500" rows="5" placeholder="Observações finais..."></textarea>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                App.el('button', { class: 'btn btn-success', id: 'btnSaveFinal' }, 'Finalizar Projeto'),
            ]
        });
        document.getElementById('btnSaveFinal').addEventListener('click', async () => {
            const o = document.getElementById('fObs').value.trim();
            if (!o) { App.toast('Informe a observação', 'warning'); return; }
            try {
                await API.projetos.finalizar(pid, { observacao: o });
                App.toast('Projeto finalizado!', 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    function cobranca(pid) {
        const m = App.modal({
            title: 'Registrar Cobrança',
            size: 'md',
            body: `
                <div class="form-grid">
                    <div class="form-group">
                        <label>Data *</label>
                        <input type="date" id="fData" value="${App.todayISO()}">
                    </div>
                    <div class="form-group span-2">
                        <label>Observação</label>
                        <textarea id="fObs" rows="3" placeholder="Detalhe da cobrança..."></textarea>
                    </div>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                App.el('button', { class: 'btn btn-primary', id: 'btnSaveCobr' }, 'Registrar'),
            ]
        });
        document.getElementById('btnSaveCobr').addEventListener('click', async () => {
            const data = document.getElementById('fData').value;
            const obs = document.getElementById('fObs').value.trim();
            if (!data) { App.toast('Informe a data', 'warning'); return; }
            try {
                await API.projetos.cobranca(pid, { data, observacao: obs });
                App.toast('Cobrança registrada', 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    function atualizacao(pid) {
        const m = App.modal({
            title: 'Registrar Atualização',
            size: 'md',
            body: `
                <div class="form-grid">
                    <div class="form-group">
                        <label>Data *</label>
                        <input type="date" id="fData" value="${App.todayISO()}">
                    </div>
                    <div class="form-group span-2">
                        <label>Observação *</label>
                        <textarea id="fObs" rows="4" placeholder="Descreva a atualização..."></textarea>
                    </div>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                App.el('button', { class: 'btn btn-primary', id: 'btnSaveAtl' }, 'Registrar'),
            ]
        });
        document.getElementById('btnSaveAtl').addEventListener('click', async () => {
            const data = document.getElementById('fData').value;
            const obs = document.getElementById('fObs').value.trim();
            if (!data || !obs) { App.toast('Preencha data e observação', 'warning'); return; }
            try {
                await API.projetos.atualizacao(pid, { data, observacao: obs });
                App.toast('Atualização registrada', 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    function escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    return { renderCadastro, renderLista, renderTela, finalizarAtividade };
})();
