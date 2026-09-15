/* =========================================================
   modelos.js - Cadastro de Modelos de Atividades
   ========================================================= */

const ModelosView = (() => {

    let modelos = [];
    let responsaveis = [];
    let modeloAtual = null;
    let atividadesModelo = [];

    // ─── Renderiza a tela principal ───
    async function render() {
        const view = document.getElementById('view');
        view.className = 'view-container modelos-view';

        try {
            [modelos, responsaveis] = await Promise.all([
                API.modelos.list(),
                API.responsaveis.list()
            ]);
        } catch (e) {
            App.toast('Erro ao carregar: ' + e.message, 'error');
        }

        view.innerHTML = `
            <div class="page-header">
                <h2>Cadastro de Modelo de Atividades</h2>
            </div>

            <div class="card mb-3">
                <div class="modelo-selector">
                    <div class="form-group" style="flex:1">
                        <label>Selecionar Modelo</label>
                        <input type="text" id="fBuscaModelo" placeholder="Digite para filtrar..."
                               autocomplete="off" list="listaModelos">
                        <datalist id="listaModelos">
                            ${modelos.map(m => `<option value="${m.ID}" data-nome="${App.fmtDate ? m.Nome : m.Nome}">${m.Nome}</option>`).join('')}
                        </datalist>
                    </div>
                    <div class="modelo-botoes">
                        <button class="btn btn-primary" id="btnAbrir">Abrir</button>
                        <button class="btn btn-success" id="btnNovo">+ Novo</button>
                        <button class="btn btn-danger" id="btnExcluirModelo" style="display:none">Excluir</button>
                    </div>
                </div>
            </div>

            <div id="modeloArea">
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <h3>Selecione ou crie um modelo</h3>
                    <p>Use o campo acima para buscar um modelo existente ou clique em "+ Novo" para criar.</p>
                </div>
            </div>
        `;

        document.getElementById('btnNovo').addEventListener('click', () => novoModelo());
        document.getElementById('btnAbrir').addEventListener('click', () => abrirModelo());
        document.getElementById('btnExcluirModelo').addEventListener('click', () => excluirModelo());
        document.getElementById('fBuscaModelo').addEventListener('input', onBuscaInput);
    }

    // ─── Busca: filtra datalist conforme digita ───
    function onBuscaInput() {
        const busca = document.getElementById('fBuscaModelo').value.toLowerCase().trim();
        const btnExcluir = document.getElementById('btnExcluirModelo');
        // Mostra botão excluir se selecionou um modelo válido
        const modelo = modelos.find(m => String(m.ID) === busca || m.Nome.toLowerCase() === busca);
        btnExcluir.style.display = modelo ? 'inline-flex' : 'none';
    }

    // ─── Resolve o modelo selecionado pelo input ───
    function getModeloSelecionado() {
        const busca = document.getElementById('fBuscaModelo').value.trim();
        // Tenta por ID
        let m = modelos.find(x => String(x.ID) === busca);
        if (!m) {
            // Tenta por nome (case insensitive)
            m = modelos.find(x => x.Nome.toLowerCase() === busca.toLowerCase());
        }
        return m;
    }

    // ─── Novo Modelo ───
    function novoModelo() {
        const m = App.modal({
            title: 'Novo Modelo de Atividades',
            size: 'sm',
            body: `
                <div class="form-group">
                    <label>Nome do Modelo *</label>
                    <input type="text" id="fNomeModelo" maxlength="200" placeholder="Ex: Projeto de Implantação">
                </div>
            `,
            footer: [
                App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                App.el('button', { class: 'btn btn-success', id: 'btnCriarModelo' }, 'Criar e Editar Atividades'),
            ]
        });

        document.getElementById('btnCriarModelo').addEventListener('click', async () => {
            const nome = document.getElementById('fNomeModelo').value.trim();
            if (!nome) {
                App.toast('Informe o nome do modelo', 'warning');
                return;
            }
            try {
                const r = await API.modelos.create({ Nome: nome });
                App.toast('Modelo criado!', 'success');
                m.close();
                // Atualiza lista local
                modelos = await API.modelos.list();
                document.getElementById('fBuscaModelo').value = String(r.ID);
                renderEditor(r.ID, nome, []);
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });
    }

    // ─── Abrir Modelo ───
    async function abrirModelo() {
        const modelo = getModeloSelecionado();
        if (!modelo) {
            App.toast('Selecione um modelo válido', 'warning');
            return;
        }
        try {
            const data = await API.modelos.get(modelo.ID);
            renderEditor(modelo.ID, modelo.Nome, data.atividades || []);
        } catch (e) {
            App.toast('Erro: ' + e.message, 'error');
        }
    }

    // ─── Excluir Modelo ───
    async function excluirModelo() {
        const modelo = getModeloSelecionado();
        if (!modelo) return;
        if (!App.confirm(`Excluir o modelo "${modelo.Nome}"? Todas as atividades do modelo serão removidas.`)) return;
        try {
            await API.modelos.delete(modelo.ID);
            App.toast('Modelo excluído', 'success');
            modelos = await API.modelos.list();
            document.getElementById('fBuscaModelo').value = '';
            document.getElementById('btnExcluirModelo').style.display = 'none';
            render();
        } catch (e) {
            App.toast('Erro: ' + e.message, 'error');
        }
    }

    // ─── Editor de Atividades do Modelo ───
    function renderEditor(modeloId, nomeModelo, atividades) {
        modeloAtual = modeloId;
        atividadesModelo = atividades;
        const area = document.getElementById('modeloArea');

        area.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Modelo: <strong>${escapeHtml(nomeModelo)}</strong></h3>
                    <div class="actions">
                        <button class="btn btn-sm btn-secondary" id="btnAddLinha">+ Adicionar Atividade</button>
                        <button class="btn btn-sm btn-primary" id="btnSalvarModelo">Salvar Modelo</button>
                    </div>
                </div>

                <div class="modelo-atividades-wrap">
                    <table class="data-table" id="modeloTable">
                        <thead>
                            <tr>
                                <th style="width:40px">#</th>
                                <th>Atividade</th>
                                <th style="width:160px">Responsável</th>
                                <th style="width:100px">Dependência</th>
                                <th style="width:80px">Duração</th>
                                <th style="width:40px"></th>
                            </tr>
                        </thead>
                        <tbody id="modeloBody"></tbody>
                    </table>
                </div>

                <div class="mt-3">
                    <p class="text-sm text-muted">
                        <strong>Dependência:</strong> informe o número da sequência da atividade predecessora.
                        Ex: se a atividade 2 depende da 1, coloque "1" no campo dependência.
                    </p>
                </div>
            </div>
        `;

        renderLinhas();

        document.getElementById('btnAddLinha').addEventListener('click', () => addLinha());
        document.getElementById('btnSalvarModelo').addEventListener('click', () => salvarModelo(modeloId));
    }

    // ─── Renderiza as linhas da tabela ───
    function renderLinhas() {
        const tbody = document.getElementById('modeloBody');
        App.clear(tbody);

        if (atividadesModelo.length === 0) {
            addLinha();
            return;
        }

        atividadesModelo.forEach((a, idx) => {
            tbody.appendChild(createLinha(a, idx + 1));
        });
    }

    // ─── Cria uma linha da tabela ───
    function createLinha(a, seq) {
        const tr = App.el('tr', { 'data-seq': seq });

        // #
        tr.appendChild(App.el('td', { class: 'row-num' }, String(seq)));

        // Atividade
        const tdAtiv = App.el('td', {});
        tdAtiv.appendChild(App.el('input', {
            type: 'text', name: 'Atividade',
            value: a.Atividade || '', placeholder: 'Descrição da atividade'
        }));
        tr.appendChild(tdAtiv);

        // Responsável
        const tdResp = App.el('td', {});
        const selResp = App.el('select', { name: 'Responsavel' });
        selResp.appendChild(App.el('option', { value: '' }, '—'));
        responsaveis.forEach(r => {
            const o = App.el('option', { value: r.Nome }, r.Nome);
            if (a.Responsavel === r.Nome) o.selected = true;
            selResp.appendChild(o);
        });
        tdResp.appendChild(selResp);
        tr.appendChild(tdResp);

        // Dependência
        const tdDep = App.el('td', {});
        const inpDep = App.el('input', {
            type: 'number', name: 'Dependencia', min: '1',
            value: a.Dependencia || '', placeholder: '—'
        });
        tdDep.appendChild(inpDep);
        tr.appendChild(tdDep);

        // Duração
        const tdDur = App.el('td', {});
        const inpDur = App.el('input', {
            type: 'number', name: 'Duracao', min: '1',
            value: String(a.Duracao || 1)
        });
        tdDur.appendChild(inpDur);
        tr.appendChild(tdDur);

        // Excluir
        const tdDel = App.el('td', {});
        const btnDel = App.el('button', { class: 'btn-del', title: 'Excluir' }, '✕');
        btnDel.addEventListener('click', () => {
            tr.remove();
            renumerar();
        });
        tdDel.appendChild(btnDel);
        tr.appendChild(tdDel);

        // Enter adiciona nova linha
        tdAtiv.querySelector('input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addLinha(); }
        });

        return tr;
    }

    // ─── Adiciona nova linha ───
    function addLinha() {
        const tbody = document.getElementById('modeloBody');
        const seq = tbody.children.length + 1;
        tbody.appendChild(createLinha({}, seq));
        setTimeout(() => {
            const lastRow = tbody.lastElementChild;
            if (lastRow) lastRow.querySelector('input[name="Atividade"]').focus();
        }, 50);
    }

    // ─── Renumera linhas ───
    function renumerar() {
        const tbody = document.getElementById('modeloBody');
        [...tbody.children].forEach((tr, i) => {
            tr.dataset.seq = i + 1;
            tr.querySelector('.row-num').textContent = String(i + 1);
        });
    }

    // ─── Coleta dados das linhas ───
    function collectLinhas() {
        const rows = document.querySelectorAll('#modeloBody tr');
        return [...rows].map((tr, i) => {
            const get = (name) => {
                const el = tr.querySelector(`[name="${name}"]`);
                return el ? el.value : null;
            };
            return {
                sequencia: i + 1,
                Atividade: get('Atividade'),
                Responsavel: get('Responsavel'),
                Dependencia: get('Dependencia') ? parseInt(get('Dependencia')) : null,
                Duracao: parseInt(get('Duracao')) || 1,
            };
        });
    }

    // ─── Salvar Modelo ───
    async function salvarModelo(modeloId) {
        const data = collectLinhas();
        const validas = data.filter(a => a.Atividade && a.Atividade.trim());
        if (validas.length === 0) {
            App.toast('Adicione pelo menos uma atividade', 'warning');
            return;
        }
        try {
            await API.modelos.saveAtividades(modeloId, { atividades: validas });
            App.toast('Modelo salvo com sucesso!', 'success');
        } catch (e) {
            App.toast('Erro ao salvar: ' + e.message, 'error');
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
