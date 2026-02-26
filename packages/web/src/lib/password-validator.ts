export function validatePassword(pwd: string): string | null {
  if (pwd.length < 8) {
    return "Password must be at least 8 characters";
  }

  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasDigit = /[0-9]/.test(pwd);

  if (!hasLetter || !hasDigit) {
    return "Password must contain at least one letter and one digit";
  }

  const allowedChars = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,./`~]+$/;
  if (!allowedChars.test(pwd)) {
    return "Password contains invalid characters";
  }

  return null;
}
