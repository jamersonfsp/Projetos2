/* =========================================================
   responsaveis.js - CRUD de Responsáveis
   ========================================================= */

const ResponsaveisView = (() => {

    let lista = [];
    let selectedId = null;

    async function render() {
        const view = document.getElementById('view');
        view.className = 'view-container crud-view';
        view.innerHTML = `
            <div class="page-header">
                <h2>Responsáveis</h2>
            </div>
            <div class="crud-layout">
                <div class="list-pane" id="listPane">
                    <div class="loading">Carregando...</div>
                </div>
                <div class="form-pane" id="formPane">
                    <h3>Novo Responsável</h3>
                    <form id="formResp">
                        <div class="form-group mb-3">
                            <label>Nome *</label>
                            <input type="text" name="Nome" required>
                        </div>
                        <div class="form-group mb-3">
                            <label>Email</label>
                            <input type="email" name="email">
                        </div>
                        <div class="flex gap-2">
                            <button type="submit" class="btn btn-primary">Salvar</button>
                            <button type="button" class="btn btn-secondary" id="btnNew">Novo</button>
                            <button type="button" class="btn btn-danger" id="btnDel" style="display:none">Excluir</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.getElementById('btnNew').addEventListener('click', () => {
            selectedId = null;
            document.getElementById('formResp').reset();
            document.querySelector('#formPane h3').textContent = 'Novo Responsável';
            document.getElementById('btnDel').style.display = 'none';
            document.querySelectorAll('.list-card-item').forEach(el => el.classList.remove('active'));
        });

        document.getElementById('btnDel').addEventListener('click', async () => {
            if (!selectedId) return;
            if (!App.confirm('Excluir este responsável?')) return;
            try {
                await API.responsaveis.delete(selectedId);
                App.toast('Excluído!', 'success');
                selectedId = null;
                document.getElementById('formResp').reset();
                document.querySelector('#formPane h3').textContent = 'Novo Responsável';
                document.getElementById('btnDel').style.display = 'none';
                load();
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });

        document.getElementById('formResp').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = {};
            fd.forEach((v, k) => data[k] = v);
            try {
                if (selectedId) {
                    await API.responsaveis.update(selectedId, data);
                    App.toast('Atualizado!', 'success');
                } else {
                    await API.responsaveis.create(data);
                    App.toast('Criado!', 'success');
                }
                e.target.reset();
                selectedId = null;
                document.querySelector('#formPane h3').textContent = 'Novo Responsável';
                document.getElementById('btnDel').style.display = 'none';
                load();
            } catch (err) {
                App.toast('Erro: ' + err.message, 'error');
            }
        });

        load();
    }

    async function load() {
        const pane = document.getElementById('listPane');
        try {
            lista = await API.responsaveis.list();
            if (!lista.length) {
                pane.innerHTML = `
                    <div class="empty-state" style="padding:30px">
                        <h3>Nenhum responsável</h3>
                        <p>Cadastre o primeiro usando o formulário ao lado.</p>
                    </div>
                `;
                return;
            }
            pane.innerHTML = '';
            const card = document.createElement('div');
            card.className = 'list-card';
            lista.forEach(r => {
                const item = document.createElement('div');
                item.className = 'list-card-item';
                item.dataset.id = r.ID;
                item.innerHTML = `
                    <div class="item-info">
                        <div class="item-name">${escapeHtml(r.Nome)}</div>
                        <div class="item-meta">${escapeHtml(r.email || '—')}</div>
                    </div>
                `;
                item.addEventListener('click', () => select(r));
                card.appendChild(item);
            });
            pane.appendChild(card);
        } catch (e) {
            pane.innerHTML = `<div class="empty-state"><p>Erro: ${e.message}</p></div>`;
        }
    }

    function select(r) {
        selectedId = r.ID;
        document.querySelector('#formPane h3').textContent = 'Editar Responsável';
        document.querySelector('#formResp input[name="Nome"]').value = r.Nome || '';
        document.querySelector('#formResp input[name="email"]').value = r.email || '';
        document.getElementById('btnDel').style.display = '';
        document.querySelectorAll('.list-card-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.id) === r.ID);
        });
    }

    function escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    return { render };
})();
