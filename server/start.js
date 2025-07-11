/**
 * 服务端启动脚本
 * 用于简化启动命令，只需执行 node start.js 即可启动服务端
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('正在启动 OICQ 服务端...');

// 启动 Express 服务器
const serverProcess = spawn('node', ['index.js'], {
  stdio: 'inherit'
});

serverProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`服务端进程异常退出，退出码: ${code}`);
    process.exit(code);
  }
  console.log('OICQ 服务端已关闭');
}); 