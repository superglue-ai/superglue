import { CronExpressionParser } from 'cron-parser';
import cronValidate from 'cron-validate';

export function calculateNextRun(cronExpression: string, timezone: string, from?: Date): Date {
    // calculates the next run using the cron expression and timezone and returns the date in utc
    const parsed = CronExpressionParser.parse(cronExpression, {
        currentDate: from,
        tz: timezone,
    });

    // cron-parser already returns UTC dates (even when timezone is specified - only used to inteprete the cron expression)
    return parsed.next().toDate();
}

export function validateCronExpression(cronExpression: string): boolean {
    // todo: fix this before merging!
    const validator = cronValidate.default ? cronValidate.default : cronValidate as any;
    
    const result = validator(cronExpression, {
        preset: 'default',
        override: {
            useSeconds: false,
            useYears: false,
            useAliases: false,
            allowStepping: true,
            useLastDayOfMonth: false,
            useLastDayOfWeek: false,
            useNearestWeekday: false,
        },
    });

    return result.isValid();
}
