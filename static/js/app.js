/* =========================================================
   app.js - Router SPA + Sidebar + Utils globais
   ========================================================= */

const App = (() => {

    const routes = {
        '/dashboard':     { title: 'Dashboard',           render: () => DashboardView.render() },
        '/relatorio':     { title: 'Relatório Diário',    render: () => RelatorioView.render() },
        '/cadastro':      { title: 'Cadastro de Projeto', render: () => ProjetoView.renderCadastro() },
        '/projetos':      { title: 'Lista de Projetos',   render: () => ProjetoView.renderLista() },
        '/projeto/:id':   { title: 'Tela do Projeto',     render: (id) => ProjetoView.renderTela(id) },
        '/calendario':    { title: 'Calendário',          render: () => App.renderComingSoon() },
        '/responsaveis':  { title: 'Responsáveis',        render: () => ResponsaveisView.render() },
        '/setor':         { title: 'Setor',               render: () => SetorView.render() },
        '/modelos':       { title: 'Modelos de Atividades', render: () => ModelosView.render() },
    };

    function init() {
        // Sidebar toggle
        const logoBtn = document.getElementById('logoBtn');
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');

        logoBtn.addEventListener('click', () => toggleSidebar());
        menuToggle.addEventListener('click', () => toggleSidebar());

        // Router
        window.addEventListener('hashchange', router);
        router();

        // Clock
        startClock();

        // Marca item ativo
        updateActiveNav();
    }

    function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const state = sidebar.dataset.state === 'open' ? 'closed' : 'open';
        sidebar.dataset.state = state;
    }

    function router() {
        const hash = window.location.hash.replace(/^#/, '') || '/dashboard';
        const view = document.getElementById('view');
        view.innerHTML = '<div class="loading">Carregando...</div>';

        // Tenta match exato
        if (routes[hash]) {
            document.getElementById('pageTitle').textContent = routes[hash].title;
            routes[hash].render();
            updateActiveNav(hash);
            return;
        }

        // Tenta match com parâmetro /projeto/:id
        const m = hash.match(/^\/projeto\/(\d+)$/);
        if (m) {
            document.getElementById('pageTitle').textContent = 'Tela do Projeto';
            routes['/projeto/:id'].render(m[1]);
            updateActiveNav('/projetos');
            return;
        }

        // Default
        window.location.hash = '/dashboard';
    }

    function updateActiveNav(route) {
        const current = route || (window.location.hash.replace(/^#/, '') || '/dashboard');
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
            const r = el.dataset.route;
            const routeMap = {
                'dashboard': '/dashboard',
                'relatorio': '/relatorio',
                'cadastro': '/cadastro',
                'projetos': '/projetos',
                'calendario': '/calendario',
                'responsaveis': '/responsaveis',
                'setor': '/setor',
                'modelos': '/modelos',
            };
            if (routeMap[r] === current) el.classList.add('active');
            // projetos tambem ativa quando estamos em /projeto/:id
            if (r === 'projetos' && current.startsWith('/projeto/')) el.classList.add('active');
        });
    }

    function startClock() {
        const el = document.getElementById('clock');
        const update = () => {
            const d = new Date();
            const opts = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
            el.textContent = d.toLocaleString('pt-BR', opts);
        };
        update();
        setInterval(update, 30000);
    }

    function navigate(path) {
        window.location.hash = path;
    }

    // ─── Utils globais ───
    function el(tag, attrs = {}, ...children) {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'class') e.className = v;
            else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
            else if (k.startsWith('on') && typeof v === 'function') {
                e.addEventListener(k.slice(2).toLowerCase(), v);
            } else if (k === 'html') {
                e.innerHTML = v;
            } else if (v !== null && v !== undefined && v !== false) {
                e.setAttribute(k, v);
            }
        }
        for (const c of children) {
            if (c == null) continue;
            if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(c));
            else if (Array.isArray(c)) c.forEach(x => x && e.appendChild(x));
            else e.appendChild(c);
        }
        return e;
    }

    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

    function toast(msg, type = '') {
        const t = el('div', { class: `toast toast-${type}` }, msg);
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    function confirm(msg) {
        return window.confirm(msg);
    }

    function fmtDate(s) {
        if (!s) return '';
        const [y, m, d] = s.split('-');
        if (!y || !m || !d) return s;
        return `${d}/${m}/${y}`;
    }

    function todayISO() {
        const d = new Date();
        const tz = d.getTimezoneOffset() * 60000;
        return new Date(d - tz).toISOString().slice(0, 10);
    }

    function situacaoBadge(sit) {
        const map = {
            'No prazo':              'badge-no-prazo',
            'Atrasado':              'badge-atrasado',
            'Finalizado em Dia':     'badge-finalizado-dia',
            'Finalizado em Atrasado':'badge-finalizado-atraso',
        };
        const cls = map[sit] || 'badge-neutral';
        return `<span class="badge ${cls}">${sit || '—'}</span>`;
    }

    function statusBadge(st) {
        const map = {
            'Novo':          'badge-info',
            'Em Andamento':  'badge-info',
            'Aguardando':    'badge-warning',
            'Finalizado':    'badge-success',
            'Pausado':       'badge-neutral',
            'Cancelado':     'badge-neutral',
        };
        return `<span class="badge ${map[st] || 'badge-neutral'}">${st || ''}</span>`;
    }

    // ─── Modal ───
    function modal({ title, size = 'md', body, footer, onMount }) {
        const root = document.getElementById('modalRoot');
        const backdrop = el('div', { class: 'modal-backdrop' });
        const m = el('div', { class: `modal modal-${size}` });
        const header = el('div', { class: 'modal-header' },
            el('h3', {}, title),
            el('button', { class: 'modal-close', onclick: () => backdrop.remove() }, '×')
        );
        const bodyEl = el('div', { class: 'modal-body' });
        const footerEl = el('div', { class: 'modal-footer' });

        if (typeof body === 'string') bodyEl.innerHTML = body;
        else if (body) bodyEl.appendChild(body);

        if (footer) {
            if (Array.isArray(footer)) footer.forEach(b => footerEl.appendChild(b));
            else footerEl.appendChild(footer);
        }

        m.appendChild(header);
        m.appendChild(bodyEl);
        m.appendChild(footerEl);
        backdrop.appendChild(m);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) backdrop.remove();
        });
        root.appendChild(backdrop);

        if (onMount) onMount(bodyEl, footerEl, () => backdrop.remove());
        return { backdrop, body: bodyEl, footer: footerEl, close: () => backdrop.remove() };
    }

    // ─── Multiselect ───
    function multiselect({ options, selected = [], placeholder = 'Selecionar', onChange }) {
        const wrap = el('div', { class: 'multiselect' });
        const trigger = el('div', { class: 'multiselect-trigger', tabindex: '0' },
            el('span', { class: 'placeholder' }, placeholder),
            el('span', { class: 'arrow' }, '▾')
        );
        const panel = el('div', { class: 'multiselect-panel' });

        function render() {
            clear(panel);
            options.forEach(opt => {
                const isSel = selected.includes(opt.value);
                const o = el('label', { class: 'multiselect-option' },
                    el('input', { type: 'checkbox', checked: isSel }),
                    el('span', {}, opt.label)
                );
                o.querySelector('input').addEventListener('change', (e) => {
                    if (e.target.checked) {
                        if (!selected.includes(opt.value)) selected.push(opt.value);
                    } else {
                        const i = selected.indexOf(opt.value);
                        if (i >= 0) selected.splice(i, 1);
                    }
                    updateLabel();
                    if (onChange) onChange([...selected]);
                });
                panel.appendChild(o);
            });
            updateLabel();
        }
        function updateLabel() {
            const ph = trigger.querySelector('.placeholder');
            if (selected.length === 0) ph.textContent = placeholder;
            else if (selected.length === 1) {
                const o = options.find(x => x.value == selected[0]);
                ph.textContent = o ? o.label : selected[0];
            } else {
                ph.textContent = `${selected.length} selecionados`;
            }
        }
        trigger.addEventListener('click', () => {
            wrap.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) wrap.classList.remove('open');
        });
        wrap.appendChild(trigger);
        wrap.appendChild(panel);
        render();
        return { wrap, get: () => [...selected], set: (vals) => { selected.length = 0; selected.push(...vals); render(); } };
    }

    function renderComingSoon() {
        const view = document.getElementById('view');
        view.innerHTML = `
            <div class="coming-soon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <h2>Calendário — em breve</h2>
                <p>Este módulo será implementado em uma próxima versão do sistema. Fique atento às atualizações.</p>
            </div>
        `;
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        navigate, el, clear, toast, confirm, modal, multiselect,
        fmtDate, todayISO, situacaoBadge, statusBadge, renderComingSoon
    };
})();
