export function tokenExpired(token: string, withinMs = 0): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + withinMs;
  } catch {
    return false;
  }
}

export function sessionTokenExpiresSoon(token: string | null | undefined, withinMs = 2 * 60 * 1000): boolean {
  if (!token) return true;
  return tokenExpired(token, withinMs);
}
