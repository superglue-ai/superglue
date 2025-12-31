import assert from "assert";

export default function validate(data: any, payload: any): void {
  assert(data, "Data is required");
  assert(data.users, "users field is required");
  assert(Array.isArray(data.users), "users must be an array");
  assert(data.users.length === 10, `Expected 10 users, got ${data.users.length}`);

  for (const user of data.users) {
    assert(typeof user.id === "string", "User must have id string");
    assert(typeof user.name === "string", "User must have name string");
    assert(typeof user.email === "string", "User must have email string");

    assert("address.street" in user, "User must have address.street field");
    assert("address.city" in user, "User must have address.city field");
    assert("address.state" in user, "User must have address.state field");
    assert("address.zipcode" in user, "User must have address.zipcode field");
    assert("address.country" in user, "User must have address.country field");

    assert(typeof user["address.street"] === "string", "address.street must be string");
    assert(typeof user["address.city"] === "string", "address.city must be string");
    assert(typeof user["address.state"] === "string", "address.state must be string");

    assert("preferences.newsletter" in user, "User must have preferences.newsletter field");
    assert("preferences.theme" in user, "User must have preferences.theme field");
    assert(
      "preferences.notifications.email" in user,
      "User must have preferences.notifications.email field",
    );
    assert(
      "preferences.notifications.sms" in user,
      "User must have preferences.notifications.sms field",
    );

    assert(
      typeof user["preferences.newsletter"] === "boolean",
      "preferences.newsletter must be boolean",
    );
    assert(typeof user["preferences.theme"] === "string", "preferences.theme must be string");
    assert(
      typeof user["preferences.notifications.email"] === "boolean",
      "preferences.notifications.email must be boolean",
    );
    assert(
      typeof user["preferences.notifications.sms"] === "boolean",
      "preferences.notifications.sms must be boolean",
    );

    assert(Array.isArray(user.orders), "orders must be preserved as array");

    assert(
      !("address" in user && typeof user.address === "object" && "city" in user.address),
      "address should be flattened, not kept as nested object",
    );
    assert(
      !(
        "preferences" in user &&
        typeof user.preferences === "object" &&
        "theme" in user.preferences
      ),
      "preferences should be flattened, not kept as nested object",
    );
  }

  const userIds = data.users.map((u: any) => u.id);
  assert(userIds.includes("U001"), "Expected user U001 (John Smith)");
  assert(userIds.includes("U010"), "Expected user U010 (Patricia Garcia)");
}
