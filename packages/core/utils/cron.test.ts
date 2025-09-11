import { describe, it, expect } from 'vitest';
import { calculateNextRun, validateCronExpression } from './cron.js';

describe('calculateNextRun', () => {
    it('should calculate next run for every minute cron expression', () => {
        const cronExpression = '* * * * *';
        const from = new Date('2024-01-01T12:00:00Z');
        
        const nextRun = calculateNextRun(cronExpression, from);
        
        expect(nextRun).toEqual(new Date('2024-01-01T12:01:00Z'));
    });

    it('should calculate next run for daily at midnight', () => {
        const cronExpression = '0 0 * * *';
        const from = new Date('2024-01-01T12:30:00Z');
        
        const nextRun = calculateNextRun(cronExpression, from);
        
        expect(nextRun).toEqual(new Date('2024-01-02T00:00:00Z'));
    });

    it('should calculate next run for weekly on Monday at 9 AM', () => {
        const cronExpression = '0 9 * * 1';
        const from = new Date('2024-01-01T12:00:00Z');
        
        const nextRun = calculateNextRun(cronExpression, from);
        
        expect(nextRun).toEqual(new Date('2024-01-08T09:00:00Z'));
    });

    it('should use current time when from is not provided', () => {
        const cronExpression = '* * * * *';
        const before = new Date();
        
        const nextRun = calculateNextRun(cronExpression);
        
        const after = new Date();
        expect(nextRun.getTime()).toBeGreaterThan(before.getTime());
        expect(nextRun.getTime()).toBeLessThan(after.getTime() + 60000);
    });

    it('should handle complex cron expression', () => {
        const cronExpression = '30 14 * * 1-5';
        const from = new Date('2024-01-01T10:00:00Z');
        
        const nextRun = calculateNextRun(cronExpression, from);
        
        expect(nextRun).toEqual(new Date('2024-01-01T14:30:00Z'));
    });

    it('should throw error for invalid cron expression', () => {
        const invalidCron = 'invalid cron';
        
        expect(() => calculateNextRun(invalidCron)).toThrow();
    });
});

describe('validateCron', () => {
    it('should accept valid basic cron expressions', () => {
        expect(validateCronExpression('*/2 * * * *')).toBe(true);   // Every 2 minutes
        expect(validateCronExpression('*/15 * * * *')).toBe(true);  // Every 15 minutes  
        expect(validateCronExpression('*/30 * * * *')).toBe(true);  // Every 30 minutes
        expect(validateCronExpression('0 * * * *')).toBe(true);    // Hourly
        expect(validateCronExpression('0 0 * * *')).toBe(true);    // Daily
        expect(validateCronExpression('0 0 * * 0')).toBe(true);    // Weekly
        expect(validateCronExpression('0 0 1 * *')).toBe(true);    // Monthly
    })

    it('should accept cron expressions with stepping', () => {
        expect(validateCronExpression('*/15 * * * *')).toBe(true); // Every 15 minutes
    });

    it('should reject invalid cron expression', () => {
        expect(validateCronExpression('invalid cron')).toBe(false);
    });

    it('should reject cron expression with seconds', () => {
        expect(validateCronExpression('*/10 * * * * *')).toBe(false); // Every 10 seconds
    });

    it('should reject cron expression with years', () => {
        expect(validateCronExpression('0 0 1 1 * 2024')).toBe(false);  // At 12:00 AM, on day 1 of the month, only in January, only in 2024
    });

    it('should reject cron expression with aliases', () => {
        expect(validateCronExpression('@hourly')).toBe(false);
        expect(validateCronExpression('@daily')).toBe(false);
        expect(validateCronExpression('@weekly')).toBe(false);
        expect(validateCronExpression('@monthly')).toBe(false);
        expect(validateCronExpression('@yearly')).toBe(false);
        expect(validateCronExpression('@reboot')).toBe(false);
    });

    it('should reject cron expressions with blank day field', () => {
        expect(validateCronExpression('0 9 15 * ?')).toBe(false);  // At 09:00 AM, on day 15 of the month
    });

    it('should reject cron expressions with last day of month', () => {
        expect(validateCronExpression('0 9 L * *')).toBe(false);     // Last day of month
        expect(validateCronExpression('0 9 L-2 * *')).toBe(false);   // 2nd to last day
        expect(validateCronExpression('0 9 L-5 * *')).toBe(false);   // 5th to last day
    });

    it('should reject cron expressions with last day of week', () => {
        expect(validateCronExpression('0 9 * * 5L')).toBe(false);    // Last Friday
        expect(validateCronExpression('0 9 * * 1L')).toBe(false);    // Last Monday
        expect(validateCronExpression('0 9 * * 0L')).toBe(false);    // Last Sunday
    });

    it('should reject cron expressions with nearest weekday', () => {
        expect(validateCronExpression('0 9 15W * *')).toBe(false);   // Weekday closest to 15th
        expect(validateCronExpression('0 9 1W * *')).toBe(false);    // Weekday closest to 1st
        expect(validateCronExpression('0 9 LW * *')).toBe(false);    // Last weekday of month
    });

    it('should reject cron expressions with nth weekday of month', () => {
        expect(validateCronExpression('0 9 * * 6#3')).toBe(false);   // 3rd Friday
        expect(validateCronExpression('0 9 * * 1#1')).toBe(false);   // 1st Monday
        expect(validateCronExpression('0 9 * * 5#4')).toBe(false);   // 4th Friday
        expect(validateCronExpression('0 9 * * 0#2')).toBe(false);   // 2nd Sunday
    });
});