declare module 'apextree-skill' {
  export const packageDir: string;
  export const skillFile: string;
  export const referencesDir: string;
  export const referenceFiles: string[];
  export function referencePath(filename: string): string;
}
