#!/usr/bin/env node

const FtpSrv = require('ftp-srv');
const path = require('path');
const { Readable } = require('stream');

const PORT = 2121;
const HOST = '127.0.0.1';
const USERNAME = 'testuser';
const PASSWORD = 'testpass';

const ftpServer = new FtpSrv({
  url: `ftp://${HOST}:${PORT}`,
  pasv_url: HOST,
  pasv_min: 1024,
  pasv_max: 1048,
  greeting: 'Welcome to Superglue FTP Test Server',
  anonymous: false
});

ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
  if (username === USERNAME && password === PASSWORD) {
    console.log(`✓ User authenticated: ${username}`);
    
    const rootPath = __dirname;
    console.log(`✓ Serving files from: ${rootPath}`);
    
    resolve({ root: rootPath });
  } else {
    console.log(`✗ Authentication failed for user: ${username}`);
    reject(new Error('Invalid username or password'));
  }
});

ftpServer.on('client-error', ({ connection, context, error }) => {
  console.error('Client error:', error.message);
});

ftpServer.listen().then(() => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   FTP Test Server Running                      ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nURL:      ftp://${USERNAME}:${PASSWORD}@${HOST}:${PORT}/`);
  console.log(`Host:     ${HOST}`);
  console.log(`Port:     ${PORT}`);
  console.log(`Username: ${USERNAME}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Root:     ${__dirname}`);
  console.log('\nPress Ctrl+C to stop the server\n');
}).catch(err => {
  console.error('Failed to start FTP server:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\nShutting down FTP server...');
  ftpServer.close().then(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});

