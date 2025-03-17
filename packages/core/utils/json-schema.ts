import isEqual from 'lodash.isequal'
import xor from 'lodash.xor'
import keys from 'lodash.keys'
import merge from 'lodash.merge'
import { JSONSchema4, JSONSchema4TypeName } from "json-schema";

interface JSONSchema3or4 {
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
/**
     * specify `true` to make all properties required.
     *
     * @default false
     * @example
     * const schema = toJsonSchema(33, {required: false});
     * // { type: "integer" }
     * const schema = toJsonSchema(33, {required: true});
     * // { type: "integer", "required": true }
     */
    required?: boolean | undefined;
/**
     * By providing `postProcessFnc`, you can modify or replace generated
     * schema. This function will be called recursively for all the properties
     * and sub-properties and array items from leaves to the root. If you want
     * to preserve default functionality, don't forget to call defaultFunc
     * which is currently responsible for setting `required` for the schema
     * items if there is common option `required` set to true.
     *
     * @param type JSON schema type of the `value`
     * @param schema Generated JSON schema
     * @param value - input value
     * @param defaultFunc standard function that is used to post-process
     *                    generated schema. Takes the `type`, `schema`,
     *                    `value` params.
     */
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
    /**
         * * `all` option causes parser to go through all array items, finding
         *   the most compatible yet most descriptive schema possible. If
         *   multiple types are found, the type is omitted so it can be
         *   validated.
         * * `first` option takes only first item in the array into account. If
         *   performance is a concern, you may consider this option.
         * * `uniform` option requires all items in array to have same structure
         *   (to convert to the same schema). If not, error is thrown.
         * * `tuple` option generates a
         *   [tuple array](https://json-schema.org/understanding-json-schema/reference/array.html#tuple-validation)
         *   (array of objects) from arrays.
         *
         * @default 'all'
         */
        mode?: "all" | "first" | "uniform" | "tuple" | undefined;
} | undefined;
objects?: {
    /**
         * By providing custom function you will be able to modify any object
         * value (including nested ones) and pre-process it before it gets
         * converted into schema or modify generated schema or do the schema
         * conversion entirely by yourself.
         *
         * @param obj input object value that is supposed to be converted into
         *            JSON schema
         * @param defaultFunc standard function that is used to generate schema
         *                    from object. Takes just the `obj` param.
         */
        preProcessFnc?(
            obj: any,
            defaultFunc: (obj: any) => JSONSchema3or4,
            ): JSONSchema3or4;
    /**
         * By providing `postProcessFnc`, you can modify or replace generated
         * schema. This function will be called recursively for all the
         * properties and sub-properties and array items from leaves to the root
         * of the `obj` object.
         *
         * @param schema Generated JSON schema
         * @param obj input value
         * @param defaultFunc standard function that is used to post-process
         *                    generated schema. Takes the `schema`, `obj`
         *                    params.
         */
        postProcessFnc?(
            schema: JSONSchema3or4,
            obj: any,
            defaultFnc: (schema: JSONSchema3or4, obj: any) => JSONSchema3or4,
            ): JSONSchema3or4;
    /**
         * if set to `false`, all object schemas will include JSON schema
         * property `additionalProperties: false` which makes generated schema
         * to perevent any extra properties.
         *
         * @default true
         */
        additionalProperties?: boolean | undefined;
} | undefined;
strings?: {
    /**
         * By providing custom function you will be able to modify any string
         * value (including nested ones) and pre-process it before it gets
         * converted to schema, modify generated schema or do the schema
         * conversion entirely by yourself.
         *
         * @param value `string` to be converted into JSON schema
         * @param defaultFnc default function that normally generates the
         *                   schema. This function receives only `string` to be
         *                   converted to JSON schema
         */
        preProcessFnc?(
            value: string,
            defaultFnc: (value: string) => JSONSchema3or4,
            ): JSONSchema3or4;
    /**
         * When set to true format of the strings values may be detected based
         * on it's content.
         *
         * These JSON schema string formats can be detected:
         *
         * * date-time
         * * date
         * * time
         * * utc-millisec
         * * color
         * * style
         * * phone
         * * uri
         * * email
         * * ip-address
         * * ipv6
         *
         * @default true
         */
        detectFormat?: boolean | undefined;
} | undefined;
}

