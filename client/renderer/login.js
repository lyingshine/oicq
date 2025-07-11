document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('qq-number');
    const passwordInput = document.getElementById('qq-password');
    const errorMessageDiv = document.getElementById('error-message');
    const rememberPasswordCheckbox = document.getElementById('remember-password');
    const autoLoginCheckbox = document.getElementById('auto-login');

    const rememberedUser = localStorage.getItem('rememberedUser');
    if (rememberedUser) {
        try {
            const userData = JSON.parse(rememberedUser);
            if (userData && userData.username && userData.password) {
                usernameInput.value = userData.username;
                passwordInput.value = userData.password;
                rememberPasswordCheckbox.checked = true;
                
                let hasAutoLogin = localStorage.getItem('hasAutoLogin');
                if (userData.autoLogin && !hasAutoLogin) {
                    autoLoginCheckbox.checked = true;
                    localStorage.setItem('hasAutoLogin', 'true');
                    console.log('执行自动登录');
                    setTimeout(() => loginBtn.click(), 100);
                }
            }
        } catch (error) {
            console.error('解析记住的用户信息失败:', error);
            localStorage.removeItem('rememberedUser');
        }
    }
    
    window.addEventListener('beforeunload', () => {
        localStorage.removeItem('hasAutoLogin');
    });

    window.electronAPI.onLoginFailed((message) => {
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
    });

    document.getElementById('open-register-link').addEventListener('click', (event) => {
        event.preventDefault();
        window.electronAPI.openRegisterWindow();
    });

    document.getElementById('close-btn').addEventListener('click', () => window.electronAPI.closeWindow());
    document.getElementById('minimize-btn').addEventListener('click', () => window.electronAPI.minimizeWindow());

    loginBtn.addEventListener('click', async () => {
        const username = usernameInput.value;
        const password = passwordInput.value;

        if (!username || !password) {
            errorMessageDiv.textContent = '请输入QQ号码和密码。';
            errorMessageDiv.style.display = 'block';
            return;
        }

        errorMessageDiv.style.display = 'none';

        if (rememberPasswordCheckbox.checked) {
            const user = {
                username: usernameInput.value,
                password: passwordInput.value,
                autoLogin: autoLoginCheckbox.checked
            };
            localStorage.setItem('rememberedUser', JSON.stringify(user));
        } else {
            localStorage.removeItem('rememberedUser');
        }

        window.electronAPI.login(username, password);
    });
}); 