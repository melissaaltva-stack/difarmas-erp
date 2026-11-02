import { describe, expect, it } from 'vitest';
import { csvCell } from './csv';

describe('CSV spreadsheet safety', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-CMD()', '@HYPERLINK("https://example.com")', '  =1+1', '\t=1+1', '\uFEFF=1+1'])(
    'neutralizes formula-like text: %s',
    (value) => {
      expect(csvCell(value)).toBe('"\'' + value.replace(/"/g, '""') + '"');
    },
  );

  it('keeps legitimate numeric values numeric', () => {
    expect(csvCell('-125.50')).toBe('"-125.50"');
    expect(csvCell('0')).toBe('"0"');
    expect(csvCell('125')).toBe('"125"');
  });

  it('preserves ordinary text and escapes CSV quotes', () => {
    expect(csvCell('Cliente "A"')).toBe('"Cliente ""A"""');
    expect(csvCell('')).toBe('""');
  });
});
