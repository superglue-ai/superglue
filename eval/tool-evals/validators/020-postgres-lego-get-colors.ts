import assert from 'assert';

export default function validate(data: any, payload: any): void {
  assert(data, 'data must exist');
  assert(data.colors, 'colors key must exist');
  assert(Array.isArray(data.colors), 'colors must be an array');
  assert(data.colors.length > 100, 'must have more than 100 colors');
  
  // Check that all colors are strings
  for (const color of data.colors) {
    assert(typeof color === 'string', `color must be a string, got ${typeof color}`);
    assert(color.length > 0, 'color name cannot be empty');
  }
}

