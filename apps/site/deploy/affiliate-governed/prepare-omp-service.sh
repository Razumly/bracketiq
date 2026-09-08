#!/bin/sh
set -eu

role="${1:?OMP service role is required}"
shift

case "$role" in
  broker)
    expected_uid=1003
    ;;
  gateway)
    expected_uid=1004
    ;;
  *)
    echo "unsupported OMP service role: $role" >&2
    exit 64
    ;;
esac

[ "$(id -u)" = "$expected_uid" ] || {
  echo "OMP service $role must run as UID $expected_uid" >&2
  exit 77
}
[ "${HOME:-}" = "/var/lib/omp" ] || {
  echo "OMP service $role must use HOME=/var/lib/omp" >&2
  exit 77
}
[ "$#" -gt 0 ] || {
  echo "OMP service command is required" >&2
  exit 64
}

umask 077
if [ "$role" = broker ]; then
  /usr/local/bin/bun /usr/local/libexec/prepare-omp-bearers.mjs \
    "$role" "$HOME" \
    /run/secrets/affiliate-model-auth-broker-token auth-broker.token \
    -- "$@"
else
  /usr/local/bin/bun /usr/local/libexec/prepare-omp-bearers.mjs \
    "$role" "$HOME" \
    /run/secrets/affiliate-model-auth-broker-token auth-broker.token \
    /run/secrets/affiliate-model-gateway-token auth-gateway.token \
    -- "$@"
fi

exec "$@"
