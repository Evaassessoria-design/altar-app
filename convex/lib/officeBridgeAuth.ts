/** Valida o Bearer token da ponte administrativa sem registrar o segredo. */
export function hasValidOfficeToken(request: Request, expectedToken: string) {
  const authorization = request.headers.get("Authorization")?.trim();
  if (!authorization) return false;

  const [scheme, token, ...extra] = authorization.split(/\s+/);
  return (
    scheme?.toLowerCase() === "bearer" &&
    extra.length === 0 &&
    token === expectedToken
  );
}
