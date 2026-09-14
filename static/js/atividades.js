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

        const body = document.createElement('div');
        body.innerHTML = `
            <div class="data-pretendida">
                <label>Início do projeto:</label>
                <strong>${App.fmtDate(projeto.Inicio)}</strong>
                <label style="margin-left:14px">Data pretendida para finalização:</label>
                <input type="date" id="fDataPretendida" value="${dataPretendida}">
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

    // ─── Cria uma linha da tabela ───
    function createRow(a, seq) {
        const tr = App.el('tr', { 'data-seq': seq, draggable: 'true' });
        tr.dataset.ativId = a.ID || '';

        // Num
        tr.appendChild(App.el('td', { class: 'row-num' }, String(seq)));

        // Atividade
        const tdAtiv = App.el('td', { class: 'col-ativ' });
        tdAtiv.appendChild(App.el('input', {
            type: 'text', name: 'Atividade',
            value: a.Atividade || '', placeholder: 'Descrição'
        }));
        tr.appendChild(tdAtiv);

        // Responsável
        const tdResp = App.el('td', { class: 'col-resp' });
        const selResp = App.el('select', { name: 'Responsavel' });
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
        const selDep = buildDepSelect(seq, a.Dependencia);
        tdDep.appendChild(selDep);
        tr.appendChild(tdDep);

        // Início
        const tdIni = App.el('td', { class: 'col-ini' });
        const inpIni = App.el('input', {
            type: 'date', name: 'Inicio', value: a.Inicio || ''
        });
        tdIni.appendChild(inpIni);
        tr.appendChild(tdIni);

        // Duração
        const tdDur = App.el('td', { class: 'col-dur' });
        const inpDur = App.el('input', {
            type: 'number', name: 'Duracao', min: '1',
            value: String(a.Duracao || 1)
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
        const selSt = App.el('select', { name: 'status' });
        ['Novo', 'Em Andamento', 'Finalizado'].forEach(s => {
            const o = App.el('option', { value: s }, s);
            if ((a.status || 'Novo') === s) o.selected = true;
            selSt.appendChild(o);
        });
        tdSt.appendChild(selSt);
        tr.appendChild(tdSt);

        // Sábado
        const tdSab = App.el('td', { class: 'col-chk' });
        const chkSab = App.el('input', { type: 'checkbox', name: 'Sabado' });
        chkSab.checked = a.Sabado !== 0;
        tdSab.appendChild(chkSab);
        tr.appendChild(tdSab);

        // Domingo
        const tdDom = App.el('td', { class: 'col-chk' });
        const chkDom = App.el('input', { type: 'checkbox', name: 'Domingo' });
        chkDom.checked = a.Domingo !== 0;
        tdDom.appendChild(chkDom);
        tr.appendChild(tdDom);

        // Excluir
        const tdDel = App.el('td', { class: 'col-act' });
        const btnDel = App.el('button', { class: 'btn-del', title: 'Excluir' }, '✕');
        btnDel.addEventListener('click', () => {
            if (App.confirm('Excluir esta atividade?')) {
                tr.remove();
                renumberRows();
                recalcAll();
            }
        });
        tdDel.appendChild(btnDel);
        tr.appendChild(tdDel);

        // ─── Listeners para recalcular ───
        selDep.addEventListener('change', () => recalcRow(tr));
        inpIni.addEventListener('change', () => recalcRow(tr));
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

        // Calcula inicial (async, não bloqueia)
        setTimeout(() => recalcRow(tr), 0);

        return tr;
    }

    // ─── Monta o <select> de dependência a partir das linhas do DOM ───
    function buildDepSelect(currentSeq, selectedDep) {
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

                // Seleção: dependência salva OU atividade anterior por padrão
                if (selectedDep && String(selectedDep) === String(otherSeq)) {
                    o.selected = true;
                } else if (!selectedDep && otherSeq === (currentSeq - 1) && currentSeq > 1) {
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
            const newSel = buildDepSelect(newSeq, currentVal ? parseInt(currentVal) : null);
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

        // Se tem dependência, calcula inicio a partir da previsão da dependência
        if (depVal) {
            const depSeq = parseInt(depVal);
            const depRow = document.querySelector(`#ativBody tr[data-seq="${depSeq}"]`);
            if (depRow) {
                const depPrev = depRow.querySelector('input[name="Previsao"]').value;
                if (depPrev) {
                    try {
                        const r = await API.calcular.inicio({
                            dependencia_previsao: depPrev,
                            sabado: skipSat, domingo: skipSun
                        });
                        inpIni.value = r.inicio;
                    } catch (e) {}
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
                yTop: y + 4,
                yMid: y + rowHeight / 2,
                yBot: y + rowHeight - 4
            };
        });

        // ─── Setas de dependência ───
        // Para cada atividade i que depende de j, desenha uma seta do fim de j para o início de i.
        rows.forEach((r, idx) => {
            const depSeq = r.Dependencia;
            if (!depSeq) return;
            const dep = barPositions[depSeq];
            const cur = barPositions[idx + 1];
            if (!dep || !cur) return;

            // Origem: meio da borda direita da barra predecessora
            const x1 = dep.xFim;
            const y1 = dep.yMid;
            // Destino: meio da borda esquerda da barra dependente
            const x2 = cur.xIni;
            const y2 = cur.yMid;

            drawDependencyArrow(svg, x1, y1, x2, y2);
        });

        // ─── Linha vermelha da data pretendida (na divisa do dia) ───
        if (dataPretendida) {
            // Posição na borda direita do dia pretendido (divisa entre dia e dia+1)
            const xPret = dateToX(dataPretendida) + dayWidth;
            drawLine(svg, xPret, 0, xPret, height - 5, { class: 'previsao-line' });
            const label = 'Pretendida';
            let textW = 70;
            try {
                const c = document.createElement('canvas');
                const ctx = c.getContext('2d');
                ctx.font = '600 11px "Segoe UI", sans-serif';
                textW = Math.ceil(ctx.measureText(label).width);
            } catch (e) { }
            const padX = 8;
            const pillW = textW + padX * 2;
            drawRect(svg, xPret + 4, 2, pillW, 18, { class: 'previsao-label-bg', rx: 3 });
            drawText(svg, xPret + 4 + padX, 14, label, { class: 'previsao-label' });
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
    // Caminho em "L": sai da borda direita da predecessora, sobe/desce até a linha
    // da atividade dependente, e entra pela borda esquerda com uma ponta de seta.
    function drawDependencyArrow(svg, x1, y1, x2, y2) {
        const gap = 6;           // espaço entre a ponta da seta e a barra
        const targetX = x2 - gap; // ponto onde a ponta da seta termina
        const arrowSize = 6;      // tamanho da cabeça da seta

        // Se a predecessora termina antes do início da dependente (caso normal),
        // faz um L simples: horizontal → vertical → horizontal.
        // Se a predecessora termina DEPOIS do início da dependente (overlap),
        // faz um contorno por fora: sai para a direita, sobe/desce, volta para a esquerda.
        let pathD;

        if (x1 <= targetX) {
            // Caminho simples: sai de (x1,y1) → vai até metade do espaço → sobe/desce até y2 → chega em targetX
            const midX = x1 + Math.max(4, (targetX - x1) / 2);
            pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${targetX} ${y2}`;
        } else {
            // Overlap: contorna por baixo (ou por cima se a dependente estiver acima)
            const offset = 10; // distância do contorno
            if (y2 >= y1) {
                // Dependente está abaixo: contorna por baixo
                const bottomY = Math.max(y1, y2) + offset;
                pathD = `M ${x1} ${y1} L ${x1 + offset} ${y1} L ${x1 + offset} ${bottomY} L ${targetX - offset} ${bottomY} L ${targetX - offset} ${y2} L ${targetX} ${y2}`;
            } else {
                // Dependente está acima: contorna por cima
                const topY = Math.min(y1, y2) - offset;
                pathD = `M ${x1} ${y1} L ${x1 + offset} ${y1} L ${x1 + offset} ${topY} L ${targetX - offset} ${topY} L ${targetX - offset} ${y2} L ${targetX} ${y2}`;
            }
        }

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('class', 'dep-arrow');
        svg.appendChild(path);

        // Cabeça da seta (triângulo) apontando para a direita, em (x2 - gap, y2)
        const ax = targetX;
        const ay = y2;
        const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        head.setAttribute('points',
            `${ax + arrowSize},${ay} ${ax},${ay - arrowSize / 2} ${ax},${ay + arrowSize / 2}`);
        head.setAttribute('class', 'dep-arrow-head');
        svg.appendChild(head);
    }

    return { openModal };
})();
