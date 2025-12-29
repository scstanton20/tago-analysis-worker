#!/bin/sh
set -e

# Default certificate paths (generated certificates in nginx-writable location)
DEFAULT_CERT_FILE="/etc/nginx/certs/tago-worker.crt"
DEFAULT_CERT_KEYFILE="/etc/nginx/certs/tago-worker.key"

# Environment variables for custom certificate paths
NGINX_CERT_FILE="${NGINX_CERT_FILE:-$DEFAULT_CERT_FILE}"
NGINX_CERT_KEYFILE="${NGINX_CERT_KEYFILE:-$DEFAULT_CERT_KEYFILE}"

echo "Using certificate: $NGINX_CERT_FILE"
echo "Using private key: $NGINX_CERT_KEYFILE"

# Check if custom certificates are provided and exist
if [ "$NGINX_CERT_FILE" != "$DEFAULT_CERT_FILE" ] || [ "$NGINX_CERT_KEYFILE" != "$DEFAULT_CERT_KEYFILE" ]; then
    echo "Custom certificates specified, checking if they exist..."

    if [ ! -f "$NGINX_CERT_FILE" ]; then
        echo "ERROR: Custom certificate file not found: $NGINX_CERT_FILE"
        exit 1
    fi

    if [ ! -f "$NGINX_CERT_KEYFILE" ]; then
        echo "ERROR: Custom private key file not found: $NGINX_CERT_KEYFILE"
        exit 1
    fi

    echo "Custom certificates found and will be used."
else
    echo "Using default generated certificates."

    # Verify default certificates exist (they should be generated at build time)
    if [ ! -f "$DEFAULT_CERT_FILE" ] || [ ! -f "$DEFAULT_CERT_KEYFILE" ]; then
        echo "ERROR: Default certificates not found. This shouldn't happen in production build."
        exit 1
    fi
fi

# Create nginx configuration from template with environment variable substitution
envsubst '${NGINX_CERT_FILE} ${NGINX_CERT_KEYFILE}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Test nginx configuration
nginx -t

# Start nginx
exec "$@"