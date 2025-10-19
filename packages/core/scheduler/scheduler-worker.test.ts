import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStore } from '../datastore/types.js';
import { WorkflowSchedulerWorker } from './scheduler-worker.js';

vi.mock('../graphql/resolvers/workflow.js', () => ({
    executeWorkflowResolver: vi.fn()
}));

const MOCK_NEXT_RUN = new Date('2024-01-02T00:00:00Z');

vi.mock('@superglue/shared', () => ({
    calculateNextRun: vi.fn(() => MOCK_NEXT_RUN)
}));

const mockDatastore = {
    listDueWorkflowSchedules: vi.fn(),
    updateScheduleNextRun: vi.fn()
} as unknown as DataStore;

describe('WorkflowScheduler', () => {
    let scheduler: WorkflowSchedulerWorker;
    
    beforeEach(() => {
        vi.clearAllMocks();
        scheduler = new WorkflowSchedulerWorker(mockDatastore, 100);
    });

    it('should start and stop interval correctly', async () => {
        vi.useFakeTimers();
        
        const mockSchedule = {
            id: 'schedule-1',
            workflowId: 'workflow-1', 
            orgId: 'org-1',
            cronExpression: '0 0 * * *'
        };

        mockDatastore.listDueWorkflowSchedules = vi.fn().mockResolvedValue([mockSchedule]);
        mockDatastore.updateScheduleNextRun = vi.fn().mockResolvedValue(undefined);

        scheduler.start();
        
        await vi.advanceTimersByTimeAsync(250);
        expect(mockDatastore.listDueWorkflowSchedules).toHaveBeenCalledTimes(2);
        
        scheduler.stop();
        await vi.advanceTimersByTimeAsync(250);

        expect(mockDatastore.listDueWorkflowSchedules).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it('should execute due workflows when started', async () => {
        vi.useFakeTimers();
        
        const mockSchedule = {
            id: 'schedule-1',
            workflowId: 'workflow-1',
            orgId: 'org-1',
            cronExpression: '0 0 * * *',
            payload: { test: 'data' },
            options: {}
        };

        mockDatastore.listDueWorkflowSchedules = vi.fn().mockResolvedValue([mockSchedule]);
        mockDatastore.updateScheduleNextRun = vi.fn().mockResolvedValue(undefined);

        const { executeWorkflowResolver } = await import('../graphql/resolvers/workflow.js');
        
        scheduler.start();
        await vi.advanceTimersByTimeAsync(105);

        expect(mockDatastore.listDueWorkflowSchedules).toHaveBeenCalledOnce();
        expect(mockDatastore.updateScheduleNextRun).toHaveBeenCalledWith({
            id: 'schedule-1',
            nextRunAt: MOCK_NEXT_RUN,
            lastRunAt: expect.any(Date)
        });
        expect(executeWorkflowResolver).toHaveBeenCalledWith(
            {},
            {
                input: { id: 'workflow-1' },
                payload: { test: 'data' },
                credentials: {},
                options: {}
            },
            {
                datastore: mockDatastore,
                orgId: 'org-1'
            },
            {}
        );
        
        scheduler.stop();
        vi.useRealTimers();
    });

    it('should handle execution errors gracefully', async () => {
        vi.useFakeTimers();
        
        const mockSchedule = {
            id: 'schedule-1',
            workflowId: 'workflow-1',
            orgId: 'org-1',
            cronExpression: '0 0 * * *'
        };

        mockDatastore.listDueWorkflowSchedules = vi.fn().mockResolvedValue([mockSchedule]);
        const { executeWorkflowResolver } = await import('../graphql/resolvers/workflow.js');
        (executeWorkflowResolver as any).mockRejectedValue(new Error('Execution failed'));

        scheduler.start();
        await vi.advanceTimersByTimeAsync(105);

        expect(executeWorkflowResolver).toHaveBeenCalled();
        
        scheduler.stop();
        vi.useRealTimers();
    });
});
