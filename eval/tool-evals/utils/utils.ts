export function isDeepEqual(expected: any, received: any, allowAdditionalProperties: boolean = false): boolean {
    if (expected === received) return true;
    if (expected == null || received == null) return false;
    if (typeof expected !== "object" || typeof received !== "object") return false;

    const keysExpected = Object.keys(expected);
    const keysReceived = Object.keys(received);

    if (!allowAdditionalProperties) {
        if (keysExpected.length !== keysReceived.length) return false;
    }

    for (const key of keysExpected) {
        if (!Object.prototype.hasOwnProperty.call(received, key) || !isDeepEqual(expected[key], received[key], allowAdditionalProperties)) {
            return false;
        }
    }

    return true;
}
