import { DataStore } from "@superglue/shared";

export const getTenantInfoResolver = async (
  _: any,
  __: any,
  { datastore }: { datastore: DataStore }
) => {
  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
    return {
      email: null,
      hasAskedForEmail: true
    };
  }
  try {
    return await datastore.getTenantInfo();
  } catch (error) {
    console.error('Error getting tenant info:', error);
    return {
      email: null,
      hasAskedForEmail: false
    };
  }
};

export const setTenantInfoResolver = async (
  _: any,
  { email, hasAskedForEmail }: { email?: string, hasAskedForEmail?: boolean },
  { datastore }: { datastore: DataStore }
) => {
  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
    return {
      email: null,
      hasAskedForEmail
    };
  }
  try {
    await datastore.setTenantInfo(email, hasAskedForEmail);
    return {
      email,
      hasAskedForEmail
    };
  } catch (error) {
    console.error('Error setting tenant info:', error);
    throw new Error('Failed to set tenant info');
  }
}; 
