/**
 * Safely serialize a value as a CSV cell for spreadsheet applications.
 * Text beginning with formula operators is prefixed with an apostrophe.
 * Plain numeric values remain numeric, including legitimate negative numbers.
 */
export const csvCell = (value: unknown): string => {
  const raw = String(value ?? '');
  const numeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw);
  const formulaLike = /^[\s\u0000-\u001f]*[=+\-@]/.test(raw);
  const safe = !numeric && formulaLike ? `'${raw}` : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
};
