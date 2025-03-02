import { DataStore } from "@superglue/shared";

export const getTenantInfoResolver = async (
  _: any,
  __: any,
  { datastore }: { datastore: DataStore }
) => {
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
  { email }: { email: string },
  { datastore }: { datastore: DataStore }
) => {
  try {
    await datastore.setTenantInfo(email);
    return {
      email,
      hasAskedForEmail: true
    };
  } catch (error) {
    console.error('Error setting tenant info:', error);
    throw new Error('Failed to set tenant info');
  }
}; 
