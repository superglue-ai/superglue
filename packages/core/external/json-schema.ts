/*

MIT License

Scope: json-schema.ts

Based on https://github.com/robere2/gen-json-schema, a fork of https://github.com/ruzicka/to-json-schema

Copyright (c) 2025 David Ruzicka, Erik Roberts, Stefan Faistenauer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

import isEqual from 'lodash.isequal'
import xor from 'lodash.xor'
import keys from 'lodash.keys'
import merge from 'lodash.merge'
import { JSONSchema4, JSONSchema4TypeName } from "json-schema";

export interface JSONSchema3or4 {
id?: JSONSchema4["id"] | undefined;
$ref?: JSONSchema4["$ref"] | undefined;
$schema?: JSONSchema4["$schema"] | undefined;
title?: JSONSchema4["title"] | undefined;
description?: JSONSchema4["description"] | undefined;

default?: JSONSchema4["default"] | undefined;
multipleOf?: JSONSchema4["multipleOf"] | undefined;
/** JSON Schema 3 uses `divisibleBy` instead of `multipleOf`. */
    divisibleBy?: JSONSchema4["multipleOf"] | undefined;
maximum?: JSONSchema4["maximum"] | undefined;
exclusiveMaximum?: JSONSchema4["exclusiveMaximum"] | undefined;
minimum?: JSONSchema4["minimum"] | undefined;
exclusiveMinimum?: JSONSchema4["exclusiveMinimum"] | undefined;
maxLength?: JSONSchema4["maxLength"] | undefined;
minLength?: JSONSchema4["minLength"] | undefined;
pattern?: JSONSchema4["pattern"] | undefined;

additionalItems?: boolean | JSONSchema3or4 | undefined;
items?: JSONSchema3or4 | JSONSchema3or4[] | undefined;

maxItems?: JSONSchema4["maxItems"] | undefined;
minItems?: JSONSchema4["minItems"] | undefined;
uniqueItems?: JSONSchema4["uniqueItems"] | undefined;
maxProperties?: JSONSchema4["maxProperties"] | undefined;
minProperties?: JSONSchema4["minProperties"] | undefined;

required?: boolean | JSONSchema4["required"] | undefined;
additionalProperties?: boolean | JSONSchema3or4 | undefined;

definitions?: JSONSchema4["definitions"] | undefined;

properties?: {
    [k: string]: JSONSchema3or4;
} | undefined;

patternProperties?: {
    [k: string]: JSONSchema3or4;
} | undefined;
dependencies?: {
    [k: string]: JSONSchema3or4 | string | string[];
} | undefined;

enum?: JSONSchema4["enum"] | undefined;
type?: JSONSchema4["type"] | undefined;

allOf?: JSONSchema4["allOf"] | undefined;
anyOf?: JSONSchema4["anyOf"] | undefined;
oneOf?: JSONSchema4["oneOf"] | undefined;
not?: JSONSchema4["not"] | undefined;

/** JSON Schema 3 only */
    disallow?: string | Array<string | JSONSchema3or4> | undefined;

extends?: JSONSchema3or4 | JSONSchema3or4[] | undefined;

[k: string]: any;

format?: string | undefined;
}

interface Options {
    required?: boolean | undefined;
    postProcessFnc?(
        type: JSONSchema4TypeName,
        schema: JSONSchema3or4,
        value: any,
        defaultFunc: (
        type: JSONSchema4TypeName,
        schema: JSONSchema3or4,
        value: any,
        ) => JSONSchema3or4,
        ): JSONSchema3or4;

arrays?: {
        mode?: "all" | "first" | "uniform" | "tuple" | undefined;
} | undefined;
objects?: {
        preProcessFnc?(
            obj: any,
            defaultFunc: (obj: any) => JSONSchema3or4,
            ): JSONSchema3or4;
        postProcessFnc?(
            schema: JSONSchema3or4,
            obj: any,
            defaultFnc: (schema: JSONSchema3or4, obj: any) => JSONSchema3or4,
            ): JSONSchema3or4;
        additionalProperties?: boolean | undefined;
} | undefined;
strings?: {
        preProcessFnc?(
            value: string,
            defaultFnc: (value: string) => JSONSchema3or4,
            ): JSONSchema3or4;
} | undefined;
}

const defaultOptions: Options = {
  required: false,
  postProcessFnc: null,

  strings: {
    preProcessFnc: null,
  },
  arrays: {
    mode: 'all',
  },
  objects: {
    preProcessFnc: null,
    postProcessFnc: null,
    additionalProperties: true,
  },
}

