#!/bin/sh
# Simple entrypoint to inject BACKEND_URL into index.html
set -e
:
if [ -n "$BACKEND_URL" ]; then
  echo "Injecting BACKEND_URL=$BACKEND_URL into index.html"
  # replace window.__BACKEND_URL__ default with provided value
  sed -i "s|window.__BACKEND_URL__ = window.__BACKEND_URL__ || 'http://localhost:3000';|window.__BACKEND_URL__ = '$BACKEND_URL';|g" /usr/share/nginx/html/index.html || true
fi

exec "$@"
