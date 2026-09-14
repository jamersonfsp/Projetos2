/* =========================================================
   setor.js - CRUD de Setores
   ========================================================= */

const SetorView = (() => {

    let lista = [];
    let selectedId = null;

    async function render() {
        const view = document.getElementById('view');
        view.className = 'view-container crud-view';
        view.innerHTML = `
            <div class="page-header">
                <h2>Setores</h2>
            </div>
            <div class="crud-layout">
                <div class="list-pane" id="listPane">
                    <div class="loading">Carregando...</div>
                </div>
                <div class="form-pane" id="formPane">
                    <h3>Novo Setor</h3>
                    <form id="formSetor">
                        <div class="form-group mb-3">
                            <label>Nome *</label>
                            <input type="text" name="Nome" required>
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
            document.getElementById('formSetor').reset();
            document.querySelector('#formPane h3').textContent = 'Novo Setor';
            document.getElementById('btnDel').style.display = 'none';
            document.querySelectorAll('.list-card-item').forEach(el => el.classList.remove('active'));
        });

        document.getElementById('btnDel').addEventListener('click', async () => {
            if (!selectedId) return;
            if (!App.confirm('Excluir este setor?')) return;
            try {
                await API.setores.delete(selectedId);
                App.toast('Excluído!', 'success');
                selectedId = null;
                document.getElementById('formSetor').reset();
                document.querySelector('#formPane h3').textContent = 'Novo Setor';
                document.getElementById('btnDel').style.display = 'none';
                load();
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });

        document.getElementById('formSetor').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = {};
            fd.forEach((v, k) => data[k] = v);
            try {
                if (selectedId) {
                    await API.setores.update(selectedId, data);
                    App.toast('Atualizado!', 'success');
                } else {
                    await API.setores.create(data);
                    App.toast('Criado!', 'success');
                }
                e.target.reset();
                selectedId = null;
                document.querySelector('#formPane h3').textContent = 'Novo Setor';
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
            lista = await API.setores.list();
            if (!lista.length) {
                pane.innerHTML = `
                    <div class="empty-state" style="padding:30px">
                        <h3>Nenhum setor</h3>
                        <p>Cadastre o primeiro usando o formulário ao lado.</p>
                    </div>
                `;
                return;
            }
            pane.innerHTML = '';
            const card = document.createElement('div');
            card.className = 'list-card';
            lista.forEach(s => {
                const item = document.createElement('div');
                item.className = 'list-card-item';
                item.dataset.id = s.ID;
                item.innerHTML = `
                    <div class="item-info">
                        <div class="item-name">${escapeHtml(s.Nome)}</div>
                    </div>
                `;
                item.addEventListener('click', () => select(s));
                card.appendChild(item);
            });
            pane.appendChild(card);
        } catch (e) {
            pane.innerHTML = `<div class="empty-state"><p>Erro: ${e.message}</p></div>`;
        }
    }

    function select(s) {
        selectedId = s.ID;
        document.querySelector('#formPane h3').textContent = 'Editar Setor';
        document.querySelector('#formSetor input[name="Nome"]').value = s.Nome || '';
        document.getElementById('btnDel').style.display = '';
        document.querySelectorAll('.list-card-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.id) === s.ID);
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
