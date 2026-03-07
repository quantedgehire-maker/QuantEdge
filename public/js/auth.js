// // auth.js – Handles login state, navigation protection, user popup with logout & activity
// (function() {
//     const userName = sessionStorage.getItem('userName');
//     const userEmail = sessionStorage.getItem('userEmail');
//     const userMobile = sessionStorage.getItem('userMobile');
//     const isLoggedIn = !!(userName && userEmail);

//     const navLinks = document.querySelector('.nav-links');
//     if (!navLinks) return;

//     const authLi = navLinks.lastElementChild;
//     if (!authLi) return;

//     if (isLoggedIn) {
//         // Replace login/signup button with user initial button + popup
//         const firstLetter = userName.charAt(0).toUpperCase();
//         authLi.innerHTML = `
//            <div class="user-btn-container">
//         <button class="user-btn">${firstLetter}</button>
//         <div class="user-popup" style="display:none;">
//             <p><strong>${userName}</strong></p>
//             <p>Email: ${userEmail}</p>
//             <p>Mobile: ${userMobile || 'N/A'}</p>
//             <hr style="margin: 0.5rem 0;">
//             <p><a href="/my-activity.html" style="color: var(--primary); text-decoration: none;">My Activity</a></p>
//             <p><a href="#" id="logoutLink" style="color: #d32f2f; text-decoration: none;">Logout</a></p>
//             </div>
//     </div>
//         `;

//         const userBtn = document.querySelector('.user-btn');
//         const popup = document.querySelector('.user-popup');
//            const logoutLink = document.getElementById('logoutLink');

//          if (userBtn && popup) {
//         userBtn.addEventListener('click', (e) => {
//             e.stopPropagation();
//             popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
//         });
//         document.addEventListener('click', (e) => {
//             if (!e.target.closest('.user-btn-container')) {
//                 popup.style.display = 'none';
//             }
//         });
//     }

//     if (logoutLink) {
//         logoutLink.addEventListener('click', (e) => {
//             e.preventDefault();
//             sessionStorage.clear();          // Clears all stored user data
//             window.location.href = '/login.html';
//         });
//     }

//         // Activity link is a normal anchor; no extra handler needed
//     } else {
//         // Not logged in: protect all pages except home and login
//         // const currentPath = window.location.pathname;
//         // const isHome = currentPath === '/' || currentPath.endsWith('/index.html') || currentPath === '/index.html';
//         // const isLogin = currentPath.includes('/login.html');
//         // const isMyActivity = currentPath.includes('/my-activity.html');
//         // if (!isHome && !isLogin && !isMyActivity) {
//         //     window.location.href = '/login.html';
//         // }
//         const currentPath = window.location.pathname;
//         //console.log('Current path:', currentPath);   // ← add this
// const isHome = currentPath === '/' || currentPath.endsWith('/index.html') || currentPath === '/index.html';
// const isLogin = currentPath.includes('/login.html');
// //const isPublic = currentPath.includes('/faq.html')|| 
//                 //  currentPath.includes('/privacy.html') || 
//                 //  currentPath.includes('/terms.html') || 
//                 //  currentPath.includes('/support.html');
//                  const publicPages = ['/faq.html', '/privacy.html', '/terms.html', '/support.html', 
//                      '/faq', '/privacy', '/terms', '/support']; // add extensionless versions
// const isPublic = publicPages.some(page => currentPath === page || currentPath.endsWith(page));

//                 // console.log('isPublic:', isPublic);          // ← add this

// if (!isHome && !isLogin && !isPublic) {
//     window.location.href = '/login.html';
// }

//     }
// })();




// auth.js – Handles login state, navigation protection, user popup with logout & activity
(function() {
    const userName = sessionStorage.getItem('userName');
    const userEmail = sessionStorage.getItem('userEmail');
    const userMobile = sessionStorage.getItem('userMobile');
    const isLoggedIn = !!(userName && userEmail);

    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const authLi = navLinks.lastElementChild;
    if (!authLi) return;

    if (isLoggedIn) {
        // Replace login/signup button with user initial button + popup
        const firstLetter = userName.charAt(0).toUpperCase();
        authLi.innerHTML = `
            <div class="user-btn-container">
                <button class="user-btn">${firstLetter}</button>
                <div class="user-popup" style="display:none;">
                    <p><strong>${userName}</strong></p>
                    <p>Email: ${userEmail}</p>
                    <p>Mobile: ${userMobile || 'N/A'}</p>
                    <hr>
                    <p><a href="/activity.html" id="activityLink">📋 My Activity</a></p>
                    <p><a href="#" id="logoutLink">🚪 Logout</a></p>
                </div>
            </div>
        `;

        const userBtn = document.querySelector('.user-btn');
        const popup = document.querySelector('.user-popup');

        // Toggle popup on button click
        userBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
        });

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-btn-container')) {
                popup.style.display = 'none';
            }
        });

        // Logout handler
        document.getElementById('logoutLink').addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.clear();
            window.location.href = '/';
        });

        // Activity link is a normal anchor; no extra handler needed
    } else {
        // Not logged in: protect all pages except home and login
        const currentPath = window.location.pathname;
        const isHome = currentPath === '/' || currentPath.endsWith('/index.html') || currentPath === '/index.html';
        const isLogin = currentPath.includes('/login.html');
        if (!isHome && !isLogin) {
            window.location.href = '/login.html';
        }
    }
})();


