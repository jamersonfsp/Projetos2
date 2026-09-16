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
    """Verifica se o Outlook está disponível via win32com."""
    if platform.system() != 'Windows':
        return False
    try:
        import win32com.client
        outlook = win32com.client.Dispatch("Outlook.Application")
        return True
    except Exception:
        return False


def send_via_outlook(to_addrs, subject, html_body, attachments=None):
    """
    Envia e-mail usando o Outlook instalado na máquina via win32com.
    Não requer senha — usa a conta já configurada no Outlook.
    """
    import win32com.client

    outlook = win32com.client.Dispatch("Outlook.Application")
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
