# Workflow Component

The Workflow Component enables chaining multiple API calls together to achieve complex data transformations and retrieval patterns. It orchestrates a sequence of API operations where the output of one step can feed into subsequent steps, allowing data to flow through a defined pipeline.

## Architecture Overview

```mermaid
graph TD
    Client[Client Application] --> ApiWorkflowOrchestrator
    
    subgraph "Workflow Core"
        ApiWorkflowOrchestrator --> WorkflowExecutionStrategy
        WorkflowExecutionStrategy --> DirectStrategy
        WorkflowExecutionStrategy --> LoopStrategy
        ApiWorkflowOrchestrator --> WorkflowUtils
        WorkflowUtils --> DataExtractor
    end
    
    subgraph "External Services"
        DirectStrategy --> ApiCall
        LoopStrategy --> ApiCall
        ApiCall --> ExternalAPI[External API Service]
    end
    
    style ApiWorkflowOrchestrator fill:#f9f,stroke:#333,stroke-width:2px
    style WorkflowExecutionStrategy fill:#bbf,stroke:#333,stroke-width:2px
    style ExternalAPI fill:#bfb,stroke:#333,stroke-width:2px
```

## Workflow Execution Flow

```mermaid
sequenceDiagram
    participant Client
    participant Orchestrator as ApiWorkflowOrchestrator
    participant Strategy as WorkflowExecutionStrategy
    participant Utils as WorkflowUtils
    participant API as External API
    
    Client->>Orchestrator: executeWorkflow(workflow)
    Orchestrator->>Orchestrator: registerExecutionPlan()
    Orchestrator->>Orchestrator: validateExecutionPlan()
    
    loop For each step
        Orchestrator->>Orchestrator: prepareStepInput()
        Orchestrator->>Orchestrator: processTemplatedStep()
        Orchestrator->>Strategy: executeWorkflowStep()
        
        alt Direct Execution
            Strategy->>Utils: prepareApiConfig()
            Strategy->>Utils: executeApiCall()
            Utils->>API: API Request
            API-->>Utils: API Response
            Utils->>Strategy: Return Response
            Strategy->>Utils: processStepResult()
            Utils->>Strategy: Processed Data
            Strategy->>Orchestrator: Return Result
        else Loop Execution
            Strategy->>Strategy: findLoopVariable()
            Strategy->>Strategy: getLoopValues()
            loop For each value
                Strategy->>Utils: prepareApiConfig()
                Strategy->>Utils: executeApiCall()
                Utils->>API: API Request
                API-->>Utils: API Response
                Utils->>Strategy: Return Response
            end
            Strategy->>Utils: processStepResult()
            Utils->>Strategy: Processed Data
            Strategy->>Orchestrator: Return Results Array
        end
        
        Orchestrator->>Utils: storeStepResult()
    end
    
    alt Final Transform
        Orchestrator->>Orchestrator: Apply finalTransform
    end
    
    Orchestrator-->>Client: Return WorkflowResult
```

## Dog API Example (based on simple-dog.test.ts)

```mermaid
graph LR
    Client[Test Client] --> |1. Register Plan| Orchestrator[ApiWorkflowOrchestrator]
    Orchestrator --> |2. Execute Plan| ExecutionEngine[Workflow Engine]
    
    subgraph "Execution Plan"
        Step1[Step: getAllBreeds] --> |Breed List| Step2[Step: getBreedImage]
        Step2 --> |Process 5 Random Breeds| FinalTransform[Final Transform]
    end
    
    ExecutionEngine --> |3. Execute Step 1| DogAPI1[Dog API: /breeds/list/all]
    DogAPI1 --> |List of All Breeds| Step1
    
    ExecutionEngine --> |4. Loop Through Breeds| DogAPI2[Dog API: /breed/$BREED/images/random]
    DogAPI2 --> |Random Images| Step2
    
    FinalTransform --> |5. Format Results| Result[Final Result: Breeds with Images]
    
    Result --> Client
    
    style Orchestrator fill:#f9f,stroke:#333,stroke-width:2px
    style ExecutionEngine fill:#bbf,stroke:#333,stroke-width:2px
    style DogAPI1 fill:#bfb,stroke:#333,stroke-width:2px
    style DogAPI2 fill:#bfb,stroke:#333,stroke-width:2px
```

