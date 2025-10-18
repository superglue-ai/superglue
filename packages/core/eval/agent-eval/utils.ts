export function isDeepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== "object" || typeof b !== "object") return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key) || !isDeepEqual(a[key], b[key])) {
            return false;
        }
    }

    return true;
}