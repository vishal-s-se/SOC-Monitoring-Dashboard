import PyInstaller.__main__
import os

PyInstaller.__main__.run([
    'src/windows_service.py',
    '--name=soc-agent-windows',
    '--onedir',
    '--hidden-import=win32timezone',
    '--hidden-import=win32serviceutil',
    '--hidden-import=win32service',
    '--hidden-import=win32event',
    '--hidden-import=servicemanager',
    '--hidden-import=yaml',
    '--hidden-import=requests',
    '--clean'
])
