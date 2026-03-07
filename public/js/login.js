let currentIdentifier = '';

document.getElementById('sendOtpBtn').addEventListener('click', async () => {
    const identifier = document.getElementById('identifier').value.trim();
    if (!identifier) {
        alert('Please enter email or mobile');
        return;
    }
    
    currentIdentifier = identifier;
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        const res = await fetch('/api/send-login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
            document.getElementById('otpIdentifier').textContent = identifier;
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error');
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
});

document.getElementById('verifyOtpBtn').addEventListener('click', async () => {
    const otp = document.getElementById('otp').value.trim();
    if (!otp || otp.length !== 6) {
        alert('Enter 6-digit OTP');
        return;
    }
    
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        const res = await fetch('/api/verify-login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: currentIdentifier, otp })
        });
        const data = await res.json();
        if (data.success) {
            // Store user info in sessionStorage
            sessionStorage.setItem('userEmail', data.user.email || data.user.mobile);
            sessionStorage.setItem('userName', data.user.name);
            window.location.href = '/dashboard.html';
        } else {
            alert('Invalid OTP: ' + data.error);
        }
    } catch (err) {
        alert('Network error');
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
});

document.getElementById('resendOtp').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('sendOtpBtn').click();
});