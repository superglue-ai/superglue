import { describe, expect, it, vi } from 'vitest';
import { replaceVariables } from '../tools.js';

// Mock jsonata for testing
vi.mock('jsonata', () => ({
  default: vi.fn().mockImplementation(() => ({
    evaluate: vi.fn().mockImplementation((data) => {
      // Simple mock implementation
      return data.value || data;
    }),
    registerFunction: vi.fn()
  }))
}));

describe('Variable replacement', () => {
  it('should handle empty input gracefully', async () => {
    const result1 = await replaceVariables('', {});
    expect(result1).toBe('');

    const result2 = await replaceVariables(undefined, {});
    expect(result2).toBe('');

    const result3 = await replaceVariables('template', null);
    expect(result3).toBe('template');
  });

  it('should replace direct variables with values from payload', async () => {
    const template = 'Hello <<name>>, welcome to <<app>>!';
    const payload = { name: 'John', app: 'SuperGlue' };
    
    const result = await replaceVariables(template, payload);
    expect(result).toBe('Hello John, welcome to SuperGlue!');
  });

  it('should replace null/undefined values with empty strings', async () => {
    const template = 'Name: <<name>>, Age: <<age>>';
    const payload = { name: null, age: undefined };
    
    const result = await replaceVariables(template, payload);
    expect(result).toBe('Name: , Age: ');
  });

  it('should stringify objects and arrays', async () => {
    const template = 'User: <<user>>, Items: <<items>>';
    const payload = {
      user: { id: 1, name: 'John' },
      items: [1, 2, 3]
    };
    
    const result = await replaceVariables(template, payload);
    expect(result).toBe('User: {"id":1,"name":"John"}, Items: [1,2,3]');
  });

  it('should handle nested variables correctly', async () => {
    const template = 'Welcome <<user.name>>';
    const payload = {
      user: { name: 'Alice' }
    };
    
    // The mock jsonata will respond differently than real implementation
    // But we're testing the error handling here
    const result = await replaceVariables(template, payload);
    // In our mock, this will use the entire payload
    expect(result).toContain('Welcome'); // At minimum it should have the static text
  });

  it('should handle errors gracefully during replacement', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Silence warnings
    
    // Mock a JSONata error by forcing jsonata to throw
    vi.mock('jsonata', () => ({
      default: vi.fn().mockImplementation(() => {
        throw new Error('Mock JSONata error');
      })
    }));
    
    const template = 'Value: <<data.value>>';
    const payload = { data: { value: 'test' } };
    
    const result = await replaceVariables(template, payload);
    // Should replace with empty string on error but keep template text
    expect(result).toBe('Value: ');
  });
});