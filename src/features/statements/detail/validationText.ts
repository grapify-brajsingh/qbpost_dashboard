const ROW = /^row (\d+): (.+)$/i
const FIELD = /^\$\.transactions\[(\d+)\]\.(\w+): (.+)$/

/**
 * The API counts rows from 0 and reports unreadable fields by JSON path. This says the same thing with the row number
 * the table shows. Text in any other form is returned unchanged, so nothing the API said is lost.
 */
export function friendlyError(text: string): string {
  const row = ROW.exec(text)
  if (row) return `Row ${Number(row[1]) + 1}: ${row[2]}`
  const field = FIELD.exec(text)
  if (!field) return text
  const n = Number(field[1]) + 1
  if (!field[3].startsWith('The JSON value could not be converted')) return `Row ${n}, ${field[2]}: ${field[3]}`
  return field[2] === 'date' ? `Row ${n}: the date isn't a valid date.` : `Row ${n}: the ${field[2]} isn't valid.`
}
