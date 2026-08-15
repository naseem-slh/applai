import { useSyncExternalStore } from 'react'
import { subscribeUsage, usageSnapshot, type ApiUsage } from '@/lib/ai/usage'

/**
 * Der Anfragezähler als React-Zustand.
 *
 * `useSyncExternalStore` statt eines eigenen Effekts mit `useState`: Der
 * Zähler ist eine Quelle außerhalb von React, und dies ist der dafür
 * vorgesehene Weg — er hält auch dann zusammen, wenn mehrere Ansichten
 * gleichzeitig zuhören.
 *
 * Eigene Datei, weil `ApiUsageStatus.tsx` sonst außer einem Bauteil auch
 * eine Funktion ausführte und Fast Refresh dort aufhörte zu greifen.
 */
export function useApiUsage(): ApiUsage {
  return useSyncExternalStore(subscribeUsage, usageSnapshot, usageSnapshot)
}
