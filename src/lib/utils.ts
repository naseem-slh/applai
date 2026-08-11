import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Kombiniert bedingte Klassennamen (clsx) und löst widersprüchliche
// Tailwind-Utility-Klassen zugunsten der zuletzt genannten auf (tailwind-merge).
// Muster: adg/frontend/src/lib/utils.ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