const defaultOptions: Options = {
  required: false,
  postProcessFnc: null,

  strings: {
    detectFormat: true,
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
  
  const FORMAT_REGEXPS = {
    'date-time': /^\d{4}-(?:0[0-9]{1}|1[0-2]{1})-(3[01]|0[1-9]|[12][0-9])[tT ](2[0-4]|[01][0-9]):([0-5][0-9]):(60|[0-5][0-9])(\.\d+)?([zZ]|[+-]([0-5][0-9]):(60|[0-5][0-9]))$/,
    date: /^\d{4}-(?:0[0-9]{1}|1[0-2]{1})-(3[01]|0[1-9]|[12][0-9])$/,
    time: /^(2[0-4]|[01][0-9]):([0-5][0-9]):(60|[0-5][0-9])$/,
  
    email: /^(?:[\w!#$%&'*+-/=?^`{|}~]+\.)*[\w!#$%&'*+-/=?^`{|}~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/,
    'ip-address': /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    ipv6: /^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/,
    uri: /^[a-zA-Z][a-zA-Z0-9+-.]*:[^\s]*$/,
  
    color: /^(#?([0-9A-Fa-f]{3}){1,2}\b|aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow|(rgb\(\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*,\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*,\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*\))|(rgb\(\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*\)))$/,
  
    // hostname regex from: http://stackoverflow.com/a/1420225/5628
    hostname: /^(?=.{1,255}$)[0-9A-Za-z](?:(?:[0-9A-Za-z]|-){0,61}[0-9A-Za-z])?(?:\.[0-9A-Za-z](?:(?:[0-9A-Za-z]|-){0,61}[0-9A-Za-z])?)*\.?$/,
    'host-name': /^(?=.{1,255}$)[0-9A-Za-z](?:(?:[0-9A-Za-z]|-){0,61}[0-9A-Za-z])?(?:\.[0-9A-Za-z](?:(?:[0-9A-Za-z]|-){0,61}[0-9A-Za-z])?)*\.?$/,
  
    alpha: /^[a-zA-Z]+$/,
    alphanumeric: /^[a-zA-Z0-9]+$/,
    'utc-millisec': input => (typeof input === 'string') && parseFloat(input) === parseInt(input, 10) && !isNaN(parseFloat(input)), // eslint-disable-line no-restricted-globals
    regex /* istanbul ignore next: not supporting regex right now */ (input) { // eslint-disable-line space-before-function-paren
      let result = true
      try {
        new RegExp(input) // eslint-disable-line no-new
      } catch (e) {
        result = false
      }
      return result
    },
    style: /\s*(.+?):\s*([^;]+);?/g,
    phone: /^\+(?:[0-9] ?){6,14}[0-9]$/,
  } as Record<string, any>

  FORMAT_REGEXPS.regexp = FORMAT_REGEXPS.regex
  FORMAT_REGEXPS.pattern = FORMAT_REGEXPS.regex
  FORMAT_REGEXPS.ipv4 = FORMAT_REGEXPS['ip-address']
  
  const isFormat = function isFormat(input, format) {
    if (typeof input === 'string' && FORMAT_REGEXPS[format] !== undefined) {
      if (FORMAT_REGEXPS[format] instanceof RegExp) {
        return FORMAT_REGEXPS[format].test(input)
      }
      if (typeof FORMAT_REGEXPS[format] === 'function') {
        return FORMAT_REGEXPS[format](input)
      }
    }
    return true
  }

  
  const helpers = {
    stringFormats: keys(FORMAT_REGEXPS),
    isFormat,
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
  
    /**
     * Tries to find the least common schema from two supplied JSON schemas. If it is unable to find
     * such a schema, it returns null. Incompatibility in structure/types leads to returning null,
     * except when the difference is only integer/number. Than the 'number' is used instead 'int'.
     * Types/Structure incompatibility in array items only leads to schema that doesn't specify
     * items structure/type.
     * @param {object} schema1 - JSON schema
     * @param {object} schema2 - JSON schema
     * @returns {object|null}
     */
    mergeSchemaObjs(schema1, schema2) {
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
  
const skipReverseFind = ['hostname', 'host-name', 'alpha', 'alphanumeric', 'regex', 'regexp', 'pattern']
const filteredFormats = helpers.stringFormats.filter(item => skipReverseFind.indexOf(item) < 0)

function getCommonTypeFromArrayOfTypes(arrOfTypes) {
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

function getCommonArrayItemsType(arr) {
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

  /**
   * Tries to find the least common schema that would validate all items in the array. More details
   * helpers.mergeSchemaObjs description
   * @param {array} arr
   * @returns {object|null}
   */
  getCommonArrayItemSchema(arr) {
    const schemas = arr.map(item => this.getSchema(item))
    // schemas.forEach(schema => console.log(JSON.stringify(schema, '\t')))
    return schemas.reduce((acc, current) => helpers.mergeSchemaObjs(acc, current), schemas.pop())
  }

  getObjectSchemaDefault(obj) {
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

  getObjectSchema(obj) {
    if (this.options.objects.preProcessFnc) {
      return this.options.objects.preProcessFnc(obj, this.getObjectSchemaDefault)
    }
    return this.getObjectSchemaDefault(obj)
  }

  getArraySchemaMerging(arr) {
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

  getArraySchemaNoMerging(arr) {
    const schema: JSONSchema3or4 = {type: 'array'}
    if (arr.length > 0) {
      schema.items = this.getSchema(arr[0])
    }
    return schema
  }

  getArraySchemaTuple(arr) {
    const schema: JSONSchema3or4 = {type: 'array'}
    if (arr.length > 0) {
      schema.items = arr.map(item => this.getSchema(item))
    }
    return schema
  }

  getArraySchemaUniform(arr) {
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

  getArraySchema(arr) {
    if (arr.length === 0) { return {type: 'array'} }
    switch (this.options.arrays.mode) {
      case 'all': return this.getArraySchemaMerging(arr)
      case 'first': return this.getArraySchemaNoMerging(arr)
      case 'uniform': return this.getArraySchemaUniform(arr)
      case 'tuple': return this.getArraySchemaTuple(arr)
      default: throw new Error(`Unknown array mode option '${this.options.arrays.mode}'`)
    }
  }

  getStringSchemaDefault(value) {
    const schema: JSONSchema3or4 = {type: 'string'}

    if (!this.options.strings.detectFormat) {
      return schema
    }

    const index = filteredFormats.findIndex(item => helpers.isFormat(value, item))
    if (index >= 0) {
      schema.format = filteredFormats[index]
    }

    return schema
  }

  getStringSchema(value) {
    if (this.options.strings.preProcessFnc) {
      return this.options.strings.preProcessFnc(value, this.getStringSchemaDefault)
    }
    return this.getStringSchemaDefault(value)
  }

  commmonPostProcessDefault(type, schema, value) { // eslint-disable-line no-unused-vars
    if (this.options.required) {
      return merge({}, schema, {required: true})
    }
    return schema
  }

  objectPostProcessDefault(schema, obj) {
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
  getSchema(value) {
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

