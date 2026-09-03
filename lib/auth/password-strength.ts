// Shared password-strength rule for every password-setting entry point
// (signup, reset-password, change-password in Settings). All three call
// Supabase Auth directly from the browser (no server route in between), so
// this is the one place that check needs to live rather than being copied
// per form. The real backstop is Supabase Auth's own project-level minimum
// password length/requirements setting — this is UX-layer defense-in-depth
// on top of that, not a replacement for it.

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwertyui', 'qwerty123', 'letmein1', 'welcome1', 'iloveyou',
  'admin123', 'changeme', '11111111', 'abc12345',
]);

/** Returns an i18n key describing the first rule violated, or null if the password is acceptable. */
export function getPasswordStrengthError(password: string): 'tooShort' | 'tooWeak' | 'tooCommon' | null {
  if (password.length < 8) return 'tooShort';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'tooCommon';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'tooWeak';
  return null;
}
