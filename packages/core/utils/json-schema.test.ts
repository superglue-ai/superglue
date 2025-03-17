import { describe, expect, it } from 'vitest'
import { toJsonSchema, JSONSchema3or4 } from './json-schema.js'

// Helper type assertion function to make tests cleaner
function assertSingleSchema(schema: JSONSchema3or4): JSONSchema3or4 & {
  type: string;
  properties?: Record<string, any>;
  items?: any;
  format?: string;
  required?: boolean;
} {
  return schema as any;
}

describe('json-schema utility functions', () => {
  describe('toJsonSchema basic type detection', () => {
    it('should correctly identify primitive types', () => {
      expect(toJsonSchema('test string').type).toBe('string')
      expect(toJsonSchema(42).type).toBe('integer')
      expect(toJsonSchema(42.5).type).toBe('number')
      expect(toJsonSchema(true).type).toBe('boolean')
      expect(toJsonSchema(null).type).toBe('null')
    })

    it('should correctly identify arrays', () => {
      const schema = assertSingleSchema(toJsonSchema([1, 2, 3]))
      expect(schema.type).toBe('array')
      expect(schema.items).toBeDefined()
      expect(assertSingleSchema(schema.items).type).toBe('integer')
    })

    it('should correctly identify objects', () => {
      const schema = toJsonSchema({ name: 'John', age: 30 })
      expect(schema.type).toBe('object')
      expect(schema.properties).toBeDefined()
      expect(schema.properties.name.type).toBe('string')
      expect(schema.properties.age.type).toBe('integer')
    })

    it('should handle nested objects', () => {
      const schema = toJsonSchema({
        person: {
          name: 'John',
          address: {
            city: 'New York',
            zip: 10001
          }
        }
      })
      
      expect(schema.type).toBe('object')
      expect(schema.properties.person.type).toBe('object')
      expect(schema.properties.person.properties.name.type).toBe('string')
      expect(schema.properties.person.properties.address.type).toBe('object')
      expect(schema.properties.person.properties.address.properties.city.type).toBe('string')
      expect(schema.properties.person.properties.address.properties.zip.type).toBe('integer')
    })

    it('should handle Date objects', () => {
      const schema = toJsonSchema(new Date())
      expect(schema.type).toBe('date')
    })
  })

  describe('toJsonSchema array handling', () => {
    it('should handle empty arrays', () => {
      const schema = toJsonSchema([])
      expect(schema.type).toBe('array')
      expect(schema.items).toBeUndefined()
    })

    it('should handle homogeneous arrays with primitive types', () => {
      const schema = assertSingleSchema(toJsonSchema([1, 2, 3, 4, 5]))
      expect(schema.type).toBe('array')
      expect(assertSingleSchema(schema.items).type).toBe('integer')
    })

    it('should handle mixed number types in arrays', () => {
      const schema = assertSingleSchema(toJsonSchema([1, 2, 3.5, 4, 5.2]))
      expect(schema.type).toBe('array')
      expect(assertSingleSchema(schema.items).type).toBe('number')
    })

    it('should use only first item in "first" mode', () => {
      const schema = assertSingleSchema(toJsonSchema(['string', 42, true], { arrays: { mode: 'first' } }))
      expect(schema.type).toBe('array')
      expect(assertSingleSchema(schema.items).type).toBe('string')
    })

    it('should throw error for non-uniform arrays in "uniform" mode', () => {
      expect(() => {
        toJsonSchema(['string', 42, true], { arrays: { mode: 'uniform' } })
      }).toThrow()
    })

    it('should create tuple schema in "tuple" mode', () => {
      const schema = toJsonSchema(['string', 42, true], { arrays: { mode: 'tuple' } })
      expect(schema.type).toBe('array')
      expect(Array.isArray(schema.items)).toBe(true)
      expect(schema.items[0].type).toBe('string')
      expect(schema.items[1].type).toBe('integer')
      expect(schema.items[2].type).toBe('boolean')
    })

    it('should handle arrays of objects', () => {
      const schema = assertSingleSchema(toJsonSchema([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ]))
      
      expect(schema.type).toBe('array')
      const itemsSchema = assertSingleSchema(schema.items);
      expect(itemsSchema.type).toBe('object')
      expect(itemsSchema.properties.id.type).toBe('integer')
      expect(itemsSchema.properties.name.type).toBe('string')
    })

    it('should handle nested arrays', () => {
      const schema = assertSingleSchema(toJsonSchema([
        [1, 2, 3],
        [4, 5, 6]
      ]))
      
      expect(schema.type).toBe('array')
      const itemsSchema = assertSingleSchema(schema.items);
      expect(itemsSchema.type).toBe('array')
      expect(assertSingleSchema(itemsSchema.items).type).toBe('integer')
    })
  })

  describe('toJsonSchema object handling', () => {
    it('should handle empty objects', () => {
      const schema = toJsonSchema({})
      expect(schema.type).toBe('object')
      expect(schema.properties).toBeUndefined()
    })

    it('should set additionalProperties to false when configured', () => {
      const schema = toJsonSchema({ name: 'John' }, { 
        objects: { additionalProperties: false } 
      })
      
      expect(schema.type).toBe('object')
      expect(schema.additionalProperties).toBe(false)
    })

    it('should handle objects with mixed property types', () => {
      const schema = toJsonSchema({
        string: 'value',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { nested: 'value' },
        null: null
      })
      
      expect(schema.properties.string.type).toBe('string')
      expect(schema.properties.number.type).toBe('integer')
      expect(schema.properties.boolean.type).toBe('boolean')
      expect(schema.properties.array.type).toBe('array')
      expect(schema.properties.object.type).toBe('object')
      expect(schema.properties.null.type).toBe('null')
    })
  })

  describe('toJsonSchema required option', () => {
    it('should mark schema as required when option is true', () => {
      const schema = toJsonSchema('test', { required: true })
      expect(schema.type).toBe('string')
      expect(schema.required).toBe(true)
    })

    it('should mark all properties as required in nested objects', () => {
      const schema = toJsonSchema({ name: 'John', age: 30 }, { required: true })
      
      expect(schema.type).toBe('object')
      expect(schema.required).toBe(true)
      expect(schema.properties.name.required).toBe(true)
      expect(schema.properties.age.required).toBe(true)
    })

    it('should mark array items as required', () => {
      const schema = assertSingleSchema(toJsonSchema([1, 2, 3], { required: true }))
      
      expect(schema.type).toBe('array')
      expect(schema.required).toBe(true)
      expect(assertSingleSchema(schema.items).required).toBe(true)
    })
  })

  describe('toJsonSchema custom processing', () => {
    it('should allow custom post-processing of schemas', () => {
      const schema = toJsonSchema('test', {
        postProcessFnc: (type, schema, value, defaultFunc) => {
          const processed = defaultFunc(type, schema, value)
          processed.customProperty = 'custom value'
          return processed
        }
      })
      
      expect(schema.type).toBe('string')
      expect(schema.customProperty).toBe('custom value')
    })

    it('should allow custom pre-processing of strings', () => {
      const schema = toJsonSchema('test', {
        strings: {
          preProcessFnc: (value, defaultFnc) => {
            const processed = defaultFnc(value)
            processed.customProperty = 'custom string value'
            return processed
          }
        }
      })
      
      expect(schema.type).toBe('string')
      expect(schema.customProperty).toBe('custom string value')
    })

    it('should allow custom pre-processing of objects', () => {
      const schema = toJsonSchema({ name: 'John' }, {
        objects: {
          preProcessFnc: (obj, defaultFunc) => {
            obj.added = 'new property'
            return defaultFunc(obj)
          }
        }
      })
      
      expect(schema.type).toBe('object')
      expect(schema.properties.name.type).toBe('string')
      expect(schema.properties.added.type).toBe('string')
    })

    it('should allow custom post-processing of objects', () => {
      const schema = toJsonSchema({ name: 'John' }, {
        objects: {
          postProcessFnc: (schema, obj, defaultFnc) => {
            const processed = defaultFnc(schema, obj)
            processed.customObjectProperty = 'custom object value'
            return processed
          }
        }
      })
      
      expect(schema.type).toBe('object')
      expect(schema.customObjectProperty).toBe('custom object value')
    })
  })

  describe('toJsonSchema complex examples', () => {
    it('should handle complex nested structures', () => {
      const data = {
        id: 1,
        name: 'Product',
        price: 29.99,
        tags: ['electronics', 'gadget'],
        inStock: true,
        details: {
          manufacturer: {
            name: 'Tech Corp',
            location: 'San Francisco'
          },
          specifications: [
            { key: 'color', value: 'black' },
            { key: 'weight', value: '300g' }
          ]
        },
        reviews: [
          {
            user: 'user1',
            rating: 5,
            comment: 'Great product!',
            date: '2023-01-15'
          },
          {
            user: 'user2',
            rating: 4,
            comment: 'Good value.',
            date: '2023-01-20'
          }
        ]
      }
      
      const schema = assertSingleSchema(toJsonSchema(data))
      
      expect(schema.type).toBe('object')
      expect(schema.properties.id.type).toBe('integer')
      expect(schema.properties.name.type).toBe('string')
      expect(schema.properties.price.type).toBe('number')
      expect(schema.properties.tags.type).toBe('array')
      expect(assertSingleSchema(schema.properties.tags.items).type).toBe('string')
      expect(schema.properties.inStock.type).toBe('boolean')
      
      expect(schema.properties.details.type).toBe('object')
      expect(schema.properties.details.properties.manufacturer.type).toBe('object')
      expect(schema.properties.details.properties.manufacturer.properties.name.type).toBe('string')
      expect(schema.properties.details.properties.specifications.type).toBe('array')
      expect(assertSingleSchema(schema.properties.details.properties.specifications.items).type).toBe('object')
      
      expect(schema.properties.reviews.type).toBe('array')
      const reviewItemsSchema = assertSingleSchema(schema.properties.reviews.items);
      expect(reviewItemsSchema.type).toBe('object')
      expect(reviewItemsSchema.properties.rating.type).toBe('integer')
      expect(reviewItemsSchema.properties.date.type).toBe('string')
    })

    it('should handle real-world API response example', () => {
      const apiResponse = {
        status: 'success',
        code: 200,
        data: {
          users: [
            {
              id: 1001,
              email: 'user1@example.com',
              profile: {
                firstName: 'John',
                lastName: 'Doe',
                age: 28,
                address: {
                  street: '123 Main St',
                  city: 'Boston',
                  zipCode: '02108',
                  coordinates: {
                    latitude: 42.3601,
                    longitude: -71.0589
                  }
                }
              },
              roles: ['user', 'admin'],
              active: true,
              lastLogin: '2023-03-15T14:30:00Z',
              metadata: {
                loginCount: 42,
                preferences: {
                  theme: 'dark',
                  notifications: true
                }
              }
            },
            {
              id: 1002,
              email: 'user2@example.com',
              profile: {
                firstName: 'Jane',
                lastName: 'Smith',
                age: 34,
                address: {
                  street: '456 Oak Ave',
                  city: 'Chicago',
                  zipCode: '60601',
                  coordinates: {
                    latitude: 41.8781,
                    longitude: -87.6298
                  }
                }
              },
              roles: ['user'],
              active: false,
              lastLogin: '2023-02-20T09:15:00Z',
              metadata: {
                loginCount: 17,
                preferences: {
                  theme: 'light',
                  notifications: false
                }
              }
            }
          ],
          pagination: {
            total: 2,
            page: 1,
            limit: 10,
            pages: 1
          }
        }
      }
      
      const schema = assertSingleSchema(toJsonSchema(apiResponse))
      
      // Top level properties
      expect(schema.type).toBe('object')
      expect(schema.properties.status.type).toBe('string')
      expect(schema.properties.code.type).toBe('integer')
      expect(schema.properties.data.type).toBe('object')
      
      // Users array
      const usersSchema = schema.properties.data.properties.users
      expect(usersSchema.type).toBe('array')
      const userSchema = assertSingleSchema(usersSchema.items);
      expect(userSchema.type).toBe('object')
      
      // User object properties
      expect(userSchema.properties.id.type).toBe('integer')
      expect(userSchema.properties.email.type).toBe('string')
      expect(userSchema.properties.profile.type).toBe('object')
      expect(userSchema.properties.roles.type).toBe('array')
      expect(userSchema.properties.active.type).toBe('boolean')
      expect(userSchema.properties.lastLogin.type).toBe('string')
      
      // Nested profile object
      const profileSchema = userSchema.properties.profile
      expect(profileSchema.properties.firstName.type).toBe('string')
      expect(profileSchema.properties.age.type).toBe('integer')
      expect(profileSchema.properties.address.type).toBe('object')
      
      // Deeply nested address and coordinates
      const addressSchema = profileSchema.properties.address
      expect(addressSchema.properties.street.type).toBe('string')
      expect(addressSchema.properties.coordinates.type).toBe('object')
      expect(addressSchema.properties.coordinates.properties.latitude.type).toBe('number')
      
      // Pagination object
      const paginationSchema = schema.properties.data.properties.pagination
      expect(paginationSchema.type).toBe('object')
      expect(paginationSchema.properties.total.type).toBe('integer')
      expect(paginationSchema.properties.page.type).toBe('integer')
      expect(paginationSchema.properties.limit.type).toBe('integer')
      expect(paginationSchema.properties.pages.type).toBe('integer')
    })
  })

  describe('toJsonSchema schema merging', () => {
    it('should merge compatible schemas in array items', () => {
      const data = [
        { id: 1, name: 'John', active: true },
        { id: 2, name: 'Jane', active: false },
        { id: 3, name: 'Bob', active: true }
      ]
      
      const schema = assertSingleSchema(toJsonSchema(data))
      
      expect(schema.type).toBe('array')
      const itemsSchema = assertSingleSchema(schema.items);
      expect(itemsSchema.type).toBe('object')
      expect(itemsSchema.properties.id.type).toBe('integer')
      expect(itemsSchema.properties.name.type).toBe('string')
      expect(itemsSchema.properties.active.type).toBe('boolean')
    })

    it('should handle arrays with objects having different properties', () => {
      const data = [
        { id: 1, name: 'John' },
        { id: 2, email: 'jane@example.com' },
        { id: 3, active: true }
      ]
      
      const schema = assertSingleSchema(toJsonSchema(data, {arrays: {mode: 'first'}}))
      
      expect(schema.type).toBe('array')
      const itemsSchema = assertSingleSchema(schema.items);
      expect(itemsSchema.type).toBe('object')
      expect(itemsSchema.properties.id.type).toBe('integer')
      
      // The merged schema should contain all properties
      expect(itemsSchema.properties.name).toBeDefined()
      expect(itemsSchema.properties.email).toBeUndefined()
      expect(itemsSchema.properties.active).toBeUndefined()
    })

    it('should handle integer and number type mixing', () => {
      const data = [1, 2, 3.5, 4]
      
      const schema = assertSingleSchema(toJsonSchema(data))
      
      expect(schema.type).toBe('array')
      expect(assertSingleSchema(schema.items).type).toBe('number')
    })
  })

  describe('toJsonSchema edge cases', () => {
    it('should handle undefined values', () => {
      const schema = toJsonSchema(undefined)
      expect(schema.type).toBe('null')
    })

    it('should handle NaN values', () => {
      const schema = toJsonSchema(NaN)
      expect(schema.type).toBe('null')
    })

    it('should handle Infinity values', () => {
      const schema = toJsonSchema(Infinity)
      expect(schema.type).toBe('null')
    })

    it('should handle empty string', () => {
      const schema = toJsonSchema('')
      expect(schema.type).toBe('string')
    })

    it('should handle objects with symbol keys', () => {
      const sym = Symbol('test')
      const obj = { [sym]: 'value' }
      
      const schema = toJsonSchema(obj)
      expect(schema.type).toBe('object')
      // Symbol keys are not enumerable in JSON, so properties should be empty
      expect(Object.keys(schema.properties || {}).length).toBe(0)
    })

    it('should handle objects with function values', () => {
      const obj = { 
        func: function() { return true; },
        name: 'test'
      }
      
      const schema = toJsonSchema(obj)
      expect(schema.type).toBe('object')
      expect(schema.properties.name.type).toBe('string')
      // Functions are not serialized to JSON
      expect(schema.properties.func.type).toBe('null')
    })

    it('should handle circular references gracefully', () => {
      const obj: any = { name: 'circular' }
      obj.self = obj
      
      // This should either throw a controlled error or handle it somehow
      expect(() => toJsonSchema(obj)).toThrow()
    })
  })

  describe('toJsonSchema performance considerations', () => {
    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }))
      
      const startTime = performance.now()
      const schema = assertSingleSchema(toJsonSchema(largeArray))
      const endTime = performance.now()
      
      expect(schema.type).toBe('array')
      expect(assertSingleSchema(schema.items).type).toBe('object')
      expect(endTime - startTime).toBeLessThan(1000) // Should process in less than 1 second
    })

    it('should handle deeply nested objects efficiently', () => {
      // Create a deeply nested object
      let deepObj: any = { value: 'deepest' }
      for (let i = 0; i < 100; i++) {
        deepObj = { nested: deepObj }
      }
      
      const startTime = performance.now()
      const schema = toJsonSchema(deepObj)
      const endTime = performance.now()
      
      expect(schema.type).toBe('object')
      expect(endTime - startTime).toBeLessThan(1000) // Should process in less than 1 second
    })
  })

  describe('toJsonSchema comparison with JSON Schema standards', () => {
    it('should generate schemas compatible with JSON Schema Draft 4', () => {
      const data = {
        id: 1,
        name: 'Test',
        tags: ['a', 'b', 'c'],
        metadata: {
          created: '2023-01-01T00:00:00Z'
        }
      }
      
      const schema = assertSingleSchema(toJsonSchema(data))
      
      // These are key properties from JSON Schema Draft 4
      expect(schema.type).toBe('object')
      expect(typeof schema.properties).toBe('object')
      expect(schema.properties.id.type).toBe('integer')
      expect(schema.properties.tags.type).toBe('array')
      expect(assertSingleSchema(schema.properties.tags.items).type).toBe('string')
    })
  })
}) 