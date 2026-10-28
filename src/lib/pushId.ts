export function shortPushId(value: string): string {
  return value.length <= 8 ? value : `${value.slice(0, 4)}…${value.slice(-3)}`
}
