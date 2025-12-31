import assert from "assert";

export default function validate(data: any, payload: any): void {
  assert(data, "Data is required");
  assert(data.categories, "categories field is required");
  assert(Array.isArray(data.categories), "categories must be an array");
  assert(
    data.categories.length === 2,
    `Expected 2 categories with revenue > $5000, got ${data.categories.length}`,
  );

  const categoryMap = new Map(data.categories.map((c: any) => [c.category, c]));

  assert(categoryMap.has("Electronics"), "Expected Electronics category");
  assert(categoryMap.has("Furniture"), "Expected Furniture category");

  const electronics = categoryMap.get("Electronics");
  const furniture = categoryMap.get("Furniture");

  assert(
    electronics.total_revenue > 5000,
    `Electronics revenue should be > $5000, got ${electronics.total_revenue}`,
  );
  assert(
    furniture.total_revenue > 5000,
    `Furniture revenue should be > $5000, got ${furniture.total_revenue}`,
  );

  assert(
    electronics.total_revenue > furniture.total_revenue,
    "Electronics should have higher revenue than Furniture",
  );

  assert(typeof electronics.item_count === "number", "Electronics item_count must be a number");
  assert(typeof furniture.item_count === "number", "Furniture item_count must be a number");
  assert(electronics.item_count > 0, "Electronics item_count must be > 0");
  assert(furniture.item_count > 0, "Furniture item_count must be > 0");

  const electronicsRevenue = electronics.total_revenue;
  assert(
    electronicsRevenue >= 23000 && electronicsRevenue <= 24000,
    `Electronics revenue expected ~$23.5k, got ${electronicsRevenue}`,
  );

  const furnitureRevenue = furniture.total_revenue;
  assert(
    furnitureRevenue >= 20000 && furnitureRevenue <= 21000,
    `Furniture revenue expected ~$20k, got ${furnitureRevenue}`,
  );
}
