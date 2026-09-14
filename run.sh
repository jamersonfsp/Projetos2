#!/bin/bash
# Inicia o Sistema de Controle de Projeto
# Uso: ./run.sh

set -e
cd "$(dirname "$0")"

# Cria venv se não existir
if [ ! -d "venv" ]; then
    echo "Criando ambiente virtual..."
    python3 -m venv venv
fi

source venv/bin/activate

# Instala dependências se necessário
if ! python -c "import flask, webview" 2>/dev/null; then
    echo "Instalando dependências..."
    pip install -r requirements.txt
fi

echo "Iniciando Sistema de Controle de Projeto..."
python main.py
