/* =========================================================
   config.js - Tela de Configurações (E-mail SMTP)
   ========================================================= */

const ConfigView = (() => {

    async function render() {
        const view = document.getElementById('view');
        view.className = 'view-container config-view';

        let emailCfg = {};
        try {
            emailCfg = await API.emailConfig.get();
        } catch (e) {}

        view.innerHTML = `
            <div class="page-header">
                <h2>Configurações</h2>
            </div>

            <div class="card mb-3" style="max-width:700px">
                <div class="card-header">
                    <h3>📧 Configuração de E-mail (SMTP)</h3>
                    <span class="badge ${emailCfg.configured ? 'badge-success' : 'badge-warning'}">${emailCfg.configured ? 'Configurado' : 'Não configurado'}</span>
                </div>

                <p class="text-sm text-muted mb-3">
                    Configure os dados de envio de e-mail. Utilize sua conta Outlook/Office365.
                    Se sua conta tiver autenticação em duas etapas (MFA), gere uma <strong>App Password</strong> 
                    nas configurações da sua conta Microsoft.
                </p>

                <form id="formEmail">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Servidor SMTP</label>
                            <input type="text" name="smtp_server" value="${emailCfg.smtp_server || 'smtp.office365.com'}" placeholder="smtp.office365.com">
                        </div>
                        <div class="form-group">
                            <label>Porta</label>
                            <input type="number" name="smtp_port" value="${emailCfg.smtp_port || 587}" placeholder="587">
                        </div>
                        <div class="form-group span-2">
                            <label>E-mail (remetente) *</label>
                            <input type="email" name="email" value="${emailCfg.email || ''}" placeholder="seu.email@outlook.com" required>
                        </div>
                        <div class="form-group span-2">
                            <label>Senha (ou App Password) *</label>
                            <input type="password" name="password" placeholder="••••••••" autocomplete="new-password">
                            <span class="hint">Deixe em branco para manter a senha atual</span>
                        </div>
                        <div class="form-group span-2">
                            <label>Nome do Remetente</label>
                            <input type="text" name="nome_remetente" value="${emailCfg.nome_remetente || 'Sistema de Projetos'}" placeholder="Nome que aparece como remetente">
                        </div>
                    </div>

                    <div class="mt-4 flex gap-3" style="border-top: 1px solid var(--border); padding-top: 14px;">
                        <button type="submit" class="btn btn-primary">Salvar Configuração</button>
                        <button type="button" class="btn btn-secondary" id="btnTestEmail">Enviar E-mail de Teste</button>
                    </div>
                </form>
            </div>

            <div class="card" style="max-width:700px">
                <div class="card-header">
                    <h3>ℹ️ Sobre o envio de e-mails</h3>
                </div>
                <div class="text-sm text-muted" style="line-height:1.7">
                    <p><strong>Quando é enviado?</strong></p>
                    <ul style="margin:6px 0 12px 18px">
                        <li>Ao clicar no botão "Enviar E-mail" na tela de um projeto.</li>
                        <li>O e-mail é enviado para <strong>todos os responsáveis</strong> cadastrados no projeto e nas atividades que possuírem e-mail.</li>
                    </ul>
                    <p><strong>O que é enviado?</strong></p>
                    <ul style="margin:6px 0 12px 18px">
                        <li>E-mail profissional com os dados do projeto e a tabela de atividades.</li>
                        <li>PDF em anexo com a ficha completa do projeto.</li>
                        <li>Opcionalmente, o gráfico de Gantt em PNG.</li>
                    </ul>
                    <p><strong>Outlook com MFA:</strong></p>
                    <p style="margin:0">Se sua conta usa autenticação em duas etapas, acesse <a href="https://account.live.com/proofs/AppPasswords" target="_blank" style="color:var(--info)">account.live.com/proofs/AppPasswords</a> e gere uma senha de aplicativo.</p>
                </div>
            </div>
        `;

        // Salvar config
        document.getElementById('formEmail').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = {};
            fd.forEach((v, k) => data[k] = v);

            try {
                await API.emailConfig.save(data);
                App.toast('Configuração salva!', 'success');
                render(); // Recarrega para atualizar badge
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });

        // Testar envio
        document.getElementById('btnTestEmail').addEventListener('click', async () => {
            const email = document.querySelector('#formEmail input[name="email"]').value;
            if (!email) {
                App.toast('Informe o e-mail de destino para teste', 'warning');
                return;
            }

            // Salva primeiro
            const fd = new FormData(document.getElementById('formEmail'));
            const data = {};
            fd.forEach((v, k) => data[k] = v);
            try {
                await API.emailConfig.save(data);
            } catch (e) {}

            const m = App.modal({
                title: 'Testar E-mail',
                size: 'sm',
                body: `
                    <div class="form-group">
                        <label>Enviar e-mail de teste para:</label>
                        <input type="email" id="fTestEmail" value="${email}" placeholder="destinatario@email.com">
                    </div>
                `,
                footer: [
                    App.el('button', { class: 'btn btn-secondary', onclick: (e) => e.target.closest('.modal-backdrop').remove() }, 'Cancelar'),
                    App.el('button', { class: 'btn btn-primary', id: 'btnConfirmTest' }, 'Enviar Teste'),
                ]
            });

            document.getElementById('btnConfirmTest').addEventListener('click', async () => {
                const to = document.getElementById('fTestEmail').value;
                if (!to) { App.toast('Informe o e-mail', 'warning'); return; }

                const btn = document.getElementById('btnConfirmTest');
                btn.disabled = true;
                btn.textContent = 'Enviando...';

                try {
                    const result = await API.emailConfig.test({ to });
                    App.toast(result.message || 'E-mail de teste enviado!', 'success');
                    m.close();
                } catch (e) {
                    App.toast('Erro: ' + e.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Enviar Teste';
                }
            });
        });
    }

    return { render };
})();
