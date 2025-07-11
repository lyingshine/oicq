/**
 * 项目总启动脚本
 * 同时启动客户端和服务端
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('正在启动 OICQ 应用...');

// 启动服务端
console.log('正在启动服务端...');
const serverProcess = spawn('node', ['start.js'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, 'server')
});

serverProcess.on('error', (error) => {
  console.error('服务端启动失败:', error);
});

// 给服务端一些启动时间
setTimeout(() => {
  // 启动客户端
  console.log('正在启动客户端...');
  const clientProcess = spawn('node', ['start.js'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, 'client')
  });

  clientProcess.on('error', (error) => {
    console.error('客户端启动失败:', error);
  });

  clientProcess.on('close', (code) => {
    if (code !== 0) {
      console.log(`客户端进程已退出，退出码: ${code}`);
    }
    console.log('客户端已关闭，正在关闭服务端...');
    serverProcess.kill();
  });
}, 2000);

serverProcess.on('close', (code) => {
  if (code !== 0) {
    console.log(`服务端进程已退出，退出码: ${code}`);
  }
  console.log('服务端已关闭');
});

// 处理进程终止信号
process.on('SIGINT', () => {
  console.log('接收到终止信号，正在关闭所有进程...');
  serverProcess.kill();
  process.exit();
}); 