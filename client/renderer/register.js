document.addEventListener('DOMContentLoaded', () => {
    const nicknameInput = document.getElementById('nickname');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const registerBtn = document.getElementById('register-btn');
    const errorDiv = document.getElementById('error-message');
    
    document.getElementById('close-btn').addEventListener('click', () => window.electronAPI.closeRegisterWindow());
    
    registerBtn.addEventListener('click', async () => {
        const nickname = nicknameInput.value;
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!nickname || !password || !confirmPassword) {
            errorDiv.textContent = '所有字段都不能为空。';
            errorDiv.style.display = 'block';
            return;
        }

        if (password !== confirmPassword) {
            errorDiv.textContent = '两次输入的密码不一致。';
            errorDiv.style.display = 'block';
            return;
        }

        errorDiv.style.display = 'none';

        const result = await window.electronAPI.register(nickname, password);

        if (result.success) {
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('new-qq-number').textContent = result.qq;
            document.getElementById('success-message').style.display = 'block';
            document.getElementById('close-success-btn').addEventListener('click', () => window.electronAPI.closeRegisterWindow());
        } else {
            errorDiv.textContent = result.message;
            errorDiv.style.display = 'block';
        }
    });
}); 