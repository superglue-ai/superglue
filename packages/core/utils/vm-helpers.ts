import ivm from "isolated-vm";
import { VM_HELPERS_CODE } from "@superglue/shared";

/**
 * Inject individual helper functions using context.global.set
 * This is the most reliable method for isolated-vm
 */
export async function injectVMHelpersIndividually(context: ivm.Context): Promise<void> {
  // Use shared VM helpers code (includes polyfills, btoa/atob, escape, Buffer, etc.)
  context.evalSync(VM_HELPERS_CODE);

  // Backend-specific: Inject Node's native URL constructor for full spec compliance using ivm.Reference
  await context.global.set(
    "_nativeURLParser",
    new ivm.Reference(function (urlString: string, base?: string) {
      try {
        const parsed = new URL(urlString, base);
        return new ivm.ExternalCopy({
          href: parsed.href,
          protocol: parsed.protocol,
          host: parsed.host,
          hostname: parsed.hostname,
          port: parsed.port,
          pathname: parsed.pathname,
          search: parsed.search,
          hash: parsed.hash,
          origin: parsed.origin,
          searchParams: Object.fromEntries(parsed.searchParams.entries()),
        }).copyInto();
      } catch (error: any) {
        throw new Error(error.message);
      }
    }),
  );

  // Create URL constructor wrapper in VM context
  context.evalSync(`
    URL = function(url, base) {
      const parsed = _nativeURLParser.applySync(undefined, [url, base]);
      Object.assign(this, parsed);
      this.toString = function() { return this.href; };
      this.toJSON = function() { return this.href; };
    };
  `);

  // Inject crypto.randomUUID
  await context.global.set(
    "_nativeRandomUUID",
    new ivm.Reference(function () {
      return crypto.randomUUID();
    }),
  );

  // Wrap it in a crypto object
  context.evalSync(`
    crypto = {
      randomUUID: function() {
        return _nativeRandomUUID.applySync(undefined, []);
      }
    };
  `);
}
