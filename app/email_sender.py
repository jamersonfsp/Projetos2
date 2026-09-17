"""
Módulo de envio de e-mails.
Prioridade: Outlook via win32com (Windows) → fallback SMTP.
"""
import os
import sys
import json
import platform

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'data', 'email_config.json')


def load_config():
    """Carrega configuração de email do arquivo JSON."""
    if not os.path.isfile(CONFIG_PATH):
        return {
            'smtp_server': 'smtp.office365.com',
            'smtp_port': 587,
            'email': '',
            'password': '',
            'nome_remetente': 'Sistema de Projetos',
            'metodo': 'auto',  # auto | outlook | smtp
        }
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_config(config):
    """Salva configuração de email no arquivo JSON."""
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def is_outlook_available():
    """Verifica se o Outlook está disponível (via COM win32com)."""
    return outlook_diagnostics().get('com', False)


# ProgIDs do Outlook: genérico + versões específicas (16=Office 2016/2019/2021/365,
# 15=Office 2013, 14=Office 2010). Algumas instalações só respondem à versão específica.
_OUTLOOK_PROGIDS = ['Outlook.Application',
                    'Outlook.Application.16',
                    'Outlook.Application.15',
                    'Outlook.Application.14']

# Cache do ProgID que funcionou (evita tentar todos a cada chamada)
_working_progid = None


def _registry_outlook_info():
    """Consulta o registro do Windows para confirmar que o Outlook (clássico)
    está instalado. Retorna {'instalado': bool, 'curver': str|None}."""
    info = {'instalado': False, 'curver': None}
    if platform.system() != 'Windows':
        return info
    try:
        import winreg
    except ImportError:
        return info

    # HKEY_CLASSES_ROOT\Outlook.Application (mescla HKLM/HKCU\Software\Classes)
    # Tenta as duas vistas (64 bits e 32 bits) para cobrir Python x Office com
    # arquiteturas diferentes.
    for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
        try:
            with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, 'Outlook.Application',
                                0, winreg.KEY_READ | view):
                info['instalado'] = True
                try:
                    with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT,
                                        r'Outlook.Application\CurVer',
                                        0, winreg.KEY_READ | view) as ck:
                        info['curver'] = winreg.QueryValueEx(ck, '')[0]
                except OSError:
                    pass
                break
        except OSError:
            continue

    if not info['instalado']:
        # Fallback: chave de instalação do Office (Click-to-Run ou MSI)
        for subkey in (r'SOFTWARE\Microsoft\Office',
                       r'SOFTWARE\Microsoft\Office\ClickToRun\Configuration'):
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, subkey,
                                    0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY):
                    info['instalado'] = True
                    break
            except OSError:
                continue
    return info


def _try_dispatch(progid):
    """Tenta criar o objeto COM do Outlook. Retorna o objeto ou None."""
    try:
        import win32com.client
        return win32com.client.Dispatch(progid)
    except Exception:
        return None


def outlook_diagnostics():
    """
    Diagnóstico completo da detecção do Outlook.
    Retorna dict com: plataforma, pywin32, pywin32_versao, com, progid,
    registro, registro_versao, motivo e sugestao.
    """
    global _working_progid
    diag = {
        'plataforma': platform.system(),
        'pywin32': False,
        'pywin32_versao': None,
        'com': False,
        'progid': None,
        'registro': False,
        'registro_versao': None,
        'motivo': '',
        'sugestao': '',
    }

    if platform.system() != 'Windows':
        diag['motivo'] = 'O sistema não está rodando em Windows.'
        diag['sugestao'] = ('A automação do Outlook só funciona em Windows. '
                            'Use o método SMTP nesta máquina.')
        return diag

    # 1) pywin32 instalado?
    try:
        import win32com.client  # noqa: F401
        diag['pywin32'] = True
        try:
            from importlib.metadata import version as _pkg_version
            diag['pywin32_versao'] = _pkg_version('pywin32')
        except Exception:
            pass
    except ImportError:
        reg = _registry_outlook_info()
        diag['registro'] = reg['instalado']
        diag['registro_versao'] = reg['curver']
        diag['motivo'] = ('O pacote pywin32 não está instalado nesta máquina — sem ele '
                          'o Python não consegue conversar com o Outlook (win32com não encontrado).')
        diag['sugestao'] = ('Instale com: pip install pywin32  —  e se for a primeira vez, '
                            'execute também: python -m pywin32_postinstall -install')
        return diag

    # 2) COM responde? (tenta o ProgID que funcionou antes, depois os demais)
    progids = ([_working_progid] if _working_progid else []) + \
              [p for p in _OUTLOOK_PROGIDS if p != _working_progid]
    for pid_ in progids:
        app = _try_dispatch(pid_)
        if app is not None:
            _working_progid = pid_
            diag['com'] = True
            diag['progid'] = pid_
            return diag

    # 3) COM não respondeu — o Outlook está ao menos registrado?
    reg = _registry_outlook_info()
    diag['registro'] = reg['instalado']
    diag['registro_versao'] = reg['curver']
    if reg['instalado']:
        diag['motivo'] = ('O Outlook está instalado, mas a automação COM não respondeu '
                          '(ProgIDs testados: ' + ', '.join(_OUTLOOK_PROGIDS) + ').')
        diag['sugestao'] = ('Verifique: (1) abra o Outlook manualmente ao menos uma vez e '
                            'configure uma conta; (2) Python e Outlook devem ter a mesma '
                            'arquitetura (64 bits com 64 bits); (3) evite executar o sistema '
                            'como administrador enquanto o Outlook abre como usuário normal '
                            '(ou vice-versa); (4) verifique se algum antivírus/política '
                            'corporativa bloqueia automação COM. Obs.: o "novo Outlook" '
                            '(aplicativo web) não suporta automação — use o Outlook clássico.')
    else:
        diag['motivo'] = ('O Outlook clássico não está registrado no Windows '
                          '(nenhum ProgID Outlook.Application encontrado no registro).')
        diag['sugestao'] = ('Instale/repare o Outlook clássico (desktop). O "novo Outlook" '
                            '(aplicativo web) não suporta automação COM; nesse caso, use o '
                            'método SMTP.')
    return diag


