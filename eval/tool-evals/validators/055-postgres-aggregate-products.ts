import assert from "assert";


export default function validate(result: any, payload: any): void {
  assert(result && typeof result === 'object', 'Result must be an object');
  assert(Array.isArray(result.categories), 'Result must have a "categories" array');
  assert(result.categories.length === 2, 'Expected exactly 2 categories (Electronics and Furniture)');

  for (const category of result.categories) {
    assert(typeof category.category === 'string', 'Each category must have a "category" string');
    assert(typeof category.product_count === 'number', 'Each category must have a "product_count" number');
    assert(typeof category.avg_price === 'number', 'Each category must have an "avg_price" number');
    assert(typeof category.total_stock === 'number', 'Each category must have a "total_stock" number');
  }

  const electronics = result.categories.find((c: any) => c.category === 'Electronics');
  const furniture = result.categories.find((c: any) => c.category === 'Furniture');

  assert(electronics, 'Missing Electronics category');
  assert(electronics.product_count === 5, `Electronics should have 5 products, got ${electronics.product_count}`);
  assert(electronics.total_stock === 865, `Electronics total stock should be 865, got ${electronics.total_stock}`);

  // Validate average price for Electronics
  const expectedElectronicsAvgPrice = 449.99;
  assert(
    Math.abs(electronics.avg_price - expectedElectronicsAvgPrice) <= 1,
    `Electronics avg_price should be ~${expectedElectronicsAvgPrice}, got ${electronics.avg_price}`
  );

  assert(furniture, 'Missing Furniture category');
  assert(furniture.product_count === 3, `Furniture should have 3 products, got ${furniture.product_count}`);
  assert(furniture.total_stock === 145, `Furniture total stock should be 145, got ${furniture.total_stock}`);

  // Validate average price for Furniture
  const expectedFurnitureAvgPrice = 324.99;
  assert(
    Math.abs(furniture.avg_price - expectedFurnitureAvgPrice) <= 1,
    `Furniture avg_price should be ~${expectedFurnitureAvgPrice}, got ${furniture.avg_price}`
  );
}
