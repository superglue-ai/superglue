# Workflow README

This module provides a workflow orchestration system for executing multi-step API workflows.

## High-Level Overview

```mermaid
flowchart TD
    Client[Client Application] -->|Executes| Workflow[Workflow Orchestration]
    Workflow -->|Contains| Domain[Domain Model]
    Workflow -->|Uses| Execution[Execution Strategies]
    Workflow -->|Calls| External[External APIs]
    
    subgraph Domain[Domain Model]
        Types[workflow.types.ts]
        Interface[workflowOrchestrator.ts]
    end
    
    subgraph Execution[Execution Strategies]
        Strategies[workflowExecutionStrategy.ts]
        Utils[workflowUtils.ts]
        DataEx[dataExtractor.ts]
    end
    
    subgraph Workflow[Workflow Orchestration]
        Orchestrator[apiWorkflowOrchestrator.ts]
    end
```

## Core Components

```mermaid
classDiagram
    class WorkflowOrchestrator {
        <<interface>>
        +retrieveApiDocumentation()
        +registerExecutionPlan()
        +setStepMapping()
        +executeWorkflow()
        +executeWorkflowPlan()
    }
    
    class ApiWorkflowOrchestrator {
        -apiDocumentation
        -executionPlans
        -stepMappings
        -baseApiInput
        +setBaseApiInput()
        +getBaseApiInput()
        +getApiDocumentation()
        +getExecutionPlans()
        +executeWorkflow()
        +registerExecutionPlan()
        +retrieveApiDocumentation()
        +setStepMapping()
        +executeWorkflowPlan()
        -prepareStepInput()
        -processTemplatedStep()
        -processStepResult()
    }
    
    class WorkflowExecutionStrategy {
        <<abstract>>
        #step
        #stepMapping
        #executionPlan
        #result
        #apiDocumentation
        #baseApiInput
        +execute()*
        #executeApiCall()
        #extractTemplateVariables()
        #processStepResult()
        #storeStepResult()
    }
    
    class DirectExecutionStrategy {
        +execute()
    }
    
    class LoopExecutionStrategy {
        -stepAnalysis
        +execute()
        -findLoopVariable()
        -getLoopValues()
    }
    
    class ExecutionStrategyFactory {
        +createStrategy()
    }
    
    class DataExtractor {
        -data
        +findValue()
        +extractValues()
        -searchNestedObjects()
    }
    
    WorkflowOrchestrator <|.. ApiWorkflowOrchestrator
    WorkflowExecutionStrategy <|-- DirectExecutionStrategy
    WorkflowExecutionStrategy <|-- LoopExecutionStrategy
    ApiWorkflowOrchestrator --> ExecutionStrategyFactory
    ExecutionStrategyFactory --> WorkflowExecutionStrategy
    LoopExecutionStrategy --> DataExtractor
```

## Workflow Architecture

```mermaid
flowchart TD
    A[Client] -->|1. Initialize| B[ApiWorkflowOrchestrator]
    B -->|2. Register Execution Plan| C[Execution Plan]
    B -->|Optional: Retrieve API Documentation| D[API Documentation]
    C -->|Contains| E[Steps with Dependencies]
    B -->|3. Set Step Mappings| F[Step Mappings]
    A -->|4. Execute Workflow| B
    B -->|5. Process Steps| G[Step Execution]
    G -->|For Each Step| H{Check Dependencies}
    H -->|Dependencies Met| I[Prepare Step Input]
    I -->|Template Variables?| J{Has Template Vars?}
    J -->|Yes| K[Process Templated Step]
    J -->|No| L[Standard Execution]
    K -->|Choose Strategy| M{Execution Mode}
    M -->|DIRECT| N[Direct Execution]
    M -->|LOOP| O[Loop Execution]
    M -->|CONDITION| P[Conditional Execution]
    N -->|Execute API Call| Q[API Response]
    O -->|Execute API Call| Q
    P -->|Execute API Call| Q
    L -->|Execute API Call| Q
    Q -->|Process Result| R[Store Step Result]
    R --> S{More Steps?}
    S -->|Yes| G
    S -->|No| T[Apply Final Transform]
    T --> U[Return Workflow Result]
```

## Templated Step Processing

```mermaid
flowchart LR
    A[Template Variables in Endpoint] -->|Extract| B[Analyze Variable Mappings]
    B -->|Use Execution Mode| C[Create Strategy]
    C -->|DIRECT| D[DirectExecutionStrategy]
    C -->|LOOP| E[LoopExecutionStrategy]
    E -->|Find Loop Variable| F[Find Values to Loop Over]
    F -->|For Each Value| G[Execute API Call]
    D -->|Single Execution| G
    G -->|Process Response| H[Store Results]
```

## Execution Flow

1. **Initialize the Orchestrator**: Create an instance with base API configuration
2. **Register Execution Plan**: Define steps, dependencies, and transforms
3. **Set Step Mappings**: Configure input/output mappings for each step
4. **Execute Workflow**: Run the workflow with input payload and credentials
5. **Process Steps**: For each step:
   - Check dependencies are met
   - Prepare input based on mappings and prior steps
   - Process templated variables if present
   - Execute using appropriate strategy (DIRECT, LOOP, CONDITION)
   - Store step results for subsequent steps
6. **Apply Final Transform**: Process all step results into final output format
7. **Return Result**: Provide complete workflow results

## Example: Dog API Workflow

The `simple-dog.test.ts` demonstrates a workflow with the Dog API:

```mermaid
flowchart TD
    A[Initialize Orchestrator] -->|With Dog API config| B[Register Execution Plan]
    B -->|Define Steps| C[Step: getAllBreeds]
    B -->|Define Steps| D[Step: getBreedImage]
    B -->|Set Step Mappings| E[Configure Input/Output Mappings]
    E -->|For getAllBreeds| F[Identity Mapping]
    E -->|For getBreedImage| G[Identity Mapping + Loop]
    C --> H[Execute getAllBreeds]
    H -->|DIRECT Mode| I[Get All Breeds List]
    I -->|Returns list of breeds| J[Execute getBreedImage]
    J -->|LOOP Mode| K[Iterate Through Breeds]
    K -->|For each breed| L[Get Random Image]
    L -->|Collect results| M[Apply Final Transform]
    M -->|Format as breeds array| N[Return Result]
```

### Execution Mode Strategies

- **DIRECT**: Simple one-time execution of the API call
- **LOOP**: Executes the step multiple times, iterating over a collection
- **CONDITION**: Executes the step only if a condition is met

### Variable Mapping

Template variables in endpoints (like `${breed}`) are automatically matched with:
1. Values from dependent step results
2. Values from the original payload
3. Custom mappings defined in the step configuration

The orchestrator analyzes the variables to determine the best mapping strategy for each step's execution mode.
