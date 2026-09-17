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
                            <label>Descrição (até 2000 caracteres)</label>
                            <textarea name="Descricao" maxlength="2000" rows="5" placeholder="Descreva o projeto..."></textarea>
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
    let projetosCache = []; // cache para ordenação client-side
    let sortCol = null;     // coluna atual de ordenação
    let sortAsc = true;     // direção

    function sortProjetos(lista, col, asc) {
        if (!col) return lista;
        const sorted = [...lista];
        sorted.sort((a, b) => {
            let va, vb;
            switch (col) {
                case 'ID':        va = a.ID || 0; vb = b.ID || 0; break;
                case 'Titulo':    va = (a.Titulo || '').toLowerCase(); vb = (b.Titulo || '').toLowerCase(); break;
                case 'Responsavel': va = (a.Responsavel || '').toLowerCase(); vb = (b.Responsavel || '').toLowerCase(); break;
                case 'Status':    va = (a.Status || '').toLowerCase(); vb = (b.Status || '').toLowerCase(); break;
                case 'Inicio':    va = a.Inicio || ''; vb = b.Inicio || ''; break;
                case 'Fim':       va = a.Fim || ''; vb = b.Fim || ''; break;
                case 'Situacao':  va = (a.Situacao || '').toLowerCase(); vb = (b.Situacao || '').toLowerCase(); break;
                default: return 0;
            }
            if (va < vb) return asc ? -1 : 1;
            if (va > vb) return asc ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    function updateSortIndicators() {
        document.querySelectorAll('#projetosTable th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            const indicator = th.querySelector('.sort-arrow');
            if (indicator) indicator.textContent = '';
            if (th.dataset.sort === sortCol) {
                th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
                if (indicator) indicator.textContent = sortAsc ? ' ▲' : ' ▼';
            }
        });
    }

    function renderProjetosTable(lista) {
        const tbody = document.querySelector('#projetosTable tbody');
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
    }

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
                            <th data-sort="ID" style="cursor:pointer;user-select:none">Código<span class="sort-arrow"></span></th>
                            <th data-sort="Titulo" style="cursor:pointer;user-select:none">Projeto<span class="sort-arrow"></span></th>
                            <th data-sort="Responsavel" style="cursor:pointer;user-select:none">Responsável<span class="sort-arrow"></span></th>
                            <th data-sort="Status" style="cursor:pointer;user-select:none">Status<span class="sort-arrow"></span></th>
                            <th data-sort="Inicio" style="cursor:pointer;user-select:none">Início<span class="sort-arrow"></span></th>
                            <th data-sort="Fim" style="cursor:pointer;user-select:none">Fim<span class="sort-arrow"></span></th>
                            <th data-sort="Situacao" style="cursor:pointer;user-select:none">Situação<span class="sort-arrow"></span></th>
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
            sortCol = null;
            sortAsc = true;
            updateSortIndicators();
            buscar([], [], []);
        });

        // Ordenação por coluna (click no cabeçalho)
        document.querySelectorAll('#projetosTable th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                if (sortCol === col) {
                    sortAsc = !sortAsc;
                } else {
                    sortCol = col;
                    sortAsc = true;
                }
                const sorted = sortProjetos(projetosCache, sortCol, sortAsc);
                renderProjetosTable(sorted);
                updateSortIndicators();
            });
        });

        // Busca inicial (sem filtros)
        sortCol = null;
        sortAsc = true;
        buscar([], [], []);
    }

    async function buscar(statuses, resps, setores) {
        const codigo = document.getElementById('fCodigo').value;
        const params = {};
        if (codigo) params.codigo = codigo;
        if (statuses.length) params.status = statuses;
        if (resps.length) params.responsavel = resps;
        if (setores.length) params.setor = setores;

        try {
            const lista = await API.projetos.list(params);
            projetosCache = lista;
            const sorted = sortProjetos(lista, sortCol, sortAsc);
            renderProjetosTable(sorted);
            updateSortIndicators();
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

            // ─── Máquina de estados dos botões ───
            const st = p.Status || 'Novo';
            const isNovoOuEA = (st === 'Novo' || st === 'Em Andamento');
            const isAguardando = (st === 'Aguardando');
            const isFinalizado = (st === 'Finalizado');
            const isPausado = (st === 'Pausado');
            const isCancelado = (st === 'Cancelado');
            const editavel = isNovoOuEA; // Aguardando/Finalizado/Pausado/Cancelado bloqueiam alterações
            const dis = (ativo) => ativo ? '' : 'disabled';

            const hintBloq = !editavel
                ? `<div class="status-lock-note">🔒 Projeto <strong>${st}</strong> — ações bloqueadas. Use ${
                    isCancelado ? '<strong>Reativar</strong>' : isPausado ? '<strong>Despausar</strong>' : '<strong>Retornar</strong>'
                  } para devolver o projeto ao fluxo. Sair, Enviar E-mail e Exportar PDF permanecem ativos.</div>`
                : '';

            // Mapa: ID da atividade → número de sequência (para exibir dependência)
            const idToSeq = {};
            atividades.forEach(a => { idToSeq[a.ID] = a.sequencia; });
            const depLabel = (depId) => depId ? (idToSeq[depId] || depId) : '—';

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
                                    <button class="btn btn-sm btn-secondary" id="btnEsquema">${editavel ? 'Esquema (editar atividades)' : 'Esquema (consulta)'}</button>
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
                                                <td>${depLabel(a.Dependencia)}</td>
                                                <td>${App.fmtDate(a.Inicio)}</td>
                                                <td>${App.fmtDate(a.Previsao)}</td>
                                                <td>${a.Duracao || 1}</td>
                                                <td>${App.statusBadge(a.status)}</td>
                                                <td>${App.fmtDate(a.Finalizacao)}</td>
                                                <td>${App.situacaoBadge(a.Situacao)}</td>
                                                <td>${a.Sabado ? '✓' : '—'}</td>
                                                <td>${a.Domingo ? '✓' : '—'}</td>
                                                <td>
                                                    ${editavel && a.status !== 'Finalizado' ? `<button class="btn btn-sm btn-warning" onclick="ProjetoView.finalizarAtividade(${a.ID})">Finalizar</button>` : (a.status === 'Finalizado' ? '<span class="badge badge-success">OK</span>' : '—')}
                                                </td>
                                            </tr>
                                        `).join('') : `<tr><td colspan="13" class="text-center text-muted">Nenhuma atividade. Clique em "Esquema".</td></tr>`}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="acoes-gerais">
                            ${hintBloq}
                            <button class="btn btn-secondary" onclick="App.navigate('/projetos')">Sair</button>
                            ${isAguardando
                                ? '<button class="btn btn-warning" id="btnRetornar" title="Devolve o projeto a Novo ou Em Andamento">↩️ Retornar</button>'
                                : `<button class="btn btn-warning" id="btnAnalise" ${dis(editavel)} ${editavel ? '' : 'title="Disponível apenas para projetos Novo/Em Andamento"'}>Para Análise</button>`}
                            ${isFinalizado
                                ? '<button class="btn btn-success" id="btnRetornar" title="Devolve o projeto a Novo ou Em Andamento">↩️ Retornar</button>'
                                : `<button class="btn btn-success" id="btnFinalizar" ${dis(editavel || isAguardando)} ${editavel || isAguardando ? '' : 'title="Disponível apenas para projetos Novo/Em Andamento/Aguardando"'}>Finalizar Projeto</button>`}
                            <button class="btn btn-primary" id="btnCobranca" ${dis(editavel)} ${editavel ? '' : 'title="Disponível apenas para projetos Novo/Em Andamento"'}>Cobrança</button>
                            <button class="btn btn-secondary" id="btnAtualizacao" ${dis(editavel || isAguardando)} ${editavel || isAguardando ? '' : 'title="Disponível apenas para projetos Novo/Em Andamento/Aguardando"'}>Atualização</button>
                            ${isPausado
                                ? '<button class="btn btn-secondary" id="btnDespausar" title="Devolve o projeto e as atividades pausadas para Em Andamento">▶️ Despausar</button>'
                                : `<button class="btn btn-secondary" id="btnPausar" ${dis(editavel)} ${editavel ? '' : 'title="Disponível apenas para projetos Novo/Em Andamento"'}>Pausar</button>`}
                            ${isCancelado
                                ? '<button class="btn btn-warning" id="btnReativar" title="Devolve o projeto e as atividades canceladas para Em Andamento">🔄 Reativar</button>'
                                : `<button class="btn btn-warning" id="btnCancelar" ${dis(editavel)} ${editavel ? '' : 'title="Disponível apenas para projetos Novo/Em Andamento"'}>Cancelar</button>`}
                            <button class="btn btn-danger" id="btnExcluir" ${dis(editavel)} ${editavel ? '' : 'title="Disponível apenas para projetos Novo/Em Andamento"'}>Excluir Projeto</button>
                            <button class="btn btn-primary" id="btnEnviarEmail" style="margin-left:auto;background:#0078D4;color:#fff;border-color:#0078D4;">📧 Enviar E-mail</button>
                            <button class="btn btn-primary" id="btnExportPdf" style="background:#E7D264;color:#1a1a1a;border-color:#E7D264;">📄 Exportar PDF</button>
                        </div>
                    </div>

                    <!-- Coluna direita: atualizações -->
                    <div class="card">
                        <div class="card-header">
                            <h3>Atualizações</h3>
                            <div class="actions">
                                <button class="btn btn-sm btn-secondary" id="btnVerAtualizacoes" title="Ver atualizações em tela cheia">📋 Ver tudo</button>
                            </div>
                        </div>
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
                // Projetos bloqueados abrem a tela de atividades somente em consulta
                AtividadesView.openModal(pid, () => renderTela(pid), { readonly: !editavel });
            });
            document.getElementById('btnVerAtualizacoes').addEventListener('click', () => verAtualizacoes(pid));

            const elAnalise = document.getElementById('btnAnalise');
            if (elAnalise) elAnalise.addEventListener('click', () => analise(pid));
            const elFinalizar = document.getElementById('btnFinalizar');
            if (elFinalizar) elFinalizar.addEventListener('click', () => finalizar(pid));
            const elRetornar = document.getElementById('btnRetornar');
            if (elRetornar) elRetornar.addEventListener('click', () => retornar(pid, st));
            const elPausar = document.getElementById('btnPausar');
            if (elPausar) elPausar.addEventListener('click', () => pausar(pid));
            const elDespausar = document.getElementById('btnDespausar');
            if (elDespausar) elDespausar.addEventListener('click', () => despausar(pid));
            const elCancelar = document.getElementById('btnCancelar');
            if (elCancelar) elCancelar.addEventListener('click', () => cancelar(pid));
            const elReativar = document.getElementById('btnReativar');
            if (elReativar) elReativar.addEventListener('click', () => reativar(pid));

            document.getElementById('btnCobranca').addEventListener('click', () => cobranca(pid));
            document.getElementById('btnAtualizacao').addEventListener('click', () => atualizacao(pid));
            document.getElementById('btnExcluir').addEventListener('click', () => excluir(pid));
            document.getElementById('btnExportPdf').addEventListener('click', () => exportPdf(pid));
            document.getElementById('btnEnviarEmail').addEventListener('click', () => enviarEmail(pid));

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

    // ─── PAUSAR PROJETO ───
    function pausar(pid) {
        const m = App.modal({
            title: 'Pausar Projeto',
            size: 'md',
            body: `
                <p class="text-sm text-muted mb-3">
                    O projeto passará para o status <strong>"Pausado"</strong> e todas as atividades com status
                    <strong>"Novo"</strong> ou <strong>"Em Andamento"</strong> também serão pausadas
                    (atividades já finalizadas são preservadas).
                </p>
                <p class="text-sm mb-3">Enquanto estiver pausado, o projeto <strong>não poderá sofrer alterações</strong>
                (Para Análise, Finalizar, Cobrança, Atualização, Cancelar e Excluir ficam desativados e a tela de
                atividades abre somente para consulta). Use o botão <strong>Despausar</strong> para retomar.</p>
                <div class="form-group">
                    <label>Observação (opcional)</label>
                    <textarea id="fObs" rows="3" placeholder="Motivo da pausa..."></textarea>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Voltar'),
                App.el('button', { class: 'btn btn-secondary', id: 'btnSavePausar' }, 'Pausar Projeto'),
            ]
        });
        document.getElementById('btnSavePausar').addEventListener('click', async () => {
            const obs = document.getElementById('fObs').value.trim();
            try {
                await API.projetos.pausar(pid, { observacao: obs });
                App.toast('Projeto pausado', 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    // ─── DESPAUSAR PROJETO ───
    function despausar(pid) {
        const m = App.modal({
            title: 'Despausar Projeto',
            size: 'md',
            body: `
                <p class="text-sm text-muted mb-3">
                    O projeto voltará para o status <strong>"Em Andamento"</strong> e todas as atividades que
                    foram pausadas também retornarão para <strong>"Em Andamento"</strong>, liberando novamente
                    todas as funcionalidades (Para Análise, Finalizar, Cobrança, Atualização, Cancelar, Excluir
                    e edição de atividades).
                </p>
                <div class="form-group">
                    <label>Observação (opcional)</label>
                    <textarea id="fObs" rows="3" placeholder="Motivo da retomada..."></textarea>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Voltar'),
                App.el('button', { class: 'btn btn-success', id: 'btnSaveDespausar' }, '▶️ Despausar Projeto'),
            ]
        });
        document.getElementById('btnSaveDespausar').addEventListener('click', async () => {
            const obs = document.getElementById('fObs').value.trim();
            try {
                await API.projetos.despausar(pid, { observacao: obs });
                App.toast('Projeto despausado — todas as funcionalidades foram liberadas', 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    // ─── CANCELAR PROJETO ───
    function cancelar(pid) {
        const m = App.modal({
            title: 'Cancelar Projeto',
            size: 'md',
            body: `
                <p class="text-sm text-muted mb-3">
                    O projeto passará para o status <strong>"Cancelado"</strong> e todas as atividades com status
                    <strong>"Novo"</strong> ou <strong>"Em Andamento"</strong> também serão canceladas
                    (atividades já finalizadas são preservadas).
                </p>
                <p class="text-sm mb-3">Enquanto estiver cancelado, o projeto <strong>não poderá sofrer alterações</strong>
                (Para Análise, Finalizar, Cobrança, Atualização, Pausar e Excluir ficam desativados e a tela de
                atividades abre somente para consulta). Use o botão <strong>Reativar</strong> para reverter.</p>
                <div class="form-group">
                    <label>Observação (opcional)</label>
                    <textarea id="fObs" rows="3" placeholder="Motivo do cancelamento..."></textarea>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Voltar'),
                App.el('button', { class: 'btn btn-warning', id: 'btnSaveCancelar' }, 'Cancelar Projeto'),
            ]
        });
        document.getElementById('btnSaveCancelar').addEventListener('click', async () => {
            const obs = document.getElementById('fObs').value.trim();
            try {
                await API.projetos.cancelar(pid, { observacao: obs });
                App.toast('Projeto cancelado', 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    // ─── REATIVAR PROJETO ───
    function reativar(pid) {
        const m = App.modal({
            title: 'Reativar Projeto',
            size: 'md',
            body: `
                <p class="text-sm text-muted mb-3">
                    O projeto voltará para o status <strong>"Em Andamento"</strong> e todas as atividades que
                    foram canceladas retornarão para <strong>"Em Andamento"</strong>, liberando novamente
                    todas as funcionalidades (Para Análise, Finalizar, Cobrança, Atualização, Pausar, Excluir
                    e edição de atividades).
                </p>
                <div class="form-group">
                    <label>Observação (opcional)</label>
                    <textarea id="fObs" rows="3" placeholder="Motivo da reativação..."></textarea>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Voltar'),
                App.el('button', { class: 'btn btn-warning', id: 'btnSaveReativar' }, '🔄 Reativar Projeto'),
            ]
        });
        document.getElementById('btnSaveReativar').addEventListener('click', async () => {
            const obs = document.getElementById('fObs').value.trim();
            try {
                await API.projetos.reativar(pid, { observacao: obs });
                App.toast('Projeto reativado — todas as funcionalidades foram liberadas', 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    // ─── RETORNAR PROJETO (de Aguardando/Finalizado) ───
    function retornar(pid, deStatus) {
        const m = App.modal({
            title: 'Retornar Projeto ao Fluxo',
            size: 'md',
            body: `
                <p class="text-sm text-muted mb-3">
                    O projeto sairá do status <strong>${deStatus}</strong> e voltará a ser editável.
                    Escolha para qual status ele deve retornar:
                </p>
                <div class="form-group mb-3">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;margin-bottom:10px">
                        <input type="radio" name="fNovoStatus" value="Em Andamento" checked style="width:auto">
                        <span><strong>Em Andamento</strong> — o projeto segue em execução</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                        <input type="radio" name="fNovoStatus" value="Novo" style="width:auto">
                        <span><strong>Novo</strong> — o projeto (re)começa do início</span>
                    </label>
                </div>
                <p class="text-sm text-muted mb-3">A data de finalização do projeto será limpa. Os status das
                atividades são preservados e poderão ser editados novamente via Esquema.</p>
                <div class="form-group">
                    <label>Observação (opcional)</label>
                    <textarea id="fObs" rows="3" placeholder="Motivo do retorno..."></textarea>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Voltar'),
                App.el('button', { class: 'btn btn-warning', id: 'btnSaveRetornar' }, '↩️ Retornar Projeto'),
            ]
        });
        document.getElementById('btnSaveRetornar').addEventListener('click', async () => {
            const sel = document.querySelector('input[name="fNovoStatus"]:checked');
            const novoStatus = sel ? sel.value : 'Em Andamento';
            const obs = document.getElementById('fObs').value.trim();
            try {
                await API.projetos.retornar(pid, { status: novoStatus, observacao: obs });
                App.toast(`Projeto retornado para "${novoStatus}"`, 'success');
                m.close();
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    // ─── EXCLUIR PROJETO ───
    function excluir(pid) {
        const m = App.modal({
            title: 'Excluir Projeto',
            size: 'md',
            body: `
                <div class="warning-box">
                    <p><strong>Atenção!</strong> Você está prestes a excluir permanentemente este projeto.</p>
                    <p>Todos os dados serão perdidos:</p>
                    <ul>
                        <li>Dados do projeto</li>
                        <li>Todas as atividades</li>
                        <li>Todas as atualizações</li>
                        <li>Todas as cobranças registradas</li>
                    </ul>
                    <p class="text-danger"><strong>Esta ação NÃO pode ser desfeita.</strong></p>
                </div>
                <p class="text-sm mt-3">Para confirmar, digite <strong>EXCLUIR</strong> no campo abaixo:</p>
                <div class="form-group">
                    <input type="text" id="fConfirm" placeholder="Digite EXCLUIR" autocomplete="off">
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Voltar'),
                App.el('button', { class: 'btn btn-danger', id: 'btnSaveExcluir', disabled: 'disabled' }, 'Excluir Definitivamente'),
            ]
        });
        // Só habilita o botão de exclusão se o usuário digitar EXCLUIR
        const inp = document.getElementById('fConfirm');
        const btn = document.getElementById('btnSaveExcluir');
        inp.addEventListener('input', () => {
            btn.disabled = (inp.value.trim().toUpperCase() !== 'EXCLUIR');
        });
        btn.addEventListener('click', async () => {
            if (inp.value.trim().toUpperCase() !== 'EXCLUIR') {
                App.toast('Digite EXCLUIR para confirmar', 'warning');
                return;
            }
            try {
                await API.projetos.delete(pid);
                App.toast('Projeto excluído', 'success');
                m.close();
                App.navigate('/projetos');
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    // ─── VER ATUALIZAÇÕES (popup) ───
    async function verAtualizacoes(pid) {
        try {
            const data = await API.projetos.get(pid);
            const atualizacoes = data.atualizacoes || [];
            const html = atualizacoes.length
                ? atualizacoes.map(a => `
                    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
                        <strong style="color:var(--primary);font-size:12px">${App.fmtDate(a.Data)}</strong>
                        <p style="margin:4px 0 0;padding-left:8px;font-size:13px">${escapeHtml(a.Observacao || '')}</p>
                    </div>
                `).join('')
                : '<p class="text-muted">Sem atualizações registradas.</p>';

            App.modal({
                title: 'Atualizações do Projeto',
                size: 'lg',
                body: `<div style="max-height:60vh;overflow-y:auto">${html}</div>`,
                footer: [
                    App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Fechar'),
                ]
            });
        } catch (e) {
            App.toast('Erro ao carregar atualizações: ' + e.message, 'error');
        }
    }

    function escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // ─── ENVIAR EMAIL ───
    async function enviarEmail(pid) {
        // Verifica se email está configurado
        let emailCfg;
        try {
            emailCfg = await API.emailConfig.get();
        } catch (e) {
            App.toast('Erro ao verificar configuração de e-mail', 'error');
            return;
        }

        if (!emailCfg.configured) {
            App.toast('Configure o e-mail em Configurações > E-mail antes de enviar.', 'warning');
            return;
        }

        // Busca dados do projeto para mostrar destinatários
        let projetoData;
        try {
            projetoData = await API.projetos.get(pid);
        } catch (e) {
            App.toast('Erro ao carregar projeto', 'error');
            return;
        }

        // Coleta responsáveis únicos
        const respSet = new Set();
        if (projetoData.projeto.Responsavel) respSet.add(projetoData.projeto.Responsavel);
        (projetoData.atividades || []).forEach(a => { if (a.Responsavel) respSet.add(a.Responsavel); });
        const respList = [...respSet].join(', ') || 'Nenhum responsável definido';

        const m = App.modal({
            title: 'Enviar E-mail de Abertura do Projeto',
            size: 'md',
            body: `
                <div class="mb-3">
                    <p class="text-sm text-muted mb-2">O e-mail será enviado para todos os responsáveis cadastrados no projeto e nas atividades que possuírem e-mail:</p>
                    <div style="background:#f0f4ff;border:1px solid #bdd0ff;border-radius:6px;padding:10px 14px;font-size:13px;margin-bottom:14px">
                        <strong>Responsáveis envolvidos:</strong> ${escapeHtml(respList)}
                    </div>
                </div>

                <div class="form-group mb-3">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                        <input type="checkbox" id="fEmailGantt" style="width:auto">
                        Incluir gráfico de Gantt como anexo (PNG)
                    </label>
                    <p class="text-sm text-muted" style="margin-left:26px;margin-top:4px">O Gantt será gerado a partir das atividades atuais do projeto.</p>
                </div>

                <div class="warning-box" style="background:#FFFBEB;border-color:#FDE68A;color:#92400E">
                    <p style="margin:0;font-size:12.5px">⚠️ Certifique-se de que os responsáveis possuem e-mail cadastrado na tela de <strong>Responsáveis</strong>. Responsáveis sem e-mail serão ignorados.</p>
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                App.el('button', { class: 'btn btn-primary', id: 'btnConfirmEmail', style: 'background:#0078D4;border-color:#0078D4' }, '📧 Enviar E-mail'),
            ]
        });

        document.getElementById('btnConfirmEmail').addEventListener('click', async () => {
            const incluirGantt = document.getElementById('fEmailGantt').checked;
            const btn = document.getElementById('btnConfirmEmail');
            btn.disabled = true;
            btn.textContent = 'Enviando...';

            let ganttImage = null;
            if (incluirGantt) {
                btn.textContent = 'Gerando Gantt...';
                ganttImage = await captureGanttForEmail();
                if (!ganttImage) {
                    App.toast('Não foi possível gerar o Gantt. Envie sem o anexo ou abra o Gantt primeiro.', 'warning');
                    btn.disabled = false;
                    btn.textContent = '📧 Enviar E-mail';
                    return;
                }
            }

            try {
                const result = await API.enviarEmail(pid, {
                    incluir_gantt: incluirGantt,
                    gantt_image: ganttImage,
                });

                App.toast(result.message || 'E-mail enviado com sucesso!', 'success');
                m.close();
                // Recarrega a tela para mostrar a atualização
                renderTela(pid);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
                btn.disabled = false;
                btn.textContent = '📧 Enviar E-mail';
            }
        });
    }

    // Gera o Gantt SVG como base64 PNG para anexo de email
    function captureGanttForEmail() {
        try {
            // Cria container oculto para renderizar o Gantt
            const hidden = document.createElement('div');
            hidden.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden';
            document.body.appendChild(hidden);

            // Coleta as linhas de atividades da tabela na tela
            const table = document.getElementById('ativTable');
            if (!table) { document.body.removeChild(hidden); return null; }

            const rows = [...table.querySelectorAll('tbody tr')];
            if (!rows.length) { document.body.removeChild(hidden); return null; }

            // Gera SVG usando mesma lógica do Gantt
            const ativData = rows.map((tr, i) => {
                const tds = tr.querySelectorAll('td');
                return {
                    seq: i + 1,
                    atividade: tds[1]?.textContent?.trim() || '',
                    responsavel: tds[2]?.textContent?.trim() || '',
                    inicio: tds[4]?.textContent?.trim() || '',
                    previsao: tds[5]?.textContent?.trim() || '',
                    status: tds[7]?.textContent?.trim() || 'Novo',
                };
            });

            // Converte datas DD/MM/YYYY para YYYY-MM-DD
            function parseBrDate(s) {
                if (!s || s === '—') return null;
                const parts = s.split('/');
                if (parts.length !== 3) return null;
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            const validRows = ativData.filter(r => r.inicio && r.inicio !== '—');
            if (!validRows.length) { document.body.removeChild(hidden); return null; }

            // Gera SVG inline (simplificado para captura)
            const dayWidth = 44;
            const rowHeight = 28;
            const headerHeight = 65;
            let minDate = validRows.reduce((m, r) => { const d = parseBrDate(r.inicio); return d && d < m ? d : m; }, parseBrDate(validRows[0].inicio));
            let maxDate = validRows.reduce((m, r) => { const d = parseBrDate(r.previsao) || parseBrDate(r.inicio); return d && d > m ? d : m; }, minDate);

            function parseLocal(str) { const [y,m,d] = str.split('-').map(Number); return new Date(y,m-1,d); }
            function toISO(dt) { return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }

            const minD = parseLocal(minDate);
            const maxD = parseLocal(maxDate);
            const daysDiff = Math.round((maxD - minD) / 86400000);
            const totalDays = Math.max(15, daysDiff + 3);
            const startD = new Date(minD); startD.setDate(startD.getDate() - 1);

            const width = totalDays * dayWidth + 20;
            const height = headerHeight + validRows.length * rowHeight + 10;
            const x0 = 10;

            const dateToX = (dateStr) => {
                const d = parseLocal(dateStr);
                const days = Math.round((d - startD) / 86400000);
                return x0 + days * dayWidth;
            };

            let svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:#fff;font-family:Segoe UI,Helvetica,Arial,sans-serif">`;

            // Fundo branco
            svgStr += `<rect width="100%" height="100%" fill="#fff"/>`;

            // Headers dias
            for (let i = 0; i < totalDays; i++) {
                const d = new Date(startD); d.setDate(d.getDate() + i);
                const x = x0 + i * dayWidth;
                const isWE = d.getDay() === 0 || d.getDay() === 6;
                if (isWE) svgStr += `<rect x="${x}" y="44" width="${dayWidth}" height="${height-44}" fill="#F3F4F6"/>`;
                svgStr += `<rect x="${x}" y="44" width="${dayWidth}" height="21" fill="#5A8A9F"/>`;
                svgStr += `<text x="${x+dayWidth/2}" y="58" fill="#fff" font-size="12" font-weight="600" text-anchor="middle">${d.getDate()}</text>`;
                svgStr += `<line x1="${x+dayWidth}" y1="65" x2="${x+dayWidth}" y2="${height-5}" stroke="#E5E7EB" stroke-width="0.5"/>`;
            }

            // Mês header
            let curMonth = null; let mStartX = x0;
            for (let i = 0; i <= totalDays; i++) {
                const d = new Date(startD); d.setDate(d.getDate() + i);
                const mk = `${d.getFullYear()}-${d.getMonth()}`;
                if (curMonth === null) curMonth = mk;
                if (mk !== curMonth || i === totalDays) {
                    const endX = i === totalDays ? x0 + totalDays * dayWidth : dateToX(toISO(d));
                    const w = endX - mStartX;
                    const monthName = new Date(startD.getFullYear(), startD.getMonth(), 1).toLocaleDateString('pt-BR', {month:'short'});
                    svgStr += `<rect x="${mStartX}" y="22" width="${w}" height="22" fill="#4A4B52"/>`;
                    svgStr += `<text x="${mStartX+w/2}" y="37" fill="#fff" font-size="13" font-weight="700" text-anchor="middle">${monthName}</text>`;
                    curMonth = mk;
                    mStartX = endX;
                }
            }

            // Barras
            validRows.forEach((r, idx) => {
                const y = headerHeight + idx * rowHeight;
                svgStr += `<line x1="${x0}" y1="${y+rowHeight}" x2="${x0+totalDays*dayWidth}" y2="${y+rowHeight}" stroke="#E5E7EB" stroke-width="0.5"/>`;
                const ini = parseBrDate(r.inicio);
                const prev = parseBrDate(r.previsao) || ini;
                if (!ini) return;
                const xIni = dateToX(ini);
                const xFim = dateToX(prev) + dayWidth;
                const w = Math.max(dayWidth, xFim - xIni);
                let fill = '#E7D264';
                if (r.status === 'Finalizado') fill = '#10B981';
                svgStr += `<rect x="${xIni}" y="${y+4}" width="${w}" height="${rowHeight-8}" fill="${fill}" rx="4"/>`;
                const label = r.atividade.length > 20 ? r.atividade.slice(0,20)+'…' : r.atividade;
                svgStr += `<text x="${xIni+6}" y="${y+rowHeight/2+4}" fill="#1A1A1A" font-size="12" font-weight="500">${idx+1}. ${label.replace(/</g,'&lt;')}</text>`;
            });

            svgStr += `</svg>`;

            // Renderiza SVG em canvas
            const blob = new Blob([svgStr], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(blob);
            const scale = 2;
            const canvas = document.createElement('canvas');
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);

            const img = new Image();
            let result = null;

            // Síncrono via callback (timeout para aguardar load)
            const loadPromise = new Promise((resolve) => {
                img.onload = () => {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/png', 0.92));
                };
                img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
                img.src = url;
            });

            // Usamos um XMLHttpRequest síncrono para bloquear... na verdade, vamos usar async
            // Retornamos a promise e o chamador espera
            return loadPromise;
        } catch (e) {
            console.error('Erro ao gerar Gantt para email:', e);
            return null;
        }
    }

    // ─── EXPORTAR PDF ───
    function exportPdf(pid) {
        const m = App.modal({
            title: 'Exportar PDF do Projeto',
            size: 'sm',
            body: `
                <p class="text-sm text-muted mb-3">Selecione o que deseja incluir no PDF:</p>
                <div class="form-group mb-2">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                        <input type="checkbox" id="fPdfAtualizacoes" style="width:auto">
                        Incluir Atualizações
                    </label>
                </div>
                <div class="form-group mb-3">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                        <input type="checkbox" id="fPdfCobrancas" style="width:auto">
                        Incluir Cobranças
                    </label>
                </div>
                <p class="text-sm text-muted">Se nenhum checkbox estiver marcado, será exportado apenas o esqueleto do projeto (dados + atividades).</p>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                App.el('button', { class: 'btn btn-primary', id: 'btnConfirmPdf', style: 'background:#E7D264;color:#1a1a1a;border-color:#E7D264' }, '📄 Gerar PDF'),
            ]
        });

        document.getElementById('btnConfirmPdf').addEventListener('click', async () => {
            const incluirAtualizacoes = document.getElementById('fPdfAtualizacoes').checked;
            const incluirCobrancas = document.getElementById('fPdfCobrancas').checked;

            const btn = document.getElementById('btnConfirmPdf');
            btn.disabled = true;
            btn.textContent = 'Gerando...';

            try {
                const result = await API.projetos.exportPdf(pid, {
                    atualizacoes: incluirAtualizacoes,
                    cobrancas: incluirCobrancas,
                });

                // Download via URL direta (funciona no pywebview)
                const a = document.createElement('a');
                a.href = result.download_url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                App.toast('PDF gerado com sucesso!', 'success');
                m.close();
            } catch (e) {
                App.toast('Erro ao gerar PDF: ' + e.message, 'error');
                btn.disabled = false;
                btn.textContent = '📄 Gerar PDF';
            }
        });
    }

    return { renderCadastro, renderLista, renderTela, finalizarAtividade, verAtualizacoes };
})();
