/**
 * Conditional className joiner. Falsy entries are dropped.
 *
 * @param {...(string|false|null|undefined)} parts
 * @returns {string}
 */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

export default cn;
