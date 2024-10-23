@echo off
REM Navigate to the directory of the batch file
cd /d "%~dp0"

REM Create a virtual environment named 'venv' if it doesn't exist
if not exist venv (
    python -m venv venv
)

REM Activate the virtual environment
call venv\Scripts\activate.bat

REM Upgrade pip to the latest version
python -m pip install --upgrade pip

REM Install the required packages
pip install -r requirements.txt
pip install pyinstaller

REM Remove previous build artifacts if they exist
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist gui.spec del /f /q gui.spec

REM Use PyInstaller to build the executable
pyinstaller --onefile --windowed gui.py

REM Deactivate the virtual environment
deactivate

echo.
echo Build complete. The executable is located in the 'dist' folder.
pause
