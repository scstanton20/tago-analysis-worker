#!/bin/sh
set -e

# Default certificate paths (generated certificates)
DEFAULT_CERT_PATH="/etc/ssl/certs/tago-worker.crt"
DEFAULT_KEY_PATH="/etc/ssl/private/tago-worker.key"

# Environment variables for custom certificate paths
NGINX_CERT_PATH="${NGINX_CERT_PATH:-$DEFAULT_CERT_PATH}"
NGINX_KEY_PATH="${NGINX_KEY_PATH:-$DEFAULT_KEY_PATH}"

echo "Using certificate: $NGINX_CERT_PATH"
echo "Using private key: $NGINX_KEY_PATH"

# Check if custom certificates are provided and exist
if [ "$NGINX_CERT_PATH" != "$DEFAULT_CERT_PATH" ] || [ "$NGINX_KEY_PATH" != "$DEFAULT_KEY_PATH" ]; then
    echo "Custom certificates specified, checking if they exist..."

    if [ ! -f "$NGINX_CERT_PATH" ]; then
        echo "ERROR: Custom certificate file not found: $NGINX_CERT_PATH"
        exit 1
    fi

    if [ ! -f "$NGINX_KEY_PATH" ]; then
        echo "ERROR: Custom private key file not found: $NGINX_KEY_PATH"
        exit 1
    fi

    echo "Custom certificates found and will be used."
else
    echo "Using default generated certificates."

    # Verify default certificates exist (they should be generated at build time)
    if [ ! -f "$DEFAULT_CERT_PATH" ] || [ ! -f "$DEFAULT_KEY_PATH" ]; then
        echo "ERROR: Default certificates not found. This shouldn't happen in production build."
        exit 1
    fi
fi

# Create nginx configuration from template with environment variable substitution
envsubst '${NGINX_CERT_PATH} ${NGINX_KEY_PATH}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Test nginx configuration
nginx -t

# Start nginx
exec "$@"