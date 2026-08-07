import { z } from 'zod';

/**
 * Password complexity requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one digit
 * - At least one special character (!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`)
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'A jelszó legalább 8 karakter';
  if (!/[A-ZÁÉÍÓÖŐÚÜŰ]/.test(password)) return 'A jelszónak tartalmaznia kell legalább egy nagybetűt';
  if (!/\d/.test(password)) return 'A jelszónak tartalmaznia kell legalább egy számot';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return 'A jelszónak tartalmaznia kell legalább egy speciális karaktert';
  return null;
}

export const passwordSchema = z.string()
  .min(8, 'A jelszó legalább 8 karakter')
  .refine(p => /[A-ZÁÉÍÓÖŐÚÜŰ]/.test(p), 'A jelszónak tartalmaznia kell legalább egy nagybetűt')
  .refine(p => /\d/.test(p), 'A jelszónak tartalmaznia kell legalább egy számot')
  .refine(p => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p), 'A jelszónak tartalmaznia kell legalább egy speciális karaktert');