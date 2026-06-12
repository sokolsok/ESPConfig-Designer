export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      // Fall through to Node's default error for non-file extensionless imports.
    }
  }

  return nextResolve(specifier, context);
}
