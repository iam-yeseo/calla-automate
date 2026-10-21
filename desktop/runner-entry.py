"""PyInstaller entry point; runtime dependencies are bundled with the app."""
import os
import certifi
from runner.bridge import main

os.environ.setdefault('SSL_CERT_FILE', certifi.where())

if __name__ == '__main__':
    main()
