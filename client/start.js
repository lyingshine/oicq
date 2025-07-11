/**
 * 客户端启动脚本
 * 用于简化启动命令，只需执行 node start.js 即可启动客户端
 */

const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

console.log('正在启动 OICQ 客户端...');

// 启动 Electron 应用
const electronProcess = spawn(electron, ['.'], {
  stdio: 'inherit'
});

electronProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`Electron 进程异常退出，退出码: ${code}`);
    process.exit(code);
  }
  console.log('OICQ 客户端已关闭');
}); 