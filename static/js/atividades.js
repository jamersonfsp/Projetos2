/* =========================================================
   atividades.js - Cadastro de Atividades + Gantt SVG
   v2 - Correções: dependência automática, Gantt timezone,
        layout lado a lado com scroll sincronizado
   ========================================================= */

const AtividadesView = (() => {

    let projetoId = null;
    let projeto = null;
    let atividades = [];
    let responsaveis = [];
    let dataPretendida = '';
    let onCloseCallback = null;
    let modalObj = null;

    // ─── Parse de data SEM timezone (evita off-by-one) ───
    function parseLocalDate(str) {
        if (!str) return null;
        const [y, m, d] = str.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function toISODate(dt) {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // ─── Abre o modal principal ───
    async function openModal(pid, onClose) {
        projetoId = pid;
        onCloseCallback = onClose;

        try {
            const data = await API.projetos.get(pid);
            projeto = data.projeto;
            atividades = data.atividades || [];
            responsaveis = await API.responsaveis.list();
        } catch (e) {
            App.toast('Erro ao carregar: ' + e.message, 'error');
            return;
        }

        dataPretendida = projeto.Previsao || '';

        // Carrega modelos disponíveis
        let modelos = [];
        try {
            modelos = await API.modelos.list();
        } catch (e) {}

        const body = document.createElement('div');
        body.innerHTML = `
            <div class="ativ-header-bar" id="ativHeaderBar">
                <div class="ativ-header-row">
                    <div class="form-group">
                        <label>Início do projeto</label>
                        <strong>${App.fmtDate(projeto.Inicio)}</strong>
                    </div>
                    <div class="form-group">
                        <label>Data pretendida</label>
                        <input type="date" id="fDataPretendida" value="${dataPretendida}">
                    </div>
                    <div class="form-group" style="flex:1">
                        <label>Importar de Modelo</label>
                        <select id="fModeloSelect">
                            <option value="">— Nenhum —</option>
                            ${modelos.map(m => `<option value="${m.ID}">${escapeHtml(m.Nome)}</option>`).join('')}
                        </select>
                    </div>
                    <button class="btn btn-secondary" id="btnImportarModelo">Importar</button>
                    <button class="btn-icon-sm" id="btnToggleHeader" title="Recolher/Expandir">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                </div>
            </div>

            <div class="atividades-side-by-side" id="ativSideBySide">
                <div class="ativ-left" id="ativLeft">
                    <table class="ativ-table" id="ativTable">
                        <thead>
                            <tr>
                                <th class="col-num">#</th>
                                <th class="col-ativ">Atividade</th>
                                <th class="col-resp">Responsável</th>
                                <th class="col-dep">Dep.</th>
                                <th class="col-ini">Início</th>
                                <th class="col-dur">Dur.</th>
                                <th class="col-prev">Previsão</th>
                                <th class="col-status">Status</th>
                                <th class="col-chk">Sáb</th>
                                <th class="col-chk">Dom</th>
                                <th class="col-act"></th>
                            </tr>
                        </thead>
                        <tbody id="ativBody"></tbody>
                    </table>
                </div>
                <div class="ativ-right" id="ativRight">
                    <div class="gantt-header-bar">
                        <span>Gráfico de Gantt</span>
                        <div style="display:flex;gap:6px;align-items:center">
                            <select id="fGanttFormat" style="padding:3px 6px;font-size:11px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);background:rgba(255,255,255,0.15);color:#fff">
                                <option value="png" style="color:#1a1a1a">PNG</option>
                                <option value="jpeg" style="color:#1a1a1a">JPG</option>
                            </select>
                            <button class="btn btn-sm" id="btnExportGantt" style="background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.3);padding:3px 10px;font-size:11px">📥 Exportar</button>
                        </div>
                    </div>
                    <div class="gantt-scroll" id="ganttScroll">
                        <div class="gantt-body" id="ganttBody"></div>
                    </div>
                </div>
            </div>
        `;

        const footer = [
            App.el('button', { class: 'btn btn-danger', id: 'btnCancelar' }, 'Cancelar'),
            App.el('button', { class: 'btn btn-secondary', id: 'btnAddRow' }, '+ Adicionar linha'),
            App.el('button', { class: 'btn btn-primary', id: 'btnSalvar' }, 'Salvar Atividades'),
        ];

        modalObj = App.modal({
            title: `Cadastro de Atividades — ${projeto.Titulo}`,
            size: 'xl',
            body,
            footer,
        });

        renderTable();
        renderGantt();

        // ─── Eventos ───
        document.getElementById('fDataPretendida').addEventListener('change', (e) => {
            dataPretendida = e.target.value;
            renderGantt();
        });

        document.getElementById('btnAddRow').addEventListener('click', () => addRow());
        document.getElementById('btnSalvar').addEventListener('click', salvar);
        document.getElementById('btnCancelar').addEventListener('click', () => {
            if (App.confirm('Cancelar toda a operação? As alterações não salvas serão perdidas.')) {
                modalObj.close();
                if (onCloseCallback) onCloseCallback();
            }
        });

        document.getElementById('btnImportarModelo').addEventListener('click', () => importarModelo());
        document.getElementById('btnExportGantt').addEventListener('click', () => exportGantt());

        // Toggle header collapse
        document.getElementById('btnToggleHeader').addEventListener('click', () => {
            const bar = document.getElementById('ativHeaderBar');
            bar.classList.toggle('collapsed');
            const svg = bar.querySelector('#btnToggleHeader svg');
            svg.style.transform = bar.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
        });

        // ─── Scroll sincronizado vertical ───
        const leftEl = document.getElementById('ativLeft');
        const rightEl = document.getElementById('ativRight');

        let syncing = false;
        leftEl.addEventListener('scroll', () => {
            if (syncing) return;
            syncing = true;
            rightEl.scrollTop = leftEl.scrollTop;
            syncing = false;
        });
        rightEl.addEventListener('scroll', () => {
            if (syncing) return;
            syncing = true;
            leftEl.scrollTop = rightEl.scrollTop;
            syncing = false;
        });
    }

    // ─── Renderiza tabela de atividades ───
    function renderTable() {
        const tbody = document.getElementById('ativBody');
        App.clear(tbody);

        if (atividades.length === 0) {
            addRow();
            return;
        }

        atividades.forEach((a, idx) => {
            tbody.appendChild(createRow(a, idx + 1));
        });
    }

    // ─── Converte DB ID de dependência para número de sequência ───
    function depIdToSeq(depId) {
        if (!depId) return '';
        const found = atividades.find(a => String(a.ID) === String(depId));
        return found ? found.sequencia : '';
    }

    // ─── Cria uma linha da tabela ───
    function createRow(a, seq) {
        const isFinalizado = a.status === 'Finalizado';
        const isLoaded = !!a.ID; // veio do banco de dados
        const tr = App.el('tr', { 'data-seq': seq, draggable: isFinalizado ? 'false' : 'true' });
        tr.dataset.ativId = a.ID || '';
        if (isFinalizado) tr.classList.add('row-finalizado');

        // Num
        tr.appendChild(App.el('td', { class: 'row-num' }, String(seq)));

        // Atividade
        const tdAtiv = App.el('td', { class: 'col-ativ' });
        tdAtiv.appendChild(App.el('input', {
            type: 'text', name: 'Atividade',
            value: a.Atividade || '', placeholder: 'Descrição',
            ...(isFinalizado ? { disabled: 'disabled' } : {})
        }));
        tr.appendChild(tdAtiv);

        // Responsável
        const tdResp = App.el('td', { class: 'col-resp' });
        const selResp = App.el('select', { name: 'Responsavel', ...(isFinalizado ? { disabled: 'disabled' } : {}) });
        selResp.appendChild(App.el('option', { value: '' }, '—'));
        responsaveis.forEach(r => {
            const o = App.el('option', { value: r.Nome }, r.Nome);
            if (a.Responsavel === r.Nome) o.selected = true;
            selResp.appendChild(o);
        });
        tdResp.appendChild(selResp);
        tr.appendChild(tdResp);

        // Dependência — agora construído a partir do DOM (linhas existentes)
        const tdDep = App.el('td', { class: 'col-dep' });
        const selDep = buildDepSelect(seq, depIdToSeq(a.Dependencia) || null, !!a.ID);
        if (isFinalizado) selDep.disabled = true;
        tdDep.appendChild(selDep);
        tr.appendChild(tdDep);

        // Início
        const tdIni = App.el('td', { class: 'col-ini' });
        const inpIni = App.el('input', {
            type: 'date', name: 'Inicio', value: a.Inicio || '',
            ...(isFinalizado ? { disabled: 'disabled' } : {})
        });
        tdIni.appendChild(inpIni);
        tr.appendChild(tdIni);

        // Duração
        const tdDur = App.el('td', { class: 'col-dur' });
        const inpDur = App.el('input', {
            type: 'number', name: 'Duracao', min: '1',
            value: String(a.Duracao || 1),
            ...(isFinalizado ? { disabled: 'disabled' } : {})
        });
        tdDur.appendChild(inpDur);
        tr.appendChild(tdDur);

        // Previsão (calculada, readonly)
        const tdPrev = App.el('td', { class: 'col-prev' });
        const inpPrev = App.el('input', {
            type: 'date', name: 'Previsao', value: a.Previsao || '',
            readonly: 'readonly', style: { background: '#F3F4F6' }
        });
        tdPrev.appendChild(inpPrev);
        tr.appendChild(tdPrev);

        // Status
        const tdSt = App.el('td', { class: 'col-status' });
        const selSt = App.el('select', { name: 'status', ...(isFinalizado ? { disabled: 'disabled' } : {}) });
        ['Novo', 'Em Andamento', 'Finalizado'].forEach(s => {
            const o = App.el('option', { value: s }, s);
            if ((a.status || 'Novo') === s) o.selected = true;
            selSt.appendChild(o);
        });
        tdSt.appendChild(selSt);
        tr.appendChild(tdSt);

        // Sábado
        const tdSab = App.el('td', { class: 'col-chk' });
        const chkSab = App.el('input', { type: 'checkbox', name: 'Sabado', ...(isFinalizado ? { disabled: 'disabled' } : {}) });
        chkSab.checked = a.Sabado !== 0;
        tdSab.appendChild(chkSab);
        tr.appendChild(tdSab);

        // Domingo
        const tdDom = App.el('td', { class: 'col-chk' });
        const chkDom = App.el('input', { type: 'checkbox', name: 'Domingo', ...(isFinalizado ? { disabled: 'disabled' } : {}) });
        chkDom.checked = a.Domingo !== 0;
        tdDom.appendChild(chkDom);
        tr.appendChild(tdDom);

        // Excluir (oculto para finalizadas)
        const tdDel = App.el('td', { class: 'col-act' });
        if (!isFinalizado) {
            const btnDel = App.el('button', { class: 'btn-del', title: 'Excluir' }, '✕');
            btnDel.addEventListener('click', () => {
                if (App.confirm('Excluir esta atividade?')) {
                    tr.remove();
                    renumberRows();
                    recalcAll();
                }
            });
            tdDel.appendChild(btnDel);
        } else {
            tdDel.innerHTML = '<span class="badge badge-success" style="font-size:10px">OK</span>';
        }
        tr.appendChild(tdDel);

        // ─── Flag: atividade carregada do banco já tem datas salvas ───
        if (isLoaded) {
            tr.dataset.datesLoaded = '1';
        }

        // ─── Listeners para recalcular ───
        selDep.addEventListener('change', () => {
            // Mudou dependência → recalcula inicio a partir da nova dependência
            tr.dataset.userModifiedInicio = ''; // reseta flag
            recalcRow(tr);
        });
        inpIni.addEventListener('change', () => {
            // Usuário mudou manualmente a data → valida contra dependência
            const depVal = tr.querySelector('select[name="Dependencia"]').value;
            if (depVal) {
                const depSeq = parseInt(depVal);
                const depRow = document.querySelector(`#ativBody tr[data-seq="${depSeq}"]`);
                if (depRow) {
                    const depPrev = depRow.querySelector('input[name="Previsao"]').value;
                    if (depPrev && inpIni.value && inpIni.value < depPrev) {
                        App.toast(`Data não pode ser anterior à previsão da atividade ${depSeq} (${App.fmtDate(depPrev)})`, 'warning');
                        inpIni.value = depPrev;
                    }
                }
            }
            tr.dataset.userModifiedInicio = '1'; // marca como editado manualmente
            recalcRow(tr);
        });
        inpDur.addEventListener('change', () => recalcRow(tr));
        chkSab.addEventListener('change', () => recalcRow(tr));
        chkDom.addEventListener('change', () => recalcRow(tr));

        // Enter adiciona nova linha
        tdAtiv.querySelector('input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addRow();
            }
        });

        // Drag-and-drop
        tr.addEventListener('dragstart', onDragStart);
        tr.addEventListener('dragover', onDragOver);
        tr.addEventListener('drop', onDrop);
        tr.addEventListener('dragend', onDragEnd);

        // Para atividades NOVAS (não carregadas), calcula datas iniciais
        // Para atividades carregadas do banco, NÃO recalcula (datas já salvas)
        if (!isLoaded) {
            setTimeout(() => recalcRow(tr), 0);
        } else {
            // Apenas calcula previsão (caso não exista), mas NÃO mexe no início
            setTimeout(() => {
                if (inpIni.value && !inpPrev.value) {
                    const dur = parseInt(inpDur.value) || 1;
                    API.calcular.previsao({
                        inicio: inpIni.value, duracao: dur,
                        sabado: chkSab.checked, domingo: chkDom.checked
                    }).then(r => { inpPrev.value = r.previsao || ''; renderGantt(); }).catch(() => {});
                } else {
                    renderGantt();
                }
            }, 0);
        }

        return tr;
    }

    // ─── Monta o <select> de dependência a partir das linhas do DOM ───
    function buildDepSelect(currentSeq, selectedDep, isLoaded) {
        const selDep = App.el('select', { name: 'Dependencia' });
        selDep.appendChild(App.el('option', { value: '' }, '—'));

        const tbody = document.getElementById('ativBody');
        if (tbody) {
            const rows = [...tbody.children];
            rows.forEach((other, j) => {
                const otherSeq = j + 1;
                if (otherSeq === currentSeq) return; // não pode depender de si mesma

                // Mostra seq + nome da atividade (se já preenchido)
                const nomeInput = other.querySelector('input[name="Atividade"]');
                const nome = nomeInput ? nomeInput.value.trim() : '';
                const label = nome ? `${otherSeq} — ${nome}` : String(otherSeq);

                const o = App.el('option', { value: String(otherSeq) }, label);

                // Seleção: dependência salva OU atividade anterior por padrão (apenas para novas)
                if (selectedDep && String(selectedDep) === String(otherSeq)) {
                    o.selected = true;
                } else if (!selectedDep && !isLoaded && otherSeq === (currentSeq - 1) && currentSeq > 1) {
                    o.selected = true;
                }

                selDep.appendChild(o);
            });
        }

        return selDep;
    }

    // ─── Adiciona nova linha (com dependência automática na anterior) ───
    function addRow() {
        const tbody = document.getElementById('ativBody');
        const seq = tbody.children.length + 1;

        // Cria a linha SEM dados (será preenchida pelo recalcRow)
        const newRow = createRow({}, seq);
        tbody.appendChild(newRow);

        // Dependência automática: já setada no buildDepSelect (seq-1)
        // Recalcula para propagar início/previsão da dependência
        recalcRow(newRow);

        // Foca no campo atividade
        setTimeout(() => newRow.querySelector('input[name="Atividade"]').focus(), 50);
    }

    // ─── Renumera linhas e atualiza dropdowns de dependência ───
    function renumberRows() {
        const tbody = document.getElementById('ativBody');
        [...tbody.children].forEach((tr, i) => {
            const newSeq = i + 1;
            tr.dataset.seq = newSeq;
            tr.querySelector('.row-num').textContent = String(newSeq);

            // Reconstrói o dropdown de dependência
            const tdDep = tr.querySelector('td.col-dep');
            const oldSel = tr.querySelector('select[name="Dependencia"]');
            const currentVal = oldSel.value;
            const isLoaded = !!tr.dataset.ativId;
            const newSel = buildDepSelect(newSeq, currentVal ? parseInt(currentVal) : null, isLoaded);
            // Preserva estado read-only para atividades finalizadas
            if (tr.classList.contains('row-finalizado')) newSel.disabled = true;
            tdDep.replaceChild(newSel, oldSel);

            // Re-bind listener
            newSel.addEventListener('change', () => recalcRow(tr));
        });
    }

    // ─── Recalcula uma linha (inicio via dependência, previsão via duração) ───
    async function recalcRow(tr) {
        const seq = parseInt(tr.dataset.seq);
        const depVal = tr.querySelector('select[name="Dependencia"]').value;
        const inpIni = tr.querySelector('input[name="Inicio"]');
        const inpDur = tr.querySelector('input[name="Duracao"]');
        const inpPrev = tr.querySelector('input[name="Previsao"]');
        const chkSab = tr.querySelector('input[name="Sabado"]');
        const chkDom = tr.querySelector('input[name="Domingo"]');

        const dur = parseInt(inpDur.value) || 1;
        const skipSat = chkSab.checked;
        const skipSun = chkDom.checked;
        const userModified = tr.dataset.userModifiedInicio === '1';

        // Se tem dependência, calcula inicio a partir da previsão da dependência
        // MAS apenas se o usuário NÃO alterou manualmente a data
        if (depVal) {
            const depSeq = parseInt(depVal);
            const depRow = document.querySelector(`#ativBody tr[data-seq="${depSeq}"]`);
            if (depRow) {
                const depPrev = depRow.querySelector('input[name="Previsao"]').value;
                if (depPrev) {
                    // Sempre calcula o início mínimo (da dependência)
                    let minInicio = null;
                    try {
                        const r = await API.calcular.inicio({
                            dependencia_previsao: depPrev,
                            sabado: skipSat, domingo: skipSun
                        });
                        minInicio = r.inicio;
                    } catch (e) {}

                    if (minInicio) {
                        if (!userModified) {
                            // Não foi editado manualmente → auto-seta
                            inpIni.value = minInicio;
                        } else if (inpIni.value && inpIni.value < minInicio) {
                            // Usuário setou data anterior ao mínimo → corrige
                            App.toast(`Data ajustada para ${App.fmtDate(minInicio)} (não pode ser anterior à atividade ${depSeq})`, 'warning');
                            inpIni.value = minInicio;
                        }
                    }
                }
            }
        } else {
            // Sem dependência: se for primeira linha, usa inicio do projeto
            if (seq === 1 && !inpIni.value) {
                inpIni.value = projeto.Inicio || '';
            }
        }

        // Calcula previsão
        if (inpIni.value && dur) {
            try {
                const r = await API.calcular.previsao({
                    inicio: inpIni.value,
                    duracao: dur,
                    sabado: skipSat,
                    domingo: skipSun
                });
                inpPrev.value = r.previsao || '';
            } catch (e) {}
        }

        renderGantt();

        // Cascata: recalcula atividades que dependem desta
        cascadeDependents(seq);
    }

    // ─── Cascata: recalcula todas as atividades dependentes de uma sequência ───
    function cascadeDependents(changedSeq) {
        const allRows = [...document.querySelectorAll('#ativBody tr')];
        // Coleta sequências que dependem da alterada
        const dependents = [];
        allRows.forEach(tr => {
            const depVal = tr.querySelector('select[name="Dependencia"]')?.value;
            if (depVal && parseInt(depVal) === changedSeq) {
                dependents.push(parseInt(tr.dataset.seq));
            }
        });
        // Recalcula cada dependente e propaga adiante
        dependents.forEach(depSeq => {
            const depRow = allRows.find(r => parseInt(r.dataset.seq) === depSeq);
            if (depRow) recalcRow(depRow);
        });
    }

    function recalcAll() {
        const rows = document.querySelectorAll('#ativBody tr');
        rows.forEach(r => recalcRow(r));
    }

    // ─── Drag-and-drop ───
    let draggedRow = null;

    function onDragStart(e) {
        draggedRow = e.currentTarget;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }
    function onDragOver(e) {
        e.preventDefault();
        const target = e.currentTarget;
        if (target !== draggedRow) {
            target.classList.add('drag-over');
        }
    }
    function onDrop(e) {
        e.preventDefault();
        const target = e.currentTarget;
        if (target !== draggedRow && draggedRow) {
            const tbody = target.parentNode;
            const rows = [...tbody.children];
            const dragIdx = rows.indexOf(draggedRow);
            const targetIdx = rows.indexOf(target);
            if (dragIdx < targetIdx) {
                tbody.insertBefore(draggedRow, target.nextSibling);
            } else {
                tbody.insertBefore(draggedRow, target);
            }
            renumberRows();
            recalcAll();
        }
    }
    function onDragEnd(e) {
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        e.currentTarget.classList.remove('dragging');
        draggedRow = null;
    }

    // ─── Importar atividades de um modelo ───
    async function importarModelo() {
        const sel = document.getElementById('fModeloSelect');
        const modeloId = sel.value;
        if (!modeloId) {
            App.toast('Selecione um modelo', 'warning');
            return;
        }

        // Verifica se já existem atividades preenchidas
        const tbody = document.getElementById('ativBody');
        const existingRows = [...tbody.children].filter(tr => {
            const inp = tr.querySelector('input[name="Atividade"]');
            return inp && inp.value.trim();
        });
        if (existingRows.length > 0) {
            if (!App.confirm('Isso substituirá todas as atividades atuais pelas do modelo. Continuar?')) return;
        }

        try {
            const modeloAtivs = await API.modelos.getAtividades(modeloId);
            if (!modeloAtivs.length) {
                App.toast('O modelo não possui atividades', 'warning');
                return;
            }

            // Converte modelo para formato do projeto (calcula datas)
            // Mapeia sequência do modelo → sequência importada (para dependências)
            const modeloSeqMap = {};
            modeloAtivs.forEach((a, idx) => { modeloSeqMap[a.sequencia] = idx + 1; });

            const importadas = modeloAtivs.map((a, idx) => {
                let depSeq = null;
                if (a.Dependencia) {
                    // Busca a sequência da atividade dependência no modelo
                    const depModelo = modeloAtivs.find(x => x.ID === a.Dependencia);
                    if (depModelo) depSeq = modeloSeqMap[depModelo.sequencia];
                }
                return {
                    Atividade: a.Atividade,
                    Responsavel: a.Responsavel || '',
                    Dependencia: depSeq,
                    Duracao: a.Duracao || 1,
                    status: 'Novo',
                    Sabado: 1,
                    Domingo: 1,
                };
            });

            // Substitui as atividades
            atividades = importadas;
            App.clear(tbody);
            importadas.forEach((a, idx) => {
                tbody.appendChild(createRow(a, idx + 1));
            });

            // Recalcula todas as datas em cascata
            recalcAll();

            App.toast(`${importadas.length} atividades importadas do modelo`, 'success');
        } catch (e) {
            App.toast('Erro ao importar: ' + e.message, 'error');
        }
    }

    // ─── Coleta dados das linhas ───
    function collectRows() {
        const rows = document.querySelectorAll('#ativBody tr');
        return [...rows].map((tr, i) => {
            const get = (name) => {
                const el = tr.querySelector(`[name="${name}"]`);
                if (!el) return null;
                if (el.type === 'checkbox') return el.checked ? 1 : 0;
                return el.value;
            };
            return {
                ID: tr.dataset.ativId || null,
                sequencia: i + 1,
                Atividade: get('Atividade'),
                Responsavel: get('Responsavel'),
                Dependencia: get('Dependencia') ? parseInt(get('Dependencia')) : null,
                Inicio: get('Inicio'),
                Duracao: parseInt(get('Duracao')) || 1,
                Previsao: get('Previsao'),
                status: get('status'),
                Sabado: get('Sabado'),
                Domingo: get('Domingo'),
            };
        });
    }

    // ─── Salvar ───
    async function salvar() {
        const data = collectRows();
        for (const a of data) {
            if (!a.Atividade) {
                App.toast('Preencha a descrição de todas as atividades', 'warning');
                return;
            }
            if (!a.Inicio) {
                App.toast('Informe a data de início de todas as atividades', 'warning');
                return;
            }
        }
        try {
            await API.atividades.batch(projetoId, { atividades: data });
            App.toast('Atividades salvas com sucesso!', 'success');
            modalObj.close();
            if (onCloseCallback) onCloseCallback();
        } catch (e) {
            App.toast('Erro ao salvar: ' + e.message, 'error');
        }
    }

    // ─── Gantt SVG (v2: melhorias de visualização) ───
    function renderGantt() {
        const wrap = document.getElementById('ganttBody');
        if (!wrap) return;

        const rows = collectRows();
        if (!rows.length || !rows.some(r => r.Inicio)) {
            wrap.innerHTML = '<div class="empty-state" style="padding:30px"><p>Adicione atividades para visualizar o Gantt.</p></div>';
            return;
        }

        // Coleta datas válidas
        const datas = rows.filter(r => r.Inicio).map(r => ({
            inicio: r.Inicio,
            previsao: r.Previsao || r.Inicio
        }));

        let minDate = datas.reduce((m, d) => d.inicio < m ? d.inicio : m, datas[0].inicio);
        let maxDate = datas.reduce((m, d) => (d.previsao > m ? d.previsao : m), datas[0].previsao);

        if (dataPretendida) {
            if (dataPretendida < minDate) minDate = dataPretendida;
            if (dataPretendida > maxDate) maxDate = dataPretendida;
        }

        // Lógica de dias: mínimo 15 dias a partir do início, senão até 3 dias após o fim
        const minD = parseLocalDate(minDate);
        const maxDEnd = parseLocalDate(maxDate);

        // Calcula quantos dias as atividades ocupam
        const daysDiff = Math.round((maxDEnd - minD) / 86400000);
        const minDays = 15;

        let totalDays;
        if (daysDiff + 3 >= minDays) {
            // Atividades ultrapassam 15 dias → mostra até 3 dias depois do fim
            totalDays = daysDiff + 3;
        } else {
            // Menos de 15 dias → mostra 15 dias a partir do início
            totalDays = minDays;
        }

        // Margem de 1 dia antes do início
        const startD = new Date(minD);
        startD.setDate(startD.getDate() - 1);

        const dayWidth = 44;
        const rowHeight = 28;
        const headerHeight = 65;
        const width = totalDays * dayWidth + 20;
        const height = headerHeight + rows.length * rowHeight + 10;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'gantt-svg');
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);

        const x0 = 10;

        // Converte string ISO para posição X (SEM timezone bug)
        const dateToX = (dateStr) => {
            const d = parseLocalDate(dateStr);
            const days = Math.round((d - startD) / 86400000);
            return x0 + days * dayWidth;
        };

        // ─── Headers: ano / mês / dia ───
        // Ano
        let currentYear = null;
        let yearStartX = x0;
        for (let i = 0; i <= totalDays; i++) {
            const d = new Date(startD); d.setDate(d.getDate() + i);
            const y = d.getFullYear();
            if (currentYear === null) currentYear = y;
            if (y !== currentYear) {
                const w = (dateToX(toISODate(d)) - yearStartX);
                drawRect(svg, yearStartX, 0, w, 22, { class: 'axis-bg' });
                drawText(svg, yearStartX + w / 2, 15, String(currentYear), { class: 'axis-text-year', anchor: 'middle' });
                currentYear = y;
                yearStartX = dateToX(toISODate(d));
            }
        }
        if (currentYear) {
            const endX = x0 + totalDays * dayWidth;
            const w = endX - yearStartX;
            drawRect(svg, yearStartX, 0, w, 22, { class: 'axis-bg' });
            drawText(svg, yearStartX + w / 2, 15, String(currentYear), { class: 'axis-text-year', anchor: 'middle' });
        }

        // Mês
        let currentMonth = null;
        let monthStartX = x0;
        for (let i = 0; i <= totalDays; i++) {
            const d = new Date(startD); d.setDate(d.getDate() + i);
            const mk = `${d.getFullYear()}-${d.getMonth()}`;
            const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });
            if (currentMonth === null) currentMonth = mk;
            if (mk !== currentMonth) {
                const w = (dateToX(toISODate(d)) - monthStartX);
                drawRect(svg, monthStartX, 22, w, 22, { class: 'axis-bg', style: 'fill:#4A4B52' });
                drawText(svg, monthStartX + w / 2, 37, monthName, { class: 'axis-text-month', anchor: 'middle' });
                currentMonth = mk;
                monthStartX = dateToX(toISODate(d));
            }
        }
        if (currentMonth) {
            const endX = x0 + totalDays * dayWidth;
            const w = endX - monthStartX;
            const d = new Date(startD); d.setDate(d.getDate() + totalDays);
            drawRect(svg, monthStartX, 22, w, 22, { class: 'axis-bg', style: 'fill:#4A4B52' });
            drawText(svg, monthStartX + w / 2, 37, d.toLocaleDateString('pt-BR', { month: 'short' }), { class: 'axis-text-month', anchor: 'middle' });
        }

        // Dias
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(startD); d.setDate(d.getDate() + i);
            const x = x0 + i * dayWidth;
            const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
            if (isWeekend) {
                drawRect(svg, x, 44, dayWidth, height - 44, { class: 'weekend-col' });
            }
            drawRect(svg, x, 44, dayWidth, 21, { class: 'axis-bg', style: 'fill:#5A8A9F' });
            drawText(svg, x + dayWidth / 2, 58, String(d.getDate()), { class: 'axis-text', anchor: 'middle' });
            // Linha vertical divisória (borda direita da coluna)
            drawLine(svg, x + dayWidth, 65, x + dayWidth, height - 5, { class: 'grid-line' });
        }
        // Linha vertical inicial
        drawLine(svg, x0, 65, x0, height - 5, { class: 'grid-line' });

        // ─── Barras das atividades ───
        // Mapeia sequencia → {xIni, xFim, y, hasInicio} para desenhar setas de dependência
        const barPositions = {};

        rows.forEach((r, idx) => {
            const y = headerHeight + idx * rowHeight;
            // Linha horizontal divisória inferior (contínuo com a tabela)
            drawLine(svg, x0, y + rowHeight, x0 + totalDays * dayWidth, y + rowHeight, { class: 'grid-line' });

            const seq = idx + 1;

            if (!r.Inicio) {
                barPositions[seq] = null;
                return;
            }

            const xIni = dateToX(r.Inicio);
            // Previsão = último dia da barra (inclusive), então + dayWidth
            const xFim = r.Previsao ? dateToX(r.Previsao) + dayWidth : xIni + dayWidth;
            const w = Math.max(dayWidth, xFim - xIni);

            let cls = 'bar';
            if (r.status === 'Finalizado') cls += ' finalizado';
            else if (r.Previsao) {
                const prevD = parseLocalDate(r.Previsao);
                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                if (prevD < hoje) cls += ' atrasado';
            }

            drawRect(svg, xIni, y + 4, w, rowHeight - 8, { class: cls, rx: 4 });

            const label = r.Atividade
                ? (r.Atividade.length > 20 ? r.Atividade.slice(0, 20) + '…' : r.Atividade)
                : `#${idx + 1}`;
            drawText(svg, xIni + 6, y + rowHeight / 2 + 4, `${idx + 1}. ${label}`, { class: 'bar-label' });

            // Guarda posição para setas de dependência
            barPositions[seq] = {
                xIni,
                xFim,
                xCen: (xIni + xFim) / 2,
                yTop: y + 4,
                yMid: y + rowHeight / 2,
                yBot: y + rowHeight - 4
            };
        });

        // ─── Setas de dependência ───
        // Para cada atividade i que depende de j, desenha uma seta do CENTRO INFERIOR
        // da barra predecessora (j) para o CENTRO SUPERIOR da barra dependente (i).
        // Esse trajeto evita a "volta" que ocorria quando a predecessora terminava
        // no dia anterior à dependente — sai por baixo, sobe direto no centro da dependente.
        rows.forEach((r, idx) => {
            const depSeq = r.Dependencia;
            if (!depSeq) return;
            const dep = barPositions[depSeq];
            const cur = barPositions[idx + 1];
            if (!dep || !cur) return;

            // Origem: centro da borda inferior da predecessora
            const x1 = dep.xCen;
            const y1 = dep.yBot;
            // Destino: centro da borda superior da dependente
            const x2 = cur.xCen;
            const y2 = cur.yTop;

            drawDependencyArrow(svg, x1, y1, x2, y2);
        });

        // ─── Linha vermelha da data pretendida (na divisa do dia) ───
        // Mantém apenas a linha vermelha, sem o rótulo "Pretendida" para não
        // sobrepor o cabeçalho de ano do Gantt.
        if (dataPretendida) {
            // Posição na borda direita do dia pretendido (divisa entre dia e dia+1)
            const xPret = dateToX(dataPretendida) + dayWidth;
            drawLine(svg, xPret, 0, xPret, height - 5, { class: 'previsao-line' });
        }

        App.clear(wrap);
        wrap.appendChild(svg);
    }

    // ─── Helpers SVG ───
    function drawRect(svg, x, y, w, h, attrs = {}) {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('x', x);
        r.setAttribute('y', y);
        r.setAttribute('width', Math.max(0, w));
        r.setAttribute('height', h);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'style') r.setAttribute('style', v);
            else r.setAttribute(k, v);
        }
        svg.appendChild(r);
    }
    function drawText(svg, x, y, text, attrs = {}) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', x);
        t.setAttribute('y', y);
        t.textContent = text;
        for (const [k, v] of Object.entries(attrs)) {
            t.setAttribute(k, v);
        }
        svg.appendChild(t);
    }
    function drawLine(svg, x1, y1, x2, y2, attrs = {}) {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        for (const [k, v] of Object.entries(attrs)) {
            l.setAttribute(k, v);
        }
        svg.appendChild(l);
    }

    // ─── Desenha uma seta de dependência (origem → destino) ───
    // Origem: centro da borda INFERIOR da predecessora (x1, y1)
    // Destino: centro da borda SUPERIOR da dependente (x2, y2)
    // Caminho em L: desce um pouco → horizontal → sobe até a dependente → ponta para baixo.
    function drawDependencyArrow(svg, x1, y1, x2, y2) {
        const gap = 4;             // espaço entre a ponta da seta e a barra dependente
        const arrowSize = 7;       // tamanho da cabeça da seta
        const midOffset = 6;       // distância vertical do "ombro" da seta em relação à origem/destino

        const targetY = y2 - gap;  // ponto onde a ponta da seta termina (acima da barra)

        // Pontos do caminho em L:
        // (x1, y1) → (x1, y1 + midOffset)  [desce um pouco saindo da predecessora]
        //          → (x2, y1 + midOffset)  [vai na horizontal até embaixo da dependente]
        //          → (x2, targetY)         [sobe até a borda superior da dependente]
        // A ponta da seta aponta para baixo (em direção à barra dependente).
        const shoulderY = y1 + midOffset;
        const pathD = `M ${x1} ${y1} L ${x1} ${shoulderY} L ${x2} ${shoulderY} L ${x2} ${targetY}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('class', 'dep-arrow');
        svg.appendChild(path);

        // Cabeça da seta (triângulo) apontando para BAIXO, em (x2, y2 - gap)
        const ax = x2;
        const ay = targetY;
        const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        head.setAttribute('points',
            `${ax},${ay + arrowSize} ${ax - arrowSize / 2},${ay} ${ax + arrowSize / 2},${ay}`);
        head.setAttribute('class', 'dep-arrow-head');
        svg.appendChild(head);
    }

    // ─── Exportar Gantt como imagem (PNG/JPG) ───
    function exportGantt() {
        const svgEl = document.querySelector('#ganttBody .gantt-svg');
        if (!svgEl) {
            App.toast('Nenhum gráfico para exportar', 'warning');
            return;
        }

        const format = document.getElementById('fGanttFormat').value; // 'png' ou 'jpeg'
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const ext = format === 'jpeg' ? 'jpg' : 'png';

        // Clona o SVG e inline todos os estilos CSS computados
        const svgClone = svgEl.cloneNode(true);

        // Resolve estilos CSS inline (xhtml2pdf-like approach para SVG)
        const allElements = svgClone.querySelectorAll('*');
        const origElements = svgEl.querySelectorAll('*');
        for (let i = 0; i < allElements.length; i++) {
            const computed = window.getComputedStyle(origElements[i]);
            const el = allElements[i];
            // Propriedades essenciais
            const props = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'opacity'];
            props.forEach(p => {
                const v = computed.getPropertyValue(p);
                if (v) el.style[p] = v;
            });
        }

        // Adiciona fundo branco
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', '100%');
        bg.setAttribute('height', '100%');
        bg.setAttribute('fill', '#ffffff');
        svgClone.insertBefore(bg, svgClone.firstChild);

        // Serializa SVG para string
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgClone);

        // Garante xmlns
        if (!svgString.includes('xmlns=')) {
            svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        // Escala para melhor resolução (2x)
        const scale = 2;
        const svgWidth = parseInt(svgEl.getAttribute('width')) || 800;
        const svgHeight = parseInt(svgEl.getAttribute('height')) || 400;

        const canvas = document.createElement('canvas');
        canvas.width = svgWidth * scale;
        canvas.height = svgHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        const img = new Image();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            // Fundo branco
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, svgWidth, svgHeight);
            ctx.drawImage(img, 0, 0, svgWidth, svgHeight);
            URL.revokeObjectURL(url);

            // Converte canvas para blob e faz download
            canvas.toBlob((downloadBlob) => {
                if (!downloadBlob) {
                    App.toast('Erro ao gerar imagem', 'error');
                    return;
                }
                const downloadUrl = URL.createObjectURL(downloadBlob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `gantt_projeto_${projetoId}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
                App.toast(`Gantt exportado como ${ext.toUpperCase()}!`, 'success');
            }, mimeType, 0.92);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            App.toast('Erro ao processar o gráfico', 'error');
        };

        img.src = url;
    }

    function escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    return { openModal };
})();
