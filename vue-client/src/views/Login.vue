<template>
  <div class="login-page">
    <!-- Draggable top bar -->
    <div class="top-drag-bar"></div>

    <div class="close-button" @click="closeWindow"></div>
    <div class="minimize-button" @click="minimizeWindow"></div>
    <div class="settings-button"></div>

    <div class="logo-area">
      <!-- Logo or banner can go here -->
    </div>

    <div class="login-form">
      <div class="avatar-section">
        <img src="../assets/logo.png" alt="Avatar" class="avatar">
      </div>
      <div class="input-section">
        <div class="input-wrapper">
          <input type="text" v-model="username" placeholder="QQ号码/手机/邮箱">
          <a href="#" @click="openRegister" class="link-right">注册帐号</a>
        </div>
        <div class="input-wrapper">
          <input type="password" v-model="password" placeholder="密码">
          <a href="#" class="link-right">找回密码</a>
        </div>
      </div>
    </div>

    <div class="options-section">
      <div class="checkbox-wrapper">
        <input type="checkbox" id="auto-login" v-model="autoLogin">
        <label for="auto-login">自动登录</label>
      </div>
      <div class="checkbox-wrapper">
        <input type="checkbox" id="remember-password" v-model="rememberPassword">
        <label for="remember-password">记住密码</label>
      </div>
      <div class="status-selector">
        <i class="fas fa-user-circle"></i>
        <span>{{ status }}</span>
        <i class="fas fa-chevron-down"></i>
      </div>
    </div>

    <div class="footer-section">
      <button @click="login" class="login-button">登    录</button>
    </div>
    
    <div id="error-message" class="error-message" v-show="errorMessage">{{ errorMessage }}</div>

    <div class="bottom-links">
      <a href="#">安全模式</a>
      <span>|</span>
      <a href="#">高级设置</a>
    </div>
  </div>
</template>

<script>
import { mapActions } from 'vuex';

export default {
  name: 'LoginView',
  data() {
    return {
      username: '',
      password: '',
      autoLogin: false,
      rememberPassword: false,
      status: '在线',
      errorMessage: ''
    }
  },
  methods: {
    ...mapActions(['login']),
    async handleLogin() {
      this.errorMessage = '';
      if (!this.username || !this.password) {
        this.errorMessage = '请输入账号和密码';
        return;
      }

      try {
        const result = await this.login({ 
          username: this.username, 
          password: this.password 
        });
        
        if (result.success) {
          this.$router.push('/main');
        } else {
          this.errorMessage = result.message || '登录失败';
        }
      } catch (error) {
        this.errorMessage = '登录时发生错误';
        console.error(error);
      }
    },
    openRegister() {
      this.$router.push('/register');
    },
    minimizeWindow() {
      window.electronAPI.minimizeWindow();
    },
    closeWindow() {
      window.electronAPI.closeWindow();
    }
  }
}
</script>

<style scoped>
@import '../styles/pages/login.css';

/* 可以在这里添加组件特定的样式 */
.error-message {
  display: block;
}
</style> 