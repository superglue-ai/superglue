import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root .env file
const rootDir = join(__dirname, '..', '..');
config({ path: join(rootDir, '.env') });

const GRAPHQL_PORT = process.env.GRAPHQL_PORT || 3000;
const GRAPHQL_ENDPOINT = `http://localhost:${GRAPHQL_PORT}`;
const MAX_WAIT_TIME = 60000; // 60 seconds
const CHECK_INTERVAL = 500; // 500ms

let serverProcess = null;

function log(message) {
  console.log(`[SDK Test] ${message}`);
}

async function checkServerHealth() {
  return new Promise((resolve) => {
    // Try to connect to the GraphQL endpoint
    const req = http.get(`${GRAPHQL_ENDPOINT}/`, (res) => {
      // Any response (even errors) means the server is responding
      resolve(res.statusCode >= 200 && res.statusCode < 600);
      res.resume(); // Consume response data
    });
    
    req.on('error', (err) => {
      // ECONNREFUSED means server not ready yet
      resolve(false);
    });
    
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer() {
  log('Performing health check...');
  
  // Give the server a moment to fully initialize after the ready message
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Try a quick health check
  const isHealthy = await checkServerHealth();
  
  if (isHealthy) {
    log('✓ Server health check passed!');
    return true;
  }
  
  // If health check failed, wait a bit longer and try once more
  log('First health check failed, waiting 2 more seconds...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const isHealthyRetry = await checkServerHealth();
  if (isHealthyRetry) {
    log('✓ Server health check passed on retry!');
    return true;
  }
  
  // Server output said ready, so proceed anyway
  log('⚠ Health check failed but server logs indicate ready - proceeding...');
  return true;
}

function startServer() {
  return new Promise((resolve, reject) => {
    log('Starting GraphQL server...');
    
    const coreDir = join(__dirname, '..', '..', 'packages', 'core');
    
    let serverReady = false;
    
    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: coreDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true, // Create new process group for better cleanup
      env: { ...process.env }
    });
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      // Check for server ready messages
      if (output.includes('GraphQL server ready') || output.includes('Server running on port')) {
        if (!serverReady) {
          serverReady = true;
          log('Server output indicates ready state');
          resolve();
        }
      }
      // Only log important server messages
      if (output.includes('server') || output.includes('Server') || output.includes('ready')) {
        console.log(`[Server] ${output.trim()}`);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      // Also check stderr for ready messages (pino sometimes logs there)
      if (output.includes('GraphQL server ready') || output.includes('Server running on port')) {
        if (!serverReady) {
          serverReady = true;
          log('Server output indicates ready state');
          resolve();
        }
      }
      // Don't spam console with all stderr
      if (output.includes('ERROR') || output.includes('Error')) {
        console.error(`[Server Error] ${output.trim()}`);
      }
    });
    
    serverProcess.on('error', (error) => {
      reject(new Error(`Failed to start server: ${error.message}`));
    });
    
    serverProcess.on('exit', (code) => {
      if (code !== null && code !== 0 && code !== 130) {
        console.error(`[Server] Exited with code ${code}`);
      }
    });
    
    // Fallback: if we don't detect ready message, try after timeout
    setTimeout(() => {
      if (!serverReady) {
        log('Timeout waiting for server ready message, proceeding anyway...');
        resolve();
      }
    }, 5000);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }
    
    log('Stopping server...');
    
    const timeout = setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        log('Force killing server...');
        try {
          // Kill entire process group
          process.kill(-serverProcess.pid, 'SIGKILL');
        } catch (e) {
          serverProcess.kill('SIGKILL');
        }
      }
      resolve();
    }, 3000);
    
    serverProcess.on('exit', () => {
      clearTimeout(timeout);
      log('Server stopped');
      serverProcess = null;
      resolve();
    });
    
    // Try graceful shutdown first
    try {
      // Kill entire process group
      process.kill(-serverProcess.pid, 'SIGTERM');
    } catch (e) {
      serverProcess.kill('SIGTERM');
    }
  });
}

async function runTests() {
  return new Promise((resolve, reject) => {
    log('Running SDK tests...');
    console.log(''); // Empty line for better readability
    
    let stdout = '';
    let stderr = '';
    
    const testProcess = spawn('npm', ['test'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, GRAPHQL_ENDPOINT }
    });
    
    testProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output); // Show in real-time
    });
    
    testProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output); // Show in real-time
    });
    
    testProcess.on('exit', (code) => {
      console.log(''); // Empty line after test output
      
      if (code === 0) {
        resolve();
      } else {
        let errorMsg = `Tests failed with exit code ${code}`;
        if (stderr) {
          errorMsg += `\n\nError output:\n${stderr}`;
        }
        if (stdout && !stdout.includes('Step')) {
          errorMsg += `\n\nStdout:\n${stdout}`;
        }
        reject(new Error(errorMsg));
      }
    });
    
    testProcess.on('error', (error) => {
      reject(new Error(`Failed to run tests: ${error.message}`));
    });
  });
}

async function main() {
  let exitCode = 0;
  
  try {
    log('='.repeat(60));
    log('SDK Integration Test Runner');
    log('='.repeat(60));
    
    // Start the server
    await startServer();
    
    // Wait for it to be ready
    await waitForServer();
    
    log('='.repeat(60));
    // Run the tests
    await runTests();
  } catch (error) {
    exitCode = 1;
  } finally {
    // Always stop the server
    await stopServer();
    process.exit(exitCode);
  }
}

// Handle Ctrl+C
process.on('SIGINT', async () => {
  log('Received SIGINT, cleaning up...');
  await stopServer();
  process.exit(130);
});

process.on('SIGTERM', async () => {
  log('Received SIGTERM, cleaning up...');
  await stopServer();
  process.exit(143);
});

main();

