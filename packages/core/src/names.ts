/** Naming conventions and case conversions. See ADR on naming and the dictionary authoring guide. */

export const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/;
export const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;
/** lowerCamelCase with at most one dotted namespace, for custom CEL functions. */
export const FUNCTION_NAME = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)?$/;
export const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const API_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** TitleCase, the default database name: countryCode -> CountryCode. */
export function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** camelCase, the default API name and message-key prefix: OrderLine -> orderLine. */
export function camelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** kebab-case, the expected file name: OrderLine -> order-line, yesNo -> yes-no. */
export function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}
