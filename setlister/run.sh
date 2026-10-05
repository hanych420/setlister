#!/bin/sh
set -eu

# Supervisor připojuje trvalý adresář /data a jeho vlastník se může mezi
# instalacemi lišit. Práva upravíme při startu a samotnou aplikaci spustíme
# bez oprávnění roota.
chown -R setlister:setlister "${SETLISTER_DATA_DIR:-/data}"
exec su-exec setlister python /app/server.py
