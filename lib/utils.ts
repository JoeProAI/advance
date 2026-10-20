import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatMiles(miles: number): string {
  return `${Math.round(miles)} mi`;
}

export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const whole = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (whole <= 0) {
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${whole}h`;
  }
  return `${whole}h ${minutes}m`;
}

export function formatAffinity(value: number): string {
  return value.toFixed(2);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export function createId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const tail = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${tail}`;
}
