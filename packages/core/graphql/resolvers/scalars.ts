import { GraphQLScalarType } from 'graphql';
import { GraphQLDateTime, GraphQLJSON } from 'graphql-scalars';

// TODO: Implement more specific definitions for these scalars

export const JSONResolver = new GraphQLScalarType({ ...GraphQLJSON, name: 'JSON' });
export const JSONataResolver = new GraphQLScalarType({ ...GraphQLJSON, name: 'JSONata' });
export const JSONSchemaResolver = new GraphQLScalarType({ ...GraphQLJSON, name: 'JSONSchema' });
export const DateTimeResolver = new GraphQLScalarType({ ...GraphQLDateTime, name: 'DateTime' });