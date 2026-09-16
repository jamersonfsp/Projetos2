/* =========================================================
   config.js - Tela de Configurações (E-mail Outlook/SMTP)
   ========================================================= */

const ConfigView = (() => {

    async function render() {
        const view = document.getElementById('view');
        view.className = 'view-container config-view';

        let emailCfg = {};
        try {
            emailCfg = await API.emailConfig.get();
        } catch (e) {}

        const outlookOk = emailCfg.outlook_disponivel;
        const metodo = emailCfg.metodo || 'auto';

        view.innerHTML = `
            <div class="page-header">
                <h2>Configurações</h2>
            </div>

            <div class="card mb-3" style="max-width:700px">
                <div class="card-header">
                    <h3>📧 Método de Envio de E-mail</h3>
                    <span class="badge ${emailCfg.configured ? 'badge-success' : 'badge-warning'}">${emailCfg.configured ? 'Configurado' : 'Não configurado'}</span>
                </div>

                <div class="mb-4">
                    <div class="form-group mb-3">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;padding:10px 14px;border:1px solid var(--border-strong);border-radius:var(--radius);${metodo === 'auto' || metodo === 'outlook' ? 'background:#ECFDF5;border-color:#10B981' : ''}">
                            <input type="radio" name="metodo" value="auto" ${metodo === 'auto' ? 'checked' : ''} style="width:auto">
                            <div>
                                <strong>Outlook (recomendado)</strong>
                                <span class="badge ${outlookOk ? 'badge-success' : 'badge-danger'}" style="margin-left:8px">${outlookOk ? '✓ Disponível' : '✗ Não encontrado'}</span>
                                <p class="text-sm text-muted" style="margin:4px 0 0">Usa o Outlook instalado na máquina. Não precisa configurar senha.</p>
                            </div>
                        </label>
                    </div>
                    <div class="form-group mb-3">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;padding:10px 14px;border:1px solid var(--border-strong);border-radius:var(--radius);${metodo === 'smtp' ? 'background:#EFF6FF;border-color:#3B82F6' : ''}">
                            <input type="radio" name="metodo" value="smtp" ${metodo === 'smtp' ? 'checked' : ''} style="width:auto">
                            <div>
                                <strong>SMTP (manual)</strong>
                                <p class="text-sm text-muted" style="margin:4px 0 0">Configurar servidor SMTP, e-mail e senha manualmente.</p>
                            </div>
                        </label>
                    </div>
                </div>

                <div id="smtpConfig" style="display:${metodo === 'smtp' ? 'block' : 'none'}">
                    <h4 style="font-size:14px;margin-bottom:12px;color:var(--text-secondary);border-top:1px solid var(--border);padding-top:14px">Configuração SMTP</h4>
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
                                <input type="email" name="email" value="${emailCfg.email || ''}" placeholder="seu.email@outlook.com">
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
                    </form>
                </div>

                <div class="mt-4 flex gap-3" style="border-top: 1px solid var(--border); padding-top: 14px;">
                    <button type="button" class="btn btn-primary" id="btnSalvarConfig">Salvar Configuração</button>
                    <button type="button" class="btn btn-secondary" id="btnTestEmail">Enviar E-mail de Teste</button>
                </div>
            </div>

            <div class="card" style="max-width:700px">
                <div class="card-header">
                    <h3>ℹ️ Sobre o envio de e-mails</h3>
                </div>
                <div class="text-sm text-muted" style="line-height:1.7">
                    <p><strong>Outlook (recomendado):</strong></p>
                    <ul style="margin:6px 0 12px 18px">
                        <li>Usa o Outlook já instalado e configurado na máquina.</li>
                        <li>Não precisa de senha — a conta do Outlook é usada automaticamente.</li>
                        <li>O e-mail aparece na pasta "Enviados" do seu Outlook.</li>
                        <li>Funciona com MFA, contas corporativas, etc.</li>
                    </ul>
                    <p><strong>SMTP (manual):</strong></p>
                    <ul style="margin:6px 0 12px 18px">
                        <li>Para ambientes sem Outlook ou uso em rede.</li>
                        <li>Requer servidor SMTP, e-mail e senha configurados.</li>
                        <li>Para Outlook com MFA: gere uma <a href="https://account.live.com/proofs/AppPasswords" target="_blank" style="color:var(--info)">App Password</a>.</li>
                    </ul>
                </div>
            </div>
        `;

        // Toggle SMTP config visibility
        document.querySelectorAll('input[name="metodo"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.getElementById('smtpConfig').style.display = radio.value === 'smtp' && radio.checked ? 'block' : 'none';
            });
        });

        // Salvar
        document.getElementById('btnSalvarConfig').addEventListener('click', async () => {
            const metodo = document.querySelector('input[name="metodo"]:checked').value;
            const data = { metodo };

            if (metodo === 'smtp') {
                const form = document.getElementById('formEmail');
                if (form) {
                    const fd = new FormData(form);
                    fd.forEach((v, k) => { if (v) data[k] = v; });
                }
            }

            try {
                await API.emailConfig.save(data);
                App.toast('Configuração salva!', 'success');
                render();
            } catch (e) {
                App.toast('Erro: ' + e.message, 'error');
            }
        });

        // Testar
        document.getElementById('btnTestEmail').addEventListener('click', async () => {
            const metodo = document.querySelector('input[name="metodo"]:checked').value;

            // Salva primeiro
            document.getElementById('btnSalvarConfig').click();

            const m = App.modal({
                title: 'Testar E-mail',
                size: 'sm',
                body: `
                    <div class="form-group">
                        <label>Enviar e-mail de teste para:</label>
                        <input type="email" id="fTestEmail" placeholder="destinatario@email.com">
                    </div>
                    <p class="text-sm text-muted mt-2">${metodo === 'outlook' ? 'O e-mail será enviado pelo Outlook instalado na máquina.' : 'O e-mail será enviado via SMTP com as credenciais configuradas.'}</p>
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
