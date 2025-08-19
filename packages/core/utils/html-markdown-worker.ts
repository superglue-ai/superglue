import { NodeHtmlMarkdown } from 'node-html-markdown';
import { parentPort } from 'worker_threads';

if (!parentPort) {
    throw new Error('This file must be run as a worker thread');
}

parentPort.on('message', ({ html, taskId }: { html: string; taskId: string }) => {
    try {
        const markdown = NodeHtmlMarkdown.translate(html);
        parentPort.postMessage({ taskId, success: true, markdown });
    } catch (error) {
        parentPort.postMessage({
            taskId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

