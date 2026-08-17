import { describe, expect, it } from 'vitest'
import { expenseItemsTotal, safeFileName, validateExpense } from './expenses'

describe('expense helpers', () => {
  const items = [{ description: 'Simen', quantity: '20', unit: 'bag', unit_price: '21.50' }]
  it('calculates line totals', () => expect(expenseItemsTotal(items)).toBe(430))
  it('blocks overpayment', () => expect(validateExpense(items, 'Belian simen', 500)).toContain('melebihi'))
  it('accepts an unpaid expense', () => expect(validateExpense(items, 'Belian simen', 0)).toBeNull())
  it('creates a storage-safe filename', () => expect(safeFileName('Resit Kedai #1.JPG')).toBe('Resit-Kedai-1.jpg'))
})