const types = {
    string: function testString(instance) {
      return typeof instance === 'string'
    },
  
    number: function testNumber(instance) {
      // isFinite returns false for NaN, Infinity, and -Infinity
      return typeof instance === 'number' && isFinite(instance) // eslint-disable-line no-restricted-globals
    },
  
    integer: function testInteger(instance) {
      return (typeof instance === 'number') && instance % 1 === 0
    },
  
    boolean: function testBoolean(instance) {
      return typeof instance === 'boolean'
    },
  
    array: function testArray(instance) {
      return instance instanceof Array
    },
  
    null: function testNull(instance) {
      return instance === null
    },
  
    date: function testDate(instance) {
      return instance instanceof Date
    },
  
    any: /* istanbul ignore next: not using this but keeping it here for sake of completeness */
      function testAny(instance) { // eslint-disable-line no-unused-vars
        return true
      },
  
    object: function testObject(instance) {
      return instance && (typeof instance) === 'object' && !(instance instanceof Array) && !(instance instanceof Date)
    },
  }
  
  const helpers = {
    typeNames: [
      'integer',
      'number', // make sure number is after integer (for proper type detection)
      'string',
      'array',
      'object',
      'boolean',
      'null',
      'date',
    ] as JSONSchema4TypeName[],
  
    getType(val: any): JSONSchema4TypeName {
      return helpers.typeNames.find(typeName => types[typeName](val))
    },
  
    mergeSchemaObjs(schema1: JSONSchema3or4, schema2: JSONSchema3or4): JSONSchema3or4 | null {
      if (!schema1 || !schema2) {
        return null
      }
  
      const schema1Keys = keys(schema1)
      const schema2Keys = keys(schema2)
      if (!isEqual(schema1Keys, schema2Keys)) {
        if (schema1.type === 'array' && schema2.type === 'array') {
          // TODO optimize???
          if (isEqual(xor(schema1Keys, schema2Keys), ['items'])) {
            const schemaWithoutItems = schema1Keys.length > schema2Keys.length ? schema2 : schema1
            const schemaWithItems = schema1Keys.length > schema2Keys.length ? schema1 : schema2
            const isSame = keys(schemaWithoutItems).reduce((acc, current) => isEqual(schemaWithoutItems[current], schemaWithItems[current]) && acc, true)
            if (isSame) {
              return schemaWithoutItems
            }
          }
        }
        if (schema1.type !== 'object' || schema2.type !== 'object') {
          return null
        }
      }
  
      const retObj = {}
      for (let i = 0, {length} = schema1Keys; i < length; i++) {
        const key = schema1Keys[i]
        if (helpers.getType(schema1[key]) === 'object') {
          const x = helpers.mergeSchemaObjs(schema1[key], schema2[key])
          if (!x) {
            if (schema1.type === 'object' || schema2.type === 'object') {
              return {type: 'object'}
            }
            // special treatment for array items. If not mergeable, we can do without them
            if (key !== 'items' || schema1.type !== 'array' || schema2.type !== 'array') {
              return null
            }
          } else {
            retObj[key] = x
          }
        } else {
          // simple value schema properties (not defined by object)
          if (key === 'type') { // eslint-disable-line no-lonely-if
            if (schema1[key] !== schema2[key]) {
              if ((schema1[key] === 'integer' && schema2[key] === 'number')
                || (schema1[key] === 'number' && schema2[key] === 'integer')) {
                retObj[key] = 'number'
              } else {
                return null
              }
            } else {
              retObj[key] = schema1[key]
            }
          } else {
            if (!isEqual(schema1[key], schema2[key])) {
              // TODO Is it even possible to take this path?
              return null
            }
            retObj[key] = schema1[key]
          }
        }
      }
      return retObj
    },
  }
  
function getCommonTypeFromArrayOfTypes(arrOfTypes: string[]): JSONSchema4TypeName | null {
  let lastVal
  for (let i = 0, {length} = arrOfTypes; i < length; i++) {
    let currentType = arrOfTypes[i]
    if (i > 0) {
      if (currentType === 'integer' && lastVal === 'number') {
        currentType = 'number'
      } else if (currentType === 'number' && lastVal === 'integer') {
        lastVal = 'number'
      }
      if (lastVal !== currentType) return null
    }
    lastVal = currentType
  }
  return lastVal
}

function getCommonArrayItemsType(arr: any[]): JSONSchema4TypeName | null {
  return getCommonTypeFromArrayOfTypes(arr.map(item => helpers.getType(item)))
}


class ToJsonSchema {
  private options: Options
  constructor(options: Options) {
    this.options = merge({}, defaultOptions, options)

    this.getObjectSchemaDefault = this.getObjectSchemaDefault.bind(this)
    this.getStringSchemaDefault = this.getStringSchemaDefault.bind(this)
    this.objectPostProcessDefault = this.objectPostProcessDefault.bind(this)
    this.commmonPostProcessDefault = this.commmonPostProcessDefault.bind(this)
    this.objectPostProcessDefault = this.objectPostProcessDefault.bind(this)
  }

  getCommonArrayItemSchema(arr: Array<any>): object | null {
    const schemas = arr.map(item => this.getSchema(item))
    // schemas.forEach(schema => console.log(JSON.stringify(schema, '\t')))
    return schemas.reduce((acc, current) => helpers.mergeSchemaObjs(acc, current), schemas.pop())
  }

