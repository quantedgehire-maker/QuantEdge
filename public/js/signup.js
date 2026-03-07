// OTP flow
let currentIdentifier = null;
let currentName = '';

document.getElementById('sendOtpBtn').addEventListener('click', async () => {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const mobile = document.getElementById('mobile').value.trim();

    if (!name) {
        alert('Please enter your name');
        return;
    }
    if (!email && !mobile) {
        alert('Please provide either email or mobile');
        return;
    }

    currentName = name;
    const identifier = email || mobile;
    currentIdentifier = identifier;

    document.getElementById('loading-overlay').style.display = 'flex';
    try {
        const res = await fetch('/api/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, mobile })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
            document.getElementById('otpIdentifier').textContent = identifier;
        } else {
            alert('Failed to send OTP: ' + data.error);
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
        const res = await fetch('/api/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: currentIdentifier, otp })
        });
        const data = await res.json();
        if (data.success) {
            // OTP verified, now sign up the user
            const signupRes = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: currentName,
                    email: currentIdentifier.includes('@') ? currentIdentifier : '',
                    mobile: currentIdentifier.includes('@') ? '' : currentIdentifier
                })
            });
            const signupData = await signupRes.json();
            if (signupData.success) {
                // Store email in session for later steps
                sessionStorage.setItem('candidateEmail', currentIdentifier);
                document.getElementById('step2').style.display = 'none';
                document.getElementById('step3').style.display = 'block';
                setTimeout(() => {
                    window.location.href = '/resume-upload.html'; // next step
                }, 2000);
            } else {
                alert('Signup failed: ' + signupData.error);
            }
        } else {
            alert('Invalid OTP');
        }
    } catch (err) {
        alert('Network error');
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
});

document.getElementById('resendOtp').addEventListener('click', async (e) => {
    e.preventDefault();
    document.getElementById('sendOtpBtn').click();
});