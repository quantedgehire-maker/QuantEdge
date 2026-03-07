let timeLeft = 15 * 60;
const timerElement = document.getElementById('timer');
function updateTimer() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerElement.textContent = `Time left: ${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
    if (timeLeft <= 0) { clearInterval(timerInterval); alert('Time is up! Submitting.'); document.getElementById('testForm').dispatchEvent(new Event('submit')); }
    timeLeft--;
}
const timerInterval = setInterval(updateTimer, 1000);
updateTimer();