  getObjectSchemaDefault(obj: any): JSONSchema3or4 {
    const schema: JSONSchema3or4 = {type: 'object'}
    const objKeys = Object.keys(obj)
    if (objKeys.length > 0) {
      schema.properties = objKeys.reduce((acc, propertyName) => {
        acc[propertyName] = this.getSchema(obj[propertyName]) // eslint-disable-line no-param-reassign
        return acc
      }, {})
    }
    return schema
  }

  getObjectSchema(obj: any): JSONSchema3or4 {
    if (this.options.objects.preProcessFnc) {
      return this.options.objects.preProcessFnc(obj, this.getObjectSchemaDefault)
    }
    return this.getObjectSchemaDefault(obj)
  }

  getArraySchemaMerging(arr: Array<any>): JSONSchema3or4 {
    const schema: JSONSchema3or4 = {type: 'array'}
    const commonType = getCommonArrayItemsType(arr)
    if (commonType) {
      schema.items = {type: commonType}
      if (commonType !== 'integer' && commonType !== 'number') {
        const itemSchema = this.getCommonArrayItemSchema(arr)
        if (itemSchema) {
          schema.items = itemSchema
        }
      } else if (this.options.required) {
        schema.items.required = true
      }
    }
    return schema
  }

  getArraySchemaNoMerging(arr: Array<any>): JSONSchema3or4 {
    const schema: JSONSchema3or4 = {type: 'array'}
    if (arr.length > 0) {
      schema.items = this.getSchema(arr[0])
    }
    return schema
  }

  getArraySchemaTuple(arr: Array<any>): JSONSchema3or4 {
    const schema: JSONSchema3or4 = {type: 'array'}
    if (arr.length > 0) {
      schema.items = arr.map(item => this.getSchema(item))
    }
    return schema
  }

  getArraySchemaUniform(arr: Array<any>): JSONSchema3or4 {
    const schema: JSONSchema3or4 = this.getArraySchemaNoMerging(arr)

    if (arr.length > 1) {
      for (let i = 1; i < arr.length; i++) {
        if (!isEqual(schema.items, this.getSchema(arr[i]))) {
          throw new Error('Invalid schema, incompatible array items')
        }
      }
    }
    return schema
  }

  getArraySchema(arr: Array<any>): JSONSchema3or4 {
    if (arr.length === 0) { return {type: 'array'} }
    switch (this.options.arrays.mode) {
      case 'all': return this.getArraySchemaMerging(arr)
      case 'first': return this.getArraySchemaNoMerging(arr)
      case 'uniform': return this.getArraySchemaUniform(arr)
      case 'tuple': return this.getArraySchemaTuple(arr)
      default: throw new Error(`Unknown array mode option '${this.options.arrays.mode}'`)
    }
  }

  getStringSchemaDefault(value: any): JSONSchema3or4 {
    const schema: JSONSchema3or4 = {type: 'string'}
    return schema
  }

  getStringSchema(value: any): JSONSchema3or4 {
    if (this.options.strings.preProcessFnc) {
      return this.options.strings.preProcessFnc(value, this.getStringSchemaDefault)
    }
    return this.getStringSchemaDefault(value)
  }

  commmonPostProcessDefault(type: JSONSchema4TypeName, schema: JSONSchema3or4, value: any): JSONSchema3or4 { // eslint-disable-line no-unused-vars
    if (this.options.required) {
      return merge({}, schema, {required: true})
    }
    return schema
  }

  objectPostProcessDefault(schema: JSONSchema3or4, obj: any): JSONSchema3or4 {
    if (this.options.objects.additionalProperties === false && Object.getOwnPropertyNames(obj).length > 0) {
      return merge({}, schema, {additionalProperties: false})
    }
    return schema
  }

  /**
   * Gets JSON schema for provided value
   * @param value
   * @returns {object}
   */
  getSchema(value: any): JSONSchema3or4 {
    let type = helpers.getType(value)
    if (!type) {
      type = 'null'
    }

    let schema
    switch (type) {
      case 'object':
        schema = this.getObjectSchema(value)
        break
      case 'array':
        schema = this.getArraySchema(value)
        break
      case 'string':
        schema = this.getStringSchema(value)
        break
      default:
        schema = {type}
    }


    if (this.options.postProcessFnc) {
      schema = this.options.postProcessFnc(type, schema, value, this.commmonPostProcessDefault)
    } else {
      schema = this.commmonPostProcessDefault(type, schema, value)
    }

    if (type === 'object') {
      if (this.options.objects.postProcessFnc) {
        schema = this.options.objects.postProcessFnc(schema, value, this.objectPostProcessDefault)
      } else {
        schema = this.objectPostProcessDefault(schema, value)
      }
    }

    return schema
  }
}

export function toJsonSchema(value: any, options?: Options): JSONSchema3or4 {
  const tjs = new ToJsonSchema(options)
  return tjs.getSchema(value)
}

