import { GraphQLRequestContext } from "../types.js";

export const getTenantInfoResolver = async (
  _: any,
  __: any,
  context: GraphQLRequestContext
) => {
  const { datastore } = context;
  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
    return {
      email: null,
      emailEntrySkipped: true // Always skip when disabled
    };
  }
  try {
    const tenantInfo = await datastore.getTenantInfo();
    return tenantInfo;
  } catch (error) {
    console.error('Error getting tenant info:', error);
    return {
      email: null,
      emailEntrySkipped: false
    };
  }
};

export const setTenantInfoResolver = async (
  _: any,
  { email, emailEntrySkipped }: { email?: string, emailEntrySkipped?: boolean },
  context: GraphQLRequestContext
) => {
  const { datastore } = context;
  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
    return {
      email: null,
      emailEntrySkipped: true // Always skip when disabled
    };
  }
  try {
    await datastore.setTenantInfo({ email, emailEntrySkipped });
    const currentInfo = await datastore.getTenantInfo();
    return currentInfo;
  } catch (error) {
    console.error('Error setting tenant info:', error);
    throw new Error('Failed to set tenant info');
  }
}; 
