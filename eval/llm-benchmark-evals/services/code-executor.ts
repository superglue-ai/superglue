const TIMEOUT_MS = 120000;
const MAX_RESULT_SIZE = 100000;

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class CodeExecutor {
  async execute(code: string, payload: any): Promise<ExecutionResult> {
    const wrappedCode = `
      (async function() {
        const payload = ${JSON.stringify(payload)};
        ${code}
      })()
    `;

    try {
      // biome-ignore lint/security/noGlobalEval: intentionally executing LLM-generated code for evaluation
      const evalResult = eval(wrappedCode);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Code execution timed out after ${TIMEOUT_MS / 1000} seconds`)),
          TIMEOUT_MS,
        );
      });

      const result = await Promise.race([evalResult, timeoutPromise]);

      return {
        success: true,
        data: this.truncateResult(result),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private truncateResult(result: any): any {
    const resultStr = JSON.stringify(result);
    if (resultStr.length > MAX_RESULT_SIZE) {
      return {
        truncated: true,
        preview: resultStr.substring(0, 1000),
        message: "Result truncated due to size",
      };
    }
    return result;
  }
}
