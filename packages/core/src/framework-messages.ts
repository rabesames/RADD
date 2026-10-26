/**
 * Framework default messages (radd.*) in English. A dictionary's i18n files override them;
 * other locales supply their own text or fall back to the default locale.
 */
export const FRAMEWORK_LOCALE = "en";

export const FRAMEWORK_MESSAGES: Readonly<Record<string, string>> = {
  "radd.required": "{label} is required.",
  "radd.type": "{label} has an invalid value.",
  "radd.maxLength": "{label} must be at most {max} characters.",
  "radd.minLength": "{label} must be at least {min} characters.",
  "radd.min": "{label} must be at least {min}.",
  "radd.max": "{label} must be at most {max}.",
  "radd.precision": "{label} must have at most {precision} digits.",
  "radd.scale": "{label} must have at most {scale} decimal places.",
  "radd.format.email": "{label} must be a valid email address.",
  "radd.format.url": "{label} must be a valid URL.",
  "radd.format.phone": "{label} must be a valid phone number.",
  "radd.pattern": "{label} is not in the expected format.",
  "radd.lookup": "{label} is not an allowed value.",
};