def _get_outlook_app():
    """Retorna a aplicação Outlook via COM, tentando os ProgIDs conhecidos."""
    import win32com.client
    progids = ([_working_progid] if _working_progid else []) + \
              [p for p in _OUTLOOK_PROGIDS if p != _working_progid]
    last_exc = None
    for pid_ in progids:
        try:
            app = win32com.client.Dispatch(pid_)
            _set_working_progid(pid_)
            return app
        except Exception as e:
            last_exc = e
    raise last_exc


def _set_working_progid(progid):
    global _working_progid
    _working_progid = progid


def send_via_outlook(to_addrs, subject, html_body, attachments=None):
    """
    Envia e-mail usando o Outlook instalado na máquina via win32com.
    Não requer senha — usa a conta já configurada no Outlook.
    """
    outlook = _get_outlook_app()
    mail = outlook.CreateItem(0)  # 0 = olMailItem

    # Destinatários (separados por ;)
    mail.To = '; '.join(to_addrs)
    mail.Subject = subject
    mail.HTMLBody = html_body

    # Anexos
    if attachments:
        for att in attachments:
            # Salva temporariamente em disco (Outlook precisa de arquivo)
            import tempfile
            ext = os.path.splitext(att['filename'])[1] or '.bin'
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext, prefix='projeto_anexo_')
            tmp.write(att['data'])
            tmp.close()
            mail.Attachments.Add(tmp.name)
            # Agenda limpeza do temp (não deleta agora pois Outlook precisa ler)
            try:
                os.unlink(tmp.name)
            except OSError:
                pass  # Outlook já abriu o arquivo

    mail.Send()

    return {'ok': True, 'metodo': 'outlook'}


def send_via_smtp(to_addrs, subject, html_body, attachments=None):
    """Fallback: envia e-mail via SMTP (caso Outlook não esteja disponível)."""
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders

    config = load_config()

    if not config.get('email') or not config.get('password'):
        return {'error': 'Configuração SMTP não definida. Configure e-mail e senha em Configurações.'}

    smtp_server = config.get('smtp_server', 'smtp.office365.com')
    smtp_port = int(config.get('smtp_port', 587))
    from_email = config['email']
    password = config['password']
    from_name = config.get('nome_remetente', 'Sistema de Projetos')

    to_addrs = [a.strip() for a in to_addrs if a and '@' in a]
    if not to_addrs:
        return {'error': 'Nenhum endereço de e-mail válido.'}

    try:
        msg = MIMEMultipart('mixed')
        msg['From'] = f'{from_name} <{from_email}>'
        msg['To'] = ', '.join(to_addrs)
        msg['Subject'] = subject

        html_part = MIMEText(html_body, 'html', 'utf-8')
        msg.attach(html_part)

        if attachments:
            for att in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(att['data'])
                encoders.encode_base64(part)
                part.add_header('Content-Disposition', f'attachment; filename="{att["filename"]}"')
                msg.attach(part)

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(from_email, password)
            server.sendmail(from_email, to_addrs, msg.as_string())

        return {'ok': True, 'metodo': 'smtp'}

    except smtplib.SMTPAuthenticationError:
        return {'error': 'Falha na autenticação SMTP. Verifique e-mail e senha.'}
    except smtplib.SMTPConnectError:
        return {'error': f'Não foi possível conectar ao SMTP ({smtp_server}:{smtp_port}).'}
    except Exception as e:
        return {'error': f'Erro SMTP: {str(e)}'}


def send_email(to_addrs, subject, html_body, attachments=None):
    """
    Envia e-mail.
    1. Tenta Outlook (win32com) — não precisa de senha
    2. Fallback para SMTP — precisa de configuração
    """
    config = load_config()
    metodo = config.get('metodo', 'auto')

    # Filtra endereços válidos
    to_addrs = [a.strip() for a in to_addrs if a and '@' in a]
    if not to_addrs:
        return {'error': 'Nenhum endereço de e-mail válido informado.'}

    # Decide método
    if metodo == 'outlook' or (metodo == 'auto' and is_outlook_available()):
        try:
            return send_via_outlook(to_addrs, subject, html_body, attachments)
        except Exception as e:
            if metodo == 'outlook':
                return {'error': f'Erro ao enviar via Outlook: {str(e)}'}
            # Se era auto, tenta SMTP como fallback
            return send_via_smtp(to_addrs, subject, html_body, attachments)
    else:
        return send_via_smtp(to_addrs, subject, html_body, attachments)
