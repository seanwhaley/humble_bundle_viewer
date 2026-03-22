/**
 * Utility helpers shared across UI components.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class strings with conditional support.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
