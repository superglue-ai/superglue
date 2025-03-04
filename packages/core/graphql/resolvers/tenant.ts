import { DataStore } from "@superglue/shared";

export const getTenantInfoResolver = async (
  _: any,
  __: any,
  { datastore }: { datastore: DataStore }
) => {
  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
    return {
      email: null,
      emailEntrySkipped: true
    };
  }
  try {
    return await datastore.getTenantInfo();
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
  { datastore }: { datastore: DataStore }
) => {
  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
    return {
      email: null,
      emailEntrySkipped
    };
  }
  try {
    await datastore.setTenantInfo(email, emailEntrySkipped);
    return {
      email,
      emailEntrySkipped
    };
  } catch (error) {
    console.error('Error setting tenant info:', error);
    throw new Error('Failed to set tenant info');
  }
}; 
