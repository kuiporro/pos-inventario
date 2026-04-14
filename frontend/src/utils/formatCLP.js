/**
 * Formatea un número como peso chileno (CLP).
 * Ejemplos: 1234 → "$1.234" | 1234567 → "$1.234.567"
 */
export const formatCLP = (value) => {
  const num = Math.round(Number(value) || 0)
  return '$' + num.toLocaleString('es-CL')
}

/**
 * Parsea un string de precio (con o sin $) a número entero CLP.
 */
export const parseCLP = (str) => {
  if (str === null || str === undefined || str === '') return 0
  return Math.round(Number(String(str).replace(/[$.]/g, '').replace(',', '.')) || 0)
}