## Data Flow in Dog API Example

```mermaid
flowchart TD
    A[Start] --> B[Register Execution Plan]
    B --> D[Execute getAllBreeds Step]
    D --> E[Get All Dog Breeds]
    E --> F[Process Response with Step Mapping]
    F --> G[Execute getBreedImage Step in LOOP mode]
    
    G --> |breed1| H1[Fetch Random Image]
    G --> |breed2| H2[Fetch Random Image]
    G --> |breed3| H3[Fetch Random Image]
    G --> |breed4| H4[Fetch Random Image]
    G --> |breed5| H5[Fetch Random Image]
    
    H1 --> I[Collect All Results]
    H2 --> I
    H3 --> I
    H4 --> I
    H5 --> I
    
    I --> J[Apply Final Transform]
    J --> K[Return Final Result]
    
    style G fill:#bbf,stroke:#333,stroke-width:2px
    style J fill:#f9f,stroke:#333,stroke-width:2px
```

## Key Components

### ApiWorkflowOrchestrator

The main entry point for workflow execution that:
- Manages execution plans
- Validates workflow definitions
- Coordinates step execution
- Applies final transformations
- Handles error states

### Execution Strategies

#### DirectStrategy
- Executes a single API call for a step
- Resolves template variables from previous steps
- Processes and stores results

#### LoopStrategy
- Identifies loop variables and their sources
- Executes the same API call for each value in an array
- Manages collection of results from multiple iterations
- Supports limits on loop iterations

### DataExtractor
- Extracts data from complex objects using JSONata expressions
- Finds values by key in nested data structures
- Handles array transformations

### WorkflowUtils
- Processes template strings ({variable})
- Executes API calls
- Transforms API responses using step mappings
- Stores step results in the workflow context

## Workflow Definition Structure

```typescript
interface ExecutionPlan {
  id: string;
  apiHost: string;
  steps: ExecutionStep[];
  finalTransform?: string; // JSONata expression
}

interface ExecutionStep {
  id: string;
  apiConfig: ApiConfig;
  executionMode: "DIRECT" | "LOOP";
  
  // Optional configurations
  outputIsArray?: boolean;
  loopVariable?: string;
  loopMaxIters?: number;
  responseField?: string;
  objectKeysAsArray?: boolean;
  
  inputMapping: string; // JSONata expression, defaults to "$"
  responseMapping: string; // JSONata expression, defaults to "$"
}
```

## Example Usage

```typescript
// Define a workflow execution plan
const executionPlan = {
  id: "dog-workflow",
  apiHost: "https://dog.ceo/api",
  steps: [
    {
      id: "getAllBreeds",
      apiConfig: {
        id: "getAllBreeds_config",
        urlHost: "https://dog.ceo/api",
        urlPath: "/breeds/list/all",
        instruction: "Get all dog breeds",
        method: "GET"
      },
      executionMode: "DIRECT",
      responseField: "message",
      objectKeysAsArray: true,
      inputMapping: "$",
      responseMapping: "$"
    },
    {
      id: "getBreedImage",
      apiConfig: {
        id: "getBreedImage_config",
        urlHost: "https://dog.ceo/api",
        urlPath: "/breed/{breed}/images/random",
        instruction: "Get a random image for a specific dog breed",
        method: "GET"
      },
      executionMode: "LOOP",
      loopVariable: "breed",
      loopMaxIters: 5,
      inputMapping: "$",
      responseMapping: "$"
    }
  ],
  finalTransform: `{
    "breeds": $map(
      $filter(
        $keys($.getAllBreeds.message),
        function($b) {
          $count($.getBreedImage[$split(message, "/")[4] = $b]) > 0
        }
      ),
      function($b) {
        {
          $b: $.getBreedImage[$split(message, "/")[4] = $b].message[0]
        }
      }
    )
  }`
};

// Execute the workflow
const orchestrator = new ApiWorkflowOrchestrator(baseApiInput);
const planId = await orchestrator.registerExecutionPlan(executionPlan);
const result = await orchestrator.executeWorkflowPlan(planId, payload, credentials);
```
