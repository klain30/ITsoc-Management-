type ClassValue = string | false | null | undefined | 0;

/** Joins class names, skipping falsy values. */
export const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(' ');
