import { CronExpressionParser } from "cron-parser";
import cronValidate from "cron-validate";

export function calculateNextRun(cronExpression: string, timezone: string, from?: Date): Date {
  // calculates the next run using the cron expression and timezone and returns the date in utc
  const currentDate = from || new Date(Date.now()); // Use provided date or current UTC time
  const parsed = CronExpressionParser.parse(cronExpression, {
    currentDate,
    tz: timezone,
  });

  // cron-parser returns dates in the specified timezone, so we need to convert to UTC
  const nextRunInTimezone = parsed.next().toDate();

  // Convert to UTC by using the ISO string representation
  return new Date(nextRunInTimezone.toISOString());
}

export function validateCronExpression(cronExpression: string): boolean {
  try {
    const result = cronValidate(cronExpression, {
      preset: "default",
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
  } catch {
    return false;
  }
}
