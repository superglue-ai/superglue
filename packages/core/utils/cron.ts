import { CronExpressionParser } from 'cron-parser';
import cronValidate from 'cron-validate';

export function calculateNextRun(cronExpression: string, from?: Date): Date {
    const parsed = CronExpressionParser.parse(cronExpression, {
        currentDate: from,
        tz: 'UTC',
    });

    return parsed.next().toDate();
}

export function validateCronExpression(cronExpression: string): boolean {
    const result = cronValidate(cronExpression, {
        preset: 'default',
        override: {
            useSeconds: false,
            useYears: false,
            useAliases: false,
            allowStepping: true,
            useLastDayOfMonth: false,
            useLastDayOfWeek: false,
            useNearestWeekday: false,
            useOnlyLastDayOfMonth: false,
        },
    });

    return result.isValid();
}
