import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting the caller's classes win over the component's.
 *
 * `clsx` flattens conditionals; `twMerge` resolves Tailwind conflicts, so
 * `<Button className="bg-danger" />` overrides the variant's `bg-primary`
 * instead of producing two competing background utilities whose winner depends
 * on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
