function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getBackendHttpOrigin() {
  const configuredOrigin = import.meta.env.VITE_BACKEND_ORIGIN;
  if (configuredOrigin) {
    return trimTrailingSlash(configuredOrigin);
  }

  if (window.location.port === '3000') {
    return window.location.origin;
  }

  return `${window.location.protocol}//${window.location.hostname}:3000`;
}

export function getBackendWebSocketUrl() {
  const configuredWebSocketOrigin = import.meta.env.VITE_BACKEND_WS_ORIGIN;
  if (configuredWebSocketOrigin) {
    return trimTrailingSlash(configuredWebSocketOrigin);
  }

  const backendHttpOrigin = getBackendHttpOrigin();
  return backendHttpOrigin.replace(/^http/, 'ws');
}
