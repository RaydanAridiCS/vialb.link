/**
 * RFC 4180 field escaping with spreadsheet formula-injection protection
 * (values starting with = + - @ tab or CR are prefixed with a quote).
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: readonly unknown[]): string {
  return `${values.map(csvField).join(",")}\r\n`;
}
