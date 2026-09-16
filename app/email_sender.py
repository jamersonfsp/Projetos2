"""
Módulo de envio de e-mails via SMTP (Outlook/Office365).
"""
import os
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

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
        }
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_config(config):
    """Salva configuração de email no arquivo JSON."""
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def send_email(to_addrs, subject, html_body, attachments=None):
    """
    Envia e-mail via SMTP.
    
    Args:
        to_addrs: lista de endereços de e-mail (strings)
        subject: assunto do e-mail
        html_body: corpo HTML do e-mail
        attachments: lista de dicts {'filename': str, 'data': bytes, 'mimetype': str}
    
    Returns:
        dict com 'ok': True ou 'error': mensagem de erro
    """
    config = load_config()
    
    if not config.get('email') or not config.get('password'):
        return {'error': 'Configuração de e-mail não definida. Configure em Configurações > E-mail.'}
    
    smtp_server = config.get('smtp_server', 'smtp.office365.com')
    smtp_port = int(config.get('smtp_port', 587))
    from_email = config['email']
    password = config['password']
    from_name = config.get('nome_remetente', 'Sistema de Projetos')
    
    # Filtra endereços válidos
    to_addrs = [a.strip() for a in to_addrs if a and '@' in a]
    if not to_addrs:
        return {'error': 'Nenhum endereço de e-mail válido informado.'}
    
    try:
        # Monta a mensagem
        msg = MIMEMultipart('mixed')
        msg['From'] = f'{from_name} <{from_email}>'
        msg['To'] = ', '.join(to_addrs)
        msg['Subject'] = subject
        
        # Corpo HTML
        html_part = MIMEText(html_body, 'html', 'utf-8')
        msg.attach(html_part)
        
        # Anexos
        if attachments:
            for att in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(att['data'])
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename="{att["filename"]}"'
                )
                msg.attach(part)
        
        # Conecta e envia
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(from_email, password)
            server.sendmail(from_email, to_addrs, msg.as_string())
        
        return {'ok': True, 'to': to_addrs}
    
    except smtplib.SMTPAuthenticationError:
        return {'error': 'Falha na autenticação. Verifique e-mail e senha. Para Outlook com MFA, use uma App Password.'}
    except smtplib.SMTPConnectError:
        return {'error': f'Não foi possível conectar ao servidor SMTP ({smtp_server}:{smtp_port}).'}
    except Exception as e:
        return {'error': f'Erro ao enviar e-mail: {str(e)}'}
