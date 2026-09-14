@echo off
REM Inicia o Sistema de Controle de Projeto
REM Uso: run.bat

cd /d "%~dp0"

REM Cria venv se nao existir
if not exist "venv\Scripts\activate.bat" (
    echo Criando ambiente virtual...
    python -m venv venv
)

call venv\Scripts\activate.bat

REM Instala dependencias se necessario
python -c "import flask, webview" 2>nul
if errorlevel 1 (
    echo Instalando dependencias...
    pip install -r requirements.txt
)

echo Iniciando Sistema de Controle de Projeto...
python main.py
