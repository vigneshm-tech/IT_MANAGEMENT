/** Shared result shape for server actions wired to dialogs. */
export type FormState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export function requiredText(formData: FormData, field: string, min = 1): string | null {
  const value = String(formData.get(field) ?? "").trim();
  return value.length >= min ? value : null;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
