"""
Sistema de Controle de Projeto
Entry point principal: inicializa Flask em thread separada e abre pywebview.

Uso:
    python main.py
"""
import os
import sys
import threading
import time
import webview

# Garante que o diretório do projeto está no path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from app import create_app


def start_flask(app, host='127.0.0.1', port=5000):
    """Inicia o servidor Flask em uma thread daemon."""
    def run():
        # debug=False e use_reloader=False são obrigatórios quando rodamos em thread
        app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
    t = threading.Thread(target=run, daemon=True)
    t.start()
    # Aguarda o servidor subir
    time.sleep(1.2)
    return t


def wait_for_server(url='http://127.0.0.1:5000/', timeout=10):
    """Espera o Flask responder antes de abrir a janela."""
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def main():
    app = create_app()
    start_flask(app)

    if not wait_for_server():
        print('Aviso: servidor Flask não respondeu a tempo, tentando abrir mesmo assim...')

    # Cria a janela desktop
    webview.create_window(
        title='Sistema de Controle de Projeto',
        url='http://127.0.0.1:5000/',
        width=1366,
        height=800,
        min_size=(1024, 600),
        confirm_close=False,
    )

    # Inicia o loop do webview (bloqueante)
    webview.start(debug=False, http_server=False)


if __name__ == '__main__':
    main()
