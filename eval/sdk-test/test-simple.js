import { SuperglueClient } from '@superglue/client';

console.log('SuperglueClient imported:', SuperglueClient);
console.log('Creating client...');

try {
  const client = new SuperglueClient('http://localhost:3000', 'test-key');
  console.log('Client created successfully:', client);
} catch (error) {
  console.error('Error creating client:', error);
}
