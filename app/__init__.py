"""
Factory do Flask app.
"""
import os
from flask import Flask

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)


def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(PROJECT_ROOT, 'templates'),
        static_folder=os.path.join(PROJECT_ROOT, 'static'),
    )
    app.config['SECRET_KEY'] = 'sistema-controle-projeto-2026'
    app.config['JSON_SORT_KEYS'] = False

    # Inicializa o banco
    from app.database import init_db
    init_db()

    # Registra blueprint da API
    from app.api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    # Rota raiz: serve o shell SPA
    @app.route('/')
    def index():
        from flask import send_from_directory
        return send_from_directory(
            os.path.join(PROJECT_ROOT, 'templates'),
            'index.html'
        )

    # Rota para partials HTML (carregados via fetch no SPA)
    @app.route('/partials/<path:filename>')
    def partials(filename):
        from flask import send_from_directory
        return send_from_directory(
            os.path.join(PROJECT_ROOT, 'templates', 'partials'),
            filename
        )

    return app
