import { describe, expect, it } from 'vitest';
import { OpenAILegacyModel } from './openai-legacy-model.js';

describe('OpenAILegacyModel', () => {
    it('should initialize with default model', () => {
        const model = new OpenAILegacyModel();
        expect(model.contextLength).toBe(128000);
        expect(model.model).toBeTruthy();
    });

    it('should initialize with custom model', () => {
        const customModel = 'gpt-4o-mini';
        const model = new OpenAILegacyModel(customModel);
        expect(model.model).toBe(customModel);
    });

    it('should use environment variable for model when not specified', () => {
        const originalEnv = process.env.OPENAI_MODEL_LEGACY;
        process.env.OPENAI_MODEL_LEGACY = 'gpt-4-turbo';

        const model = new OpenAILegacyModel();
        expect(model.model).toBe('gpt-4-turbo');

        if (originalEnv) {
            process.env.OPENAI_MODEL_LEGACY = originalEnv;
        } else {
            delete process.env.OPENAI_MODEL_LEGACY;
        }
    });
});
