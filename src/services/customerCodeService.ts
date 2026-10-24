import type { Customer } from '../domain/types';

const codePattern = /^CLI-(\d+)$/i;

export function nextCustomerCode(customers: Array<Pick<Customer, 'code'>>): string {
  const max = customers.reduce((value, customer) => {
    const match = customer.code?.trim().match(codePattern);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  const used = new Set(customers.map(customer => customer.code?.trim().toLocaleUpperCase()).filter(Boolean));
  let number = max + 1;
  let candidate = `CLI-${String(number).padStart(6, '0')}`;
  while (used.has(candidate)) {
    number += 1;
    candidate = `CLI-${String(number).padStart(6, '0')}`;
  }
  return candidate;
}

/**
 * Assign stable, unique customer codes to legacy records and new customers.
 * Existing codes are retained; when editing an older record without a code,
 * reuse the prior code for that ID when available.
 */
export function ensureCustomerCodes(customers: Customer[], previous: Customer[] = []): Customer[] {
  const previousCodes = new Map(previous.map(customer => [customer.id, customer.code?.trim() ?? '']));
  const prepared = customers.map(customer => ({
    ...customer,
    code: customer.code?.trim() || previousCodes.get(customer.id) || ''
  }));

  const seen = new Set<string>();
  const normalized = prepared.map(customer => {
    const codeKey = customer.code.toLocaleUpperCase();
    if (!customer.code || seen.has(codeKey)) return { ...customer, code: '' };
    seen.add(codeKey);
    return customer;
  });

  let next = nextCustomerCode(normalized);
  const reserved = new Set(normalized.map(customer => customer.code.toLocaleUpperCase()).filter(Boolean));
  return normalized.map(customer => {
    if (customer.code) return customer;
    while (reserved.has(next.toLocaleUpperCase())) {
      const number = Number(next.replace(/^CLI-/i, '')) + 1;
      next = `CLI-${String(number).padStart(6, '0')}`;
    }
    const code = next;
    reserved.add(code.toLocaleUpperCase());
    const number = Number(next.replace(/^CLI-/i, '')) + 1;
    next = `CLI-${String(number).padStart(6, '0')}`;
    return { ...customer, code };
  });
}
