/**
 * The two-letter tile that stands in for a wallet or a person.
 *
 * Initials of the first two words, or the first two letters of a single word,
 * so "Current account" reads CA and "Mortgage" reads MO. Pure and shared
 * because the same tile appears on a card, on a detail header, and in the
 * sidebar, and three implementations would drift.
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
