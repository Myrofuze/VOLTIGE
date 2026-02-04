#!/usr/bin/env python3
"""
Simple HTTP Server for VOLTIGE SPEC
Run this script to start a local web server on http://localhost:8000
This makes the app accessible from any device on your network
"""

import http.server
import socketserver
import os
import webbrowser
from pathlib import Path

# Configuration
PORT = 8000
DIRECTORY = Path(__file__).parent

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

def start_server():
    """Start the HTTP server"""
    try:
        with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
            print(f"✅ Serveur VOLTIGE démarré avec succès!")
            print(f"📍 URL locale: http://localhost:{PORT}")
            print(f"🌐 URL réseau: http://<votre-ip>:{PORT}")
            print(f"📁 Répertoire: {DIRECTORY}")
            print(f"\n⏹️  Appuyez sur Ctrl+C pour arrêter le serveur")
            
            # Try to open the browser automatically
            try:
                webbrowser.open(f'http://localhost:{PORT}')
                print(f"🚀 Ouverture du navigateur...\n")
            except:
                pass
            
            httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"❌ Le port {PORT} est déjà utilisé.")
            print(f"❌ Un autre serveur est peut-être déjà actif.")
            print(f"💡 Essayez de fermer l'autre instance ou utilisez un port différent.")
        else:
            raise

if __name__ == '__main__':
    start_server()
