import { ApiConfig as StepConfig, RequestOptions } from "@superglue/client";


export interface StepExecutionResult {
    success: boolean;
    data: any;
    error?: string;
}

export interface StepExecutionInput {
    stepConfig: StepConfig;
    stepInputData: any;
    credentials: Record<string, any>;
    requestOptions?: RequestOptions;
}

export interface StepExecutionStrategy {
    /**
     * The version of the strategy
     */
    readonly version: string;

    /**
     * Detect if this strategy should execute the given step config
     * @param stepConfig The step config to test
     * @returns true if this strategy should execute the step config
     */
    shouldExecute(stepConfig: StepConfig): Promise<boolean> | boolean;

    /**
     * Execute the given step config
     * @param stepConfig The step config to execute
     * @returns the execution result
     */
    executeStep(input: StepExecutionInput): Promise<StepExecutionResult> | StepExecutionResult;
}

export class StepExecutionStrategyRegistry {
    private strategies: StepExecutionStrategy[] = [];

    register(strategy: StepExecutionStrategy): void {
        this.strategies.push(strategy);
    }

    getStrategies(): StepExecutionStrategy[] {
        return [...this.strategies];
    }

    async routeAndExecute(input: StepExecutionInput): Promise<StepExecutionResult> {
        for (const strategy of this.strategies) {
            if (await strategy.shouldExecute(input.stepConfig)) {
                return await strategy.executeStep(input);
            }
        }
        return {
            success: false,
            data: {},
            error: 'No strategy found to execute the step'
        };
    }
}
