export function corsOrigin(): string[] | boolean {
  const configured = process.env['CORS_ORIGIN'];
  if (!configured) {
    return true;
  }
  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : true;
}
