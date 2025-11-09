// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCvjEmE28vCa4fjirnGwVKwZQgtDijxbwU",
    authDomain: "task-master-2004.firebaseapp.com",
    projectId: "task-master-2004",
    storageBucket: "task-master-2004.firebasestorage.app",
    messagingSenderId: "959840202961",
    appId: "1:959840202961:web:eb73413f4b75175e51d5f0",
    measurementId: "G-C0DJS166K8"
};









// TaskMaster - Complete JavaScript Implementation

// State Management
const state = {
    currentUser: null,
    tasks: [],
    categories: ['Personal', 'Work', 'Shopping', 'Study'],
    currentFilter: 'all',
    currentSort: 'date',
    editingTaskId: null,
    otpEmail: '',
    otpTimer: null,
    otpTimeLeft: 60,
    calendarMonth: new Date().getMonth(),
    calendarYear: new Date().getFullYear()
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    checkAuthState();
    setupEventListeners();
    setupOTPInputs();
}

// Auth State Check
function checkAuthState() {
    const savedUser = localStorage.getItem('taskmaster_user');
    if (savedUser) {
        state.currentUser = JSON.parse(savedUser);
        showApp();
    } else {
        showScreen('loginScreen');
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Auth Events
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('signupBtn').addEventListener('click', handleSignup);
    document.getElementById('verifyOtpBtn').addEventListener('click', handleVerifyOTP);
    document.getElementById('sendResetOtpBtn').addEventListener('click', handleForgotPassword);
    document.getElementById('resetPasswordBtn').addEventListener('click', handleResetPassword);
    document.getElementById('resendOtpBtn').addEventListener('click', resendOTP);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Screen Navigation
    document.getElementById('showSignup').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('signupScreen');
    });
    document.getElementById('showLogin').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('loginScreen');
    });
    document.getElementById('showForgotPassword').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('forgotPasswordScreen');
    });
    document.getElementById('backToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('loginScreen');
    });

    // Menu & Sidebar
    document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', toggleSidebar);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => handleNavigation(item.dataset.page));
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => handleNavigation(btn.dataset.page));
    });

    // Tasks
    document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
    document.getElementById('saveTaskBtn').addEventListener('click', saveTask);
    document.getElementById('closeModal').addEventListener('click', closeTaskModal);

    // Notifications
    document.getElementById('notifBtn').addEventListener('click', toggleNotifications);
    document.getElementById('closeNotifPanel').addEventListener('click', toggleNotifications);

    // Search
    document.getElementById('searchBtn').addEventListener('click', openSearch);
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.addEventListener('click', (e) => {
        if (e.target.id === 'searchModal') closeSearch();
    });

    // Filter & Sort
    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
        chip.addEventListener('click', () => handleFilter(chip.dataset.filter));
    });
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        state.currentSort = e.target.value;
        renderTasks();
    });

    // Profile Edit
    document.getElementById('closeEditProfile').addEventListener('click', closeEditProfile);
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);

    // Modal Close on Outside Click
    document.getElementById('taskModal').addEventListener('click', (e) => {
        if (e.target.id === 'taskModal') closeTaskModal();
    });
    document.getElementById('editProfileModal').addEventListener('click', (e) => {
        if (e.target.id === 'editProfileModal') closeEditProfile();
    });
}

// Screen Management
function showScreen(screenId) {
    document.querySelectorAll('.auth-screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

// Loading
function showLoading() {
    document.getElementById('loading').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading').classList.remove('active');
}

// Alert Messages
function showAlert(containerId, message, type = 'error') {
    const container = document.getElementById(containerId);
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    container.innerHTML = '';
    container.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Auth Functions
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showAlert('loginAlert', 'Please fill all fields');
        return;
    }

    showLoading();

    setTimeout(() => {
        hideLoading();

        const users = JSON.parse(localStorage.getItem('taskmaster_users') || '[]');
        const user = users.find(u => u.email === email && u.password === password);

        if (user) {
            if (!user.verified) {
                showAlert('loginAlert', 'Please verify your email first');
                return;
            }

            state.currentUser = user;
            localStorage.setItem('taskmaster_user', JSON.stringify(user));
            showApp();
        } else {
            showAlert('loginAlert', 'Invalid email or password');
        }
    }, 1000);
}

async function handleSignup() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    if (!name || !email || !password) {
        showAlert('signupAlert', 'Please fill all fields');
        return;
    }

    if (password.length < 6) {
        showAlert('signupAlert', 'Password must be at least 6 characters');
        return;
    }

    showLoading();

    setTimeout(() => {
        hideLoading();

        const users = JSON.parse(localStorage.getItem('taskmaster_users') || '[]');

        if (users.find(u => u.email === email)) {
            showAlert('signupAlert', 'Email already registered');
            return;
        }

        const newUser = {
            id: Date.now(),
            name,
            email,
            password,
            verified: false,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem('taskmaster_users', JSON.stringify(users));

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        localStorage.setItem(`otp_${email}`, otp);

        // Show loading spinner (optional)
        showLoading();

        // Send OTP email using EmailJS
        emailjs.send("service_tv8qwfs", "template_jykocjc", {
            email: email,
            user_name: name,  // for signup; use something like "User" for forgot password
            otp: otp
        })
            .then(() => {
                hideLoading();
                showAlert("signupAlert", "OTP sent successfully to your email!", "success");

                // Proceed to OTP verification screen
                document.getElementById("signupScreen").classList.add("hidden");
                document.getElementById("otpScreen").classList.remove("hidden");
                document.getElementById("otpEmail").textContent = email;
            })
            .catch((error) => {
                hideLoading();
                console.error("EmailJS error:", error);
                showAlert("signupAlert", "Failed to send OTP. Please try again.", "error");
            });


        state.otpEmail = email;
        document.getElementById('otpEmail').textContent = email;
        showScreen('otpScreen');
        startOTPTimer();


    }, 1000);
}

async function handleVerifyOTP() {
    const otp = Array.from({ length: 6 }, (_, i) =>
        document.getElementById(`otp${i + 1}`).value
    ).join('');

    if (otp.length !== 6) {
        showAlert('otpAlert', 'Please enter complete OTP');
        return;
    }

    showLoading();

    setTimeout(() => {
        hideLoading();

        const savedOTP = localStorage.getItem(`otp_${state.otpEmail}`);

        if (otp === savedOTP) {
            const users = JSON.parse(localStorage.getItem('taskmaster_users') || '[]');
            const userIndex = users.findIndex(u => u.email === state.otpEmail);

            if (userIndex !== -1) {
                users[userIndex].verified = true;
                localStorage.setItem('taskmaster_users', JSON.stringify(users));
                localStorage.removeItem(`otp_${state.otpEmail}`);

                showAlert('otpAlert', 'Email verified successfully!', 'success');
                // 🟢 Save user in Firebase Firestore
                db.collection("users").doc(state.otpEmail).set({
                    name: state.currentUser?.name || "New User",
                    email: state.otpEmail,
                    password: state.currentUser?.password || "******",
                    verified: true,
                    createdAt: new Date().toISOString()
                })
                    .then(() => {
                        console.log("User saved to Firestore ✅");
                    })
                    .catch((error) => {
                        console.error("Error saving user:", error);
                    });

                setTimeout(() => {
                    showScreen('loginScreen');
                    showAlert('loginAlert', 'Please login with your credentials', 'success');
                }, 1500);
            }
        } else {
            showAlert('otpAlert', 'Invalid OTP');
        }
    }, 1000);
}

async function handleForgotPassword() {
    const email = document.getElementById('forgotEmail').value.trim();

    if (!email) {
        showAlert('forgotAlert', 'Please enter your email');
        return;
    }

    showLoading();

    setTimeout(() => {
        hideLoading();

        const users = JSON.parse(localStorage.getItem('taskmaster_users') || '[]');
        const user = users.find(u => u.email === email);

        if (user) {
            const email = document.getElementById("forgotEmail").value.trim();
            if (!email) return showAlert("forgotAlert", "Please enter your email!", "error");

            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            localStorage.setItem(`reset_otp_${email}`, otp);
            showLoading();

            emailjs.send("service_tv8qwfs", "template_jykocjc", {
                email: email,
                user_name: "User",
                otp: otp
            })
                .then(() => {
                    hideLoading();
                    showAlert("forgotAlert", "OTP sent to your email!", "success");
                    document.getElementById("forgotPasswordScreen").classList.add("hidden");
                    document.getElementById("resetPasswordScreen").classList.remove("hidden");
                })
                .catch((error) => {
                    hideLoading();
                    console.error("EmailJS error:", error);
                    showAlert("forgotAlert", "Failed to send OTP. Try again later.", "error");
                });


            state.otpEmail = email;
            showScreen('resetPasswordScreen');

            showAlert("forgotAlert", "OTP sent to your email!", "success");

        } else {
            showAlert('forgotAlert', 'Email not found');
        }
    }, 1000);
}

async function handleResetPassword() {
    const otp = document.getElementById('resetOtp').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!otp || !newPassword || !confirmPassword) {
        showAlert('resetAlert', 'Please fill all fields');
        return;
    }

    if (newPassword !== confirmPassword) {
        showAlert('resetAlert', 'Passwords do not match');
        return;
    }

    if (newPassword.length < 6) {
        showAlert('resetAlert', 'Password must be at least 6 characters');
        return;
    }

    showLoading();

    setTimeout(() => {
        hideLoading();

        const savedOTP = localStorage.getItem(`reset_otp_${state.otpEmail}`);

        if (otp === savedOTP) {
            const users = JSON.parse(localStorage.getItem('taskmaster_users') || '[]');
            const userIndex = users.findIndex(u => u.email === state.otpEmail);

            if (userIndex !== -1) {
                users[userIndex].password = newPassword;
                localStorage.setItem('taskmaster_users', JSON.stringify(users));
                localStorage.removeItem(`reset_otp_${state.otpEmail}`);

                showAlert('resetAlert', 'Password reset successfully!', 'success');

                setTimeout(() => {
                    showScreen('loginScreen');
                    showAlert('loginAlert', 'Please login with your new password', 'success');
                }, 1500);
            }
        } else {
            showAlert('resetAlert', 'Invalid OTP');
        }
    }, 1000);
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('taskmaster_user');
        state.currentUser = null;
        state.tasks = [];

        document.getElementById('appContainer').classList.remove('active');
        showScreen('loginScreen');
    }
}

// OTP Functions
function startOTPTimer() {
    state.otpTimeLeft = 60;
    document.getElementById('resendOtpBtn').disabled = true;

    const timerEl = document.getElementById('otpTimer');

    state.otpTimer = setInterval(() => {
        state.otpTimeLeft--;
        timerEl.textContent = `(${state.otpTimeLeft}s)`;

        if (state.otpTimeLeft <= 0) {
            clearInterval(state.otpTimer);
            document.getElementById('resendOtpBtn').disabled = false;
            timerEl.textContent = '';
        }
    }, 1000);
}

function resendOTP() {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem(`otp_${state.otpEmail}`, otp);
    startOTPTimer();

    emailjs.send("service_tv8qwfs", "template_jykocjc", {
        email: state.otpEmail,
        user_name: "User",
        otp: otp
    })
        .then(() => {
            showAlert('otpAlert', "New OTP sent to your email!", 'success');
        })
        .catch((error) => {
            console.error("EmailJS resend error:", error);
            showAlert('otpAlert', "Failed to resend OTP. Please try again.", 'error');
        });
}


function setupOTPInputs() {
    const inputs = document.querySelectorAll('.otp-input');

    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = e.clipboardData.getData('text').slice(0, 6);
            pasteData.split('').forEach((char, i) => {
                if (inputs[index + i]) {
                    inputs[index + i].value = char;
                }
            });
        });
    });
}

// Show App
function showApp() {
    document.querySelectorAll('.auth-screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById('appContainer').classList.add('active');

    const initials = state.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase();
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = state.currentUser.name;
    document.getElementById('userEmail').textContent = state.currentUser.email;
    document.getElementById('profileAvatar').textContent = initials;
    document.getElementById('profileName').textContent = state.currentUser.name;
    document.getElementById('profileEmail').textContent = state.currentUser.email;

    loadTasks();
    updateStats();
    checkNotifications();
}

// Navigation
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

function handleNavigation(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        }
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === pageId) {
            btn.classList.add('active');
        }
    });

    if (document.getElementById('sidebar').classList.contains('active')) {
        toggleSidebar();
    }

    const titles = {
        homePage: 'Tasks',
        statsPage: 'Statistics',
        calendarPage: 'Calendar',
        categoriesPage: 'Categories',
        settingsPage: 'Settings',
        profilePage: 'Profile'
    };
    document.querySelector('.header-title').textContent = titles[pageId] || 'Tasks';

    if (pageId === 'profilePage') updateProfile();
    if (pageId === 'statsPage') updateStatsPage();
    if (pageId === 'calendarPage') updateCalendar();
    if (pageId === 'categoriesPage') updateCategories();
    if (pageId === 'settingsPage') updateSettings();
}

// Task Management
function loadTasks() {
    const savedTasks = localStorage.getItem(`tasks_${state.currentUser.email}`);
    state.tasks = savedTasks ? JSON.parse(savedTasks) : [];
    renderTasks();
}

function saveTasks() {
    localStorage.setItem(`tasks_${state.currentUser.email}`, JSON.stringify(state.tasks));
    updateStats();
    checkNotifications();
}

function renderTasks() {
    let filteredTasks = [...state.tasks];

    if (state.currentFilter === 'pending') {
        filteredTasks = filteredTasks.filter(t => !t.completed);
    } else if (state.currentFilter === 'completed') {
        filteredTasks = filteredTasks.filter(t => t.completed);
    } else if (state.currentFilter === 'high') {
        filteredTasks = filteredTasks.filter(t => t.priority === 'high');
    } else if (state.currentFilter === 'today') {
        const today = new Date().toDateString();
        filteredTasks = filteredTasks.filter(t =>
            new Date(t.dueDate).toDateString() === today
        );
    }

    filteredTasks.sort((a, b) => {
        if (state.currentSort === 'priority') {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        } else if (state.currentSort === 'category') {
            return a.category.localeCompare(b.category);
        } else {
            return new Date(a.dueDate) - new Date(b.dueDate);
        }
    });

    const tasksList = document.getElementById('tasksList');

    if (filteredTasks.length === 0) {
        tasksList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <h3>No tasks found</h3>
                <p>Try a different filter or add a new task</p>
            </div>
        `;
        return;
    }

    tasksList.innerHTML = filteredTasks.map(task => `
        <div class="task-card priority-${task.priority}">
            <div class="task-header">
                <input type="checkbox" class="task-checkbox" 
                    ${task.completed ? 'checked' : ''} 
                    onchange="toggleTask(${task.id})">
                <div class="task-content">
                    <div class="task-title" style="${task.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                        ${task.title}
                    </div>
                    <div class="task-meta">
                        <span class="badge badge-category">${task.category}</span>
                        <span class="badge badge-priority ${task.priority}">${task.priority}</span>
                        <span>📅 ${formatDate(task.dueDate)}</span>
                    </div>
                </div>
            </div>
            <div class="task-actions">
                <button class="task-btn btn-edit" onclick="editTask(${task.id})">✏️ Edit</button>
                <button class="task-btn btn-delete" onclick="deleteTask(${task.id})">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

function openTaskModal(taskId = null) {
    state.editingTaskId = taskId;
    const modal = document.getElementById('taskModal');

    if (taskId) {
        const task = state.tasks.find(t => t.id === taskId);
        document.getElementById('modalTitle').textContent = 'Edit Task';
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskCategory').value = task.category;
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('taskDueDate').value = task.dueDate;
    } else {
        document.getElementById('modalTitle').textContent = 'Add Task';
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskCategory').value = 'Personal';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskDueDate').value = '';
    }

    modal.classList.add('active');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('active');
    state.editingTaskId = null;
}

function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const category = document.getElementById('taskCategory').value;
    const priority = document.getElementById('taskPriority').value;
    const dueDate = document.getElementById('taskDueDate').value;

    if (!title || !dueDate) {
        alert('Please fill all required fields');
        return;
    }

    if (state.editingTaskId) {
        const taskIndex = state.tasks.findIndex(t => t.id === state.editingTaskId);
        state.tasks[taskIndex] = {
            ...state.tasks[taskIndex],
            title,
            category,
            priority,
            dueDate
        };
    } else {
        const newTask = {
            id: Date.now(),
            title,
            category,
            priority,
            dueDate,
            completed: false,
            createdAt: new Date().toISOString()
        };
        state.tasks.push(newTask);
    }

    saveTasks();
    renderTasks();
    closeTaskModal();

    // Update calendar if on calendar page
    if (document.getElementById('calendarPage').classList.contains('active')) {
        updateCalendar();
    }
}

function toggleTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    task.completed = !task.completed;
    saveTasks();
    renderTasks();

    // Update calendar if on calendar page
    if (document.getElementById('calendarPage').classList.contains('active')) {
        updateCalendar();
    }
}

function editTask(taskId) {
    openTaskModal(taskId);
}

function deleteTask(taskId) {
    if (confirm('Are you sure you want to delete this task?')) {
        state.tasks = state.tasks.filter(t => t.id !== taskId);
        saveTasks();
        renderTasks();

        // Update calendar if on calendar page
        if (document.getElementById('calendarPage').classList.contains('active')) {
            updateCalendar();
        }
    }
}

window.toggleTask = toggleTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.openEditProfile = openEditProfile;

function handleFilter(filter) {
    state.currentFilter = filter;

    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
        chip.classList.remove('active');
        if (chip.dataset.filter === filter) {
            chip.classList.add('active');
        }
    });

    renderTasks();
}

function updateStats() {
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const overdue = state.tasks.filter(t =>
        !t.completed && new Date(t.dueDate) < new Date()
    ).length;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('completedTasks').textContent = completed;
    document.getElementById('pendingTasks').textContent = pending;
    document.getElementById('overdueTasks').textContent = overdue;
}

function checkNotifications() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const upcomingTasks = state.tasks.filter(t => {
        if (t.completed) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate <= tomorrow;
    });

    const badge = document.getElementById('notifBadge');
    if (upcomingTasks.length > 0) {
        badge.textContent = upcomingTasks.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }

    updateNotificationList(upcomingTasks);
}

function updateNotificationList(tasks) {
    const list = document.getElementById('notificationList');

    if (tasks.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>No notifications</p>
            </div>
        `;
        return;
    }

    list.innerHTML = tasks.map(task => {
        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < new Date();
        const className = isOverdue ? 'danger' : 'warning';

        return `
            <div class="notification-item ${className}">
                <p><strong>${task.title}</strong></p>
                <small>${isOverdue ? '⚠️ Overdue' : '⏰ Due soon'}: ${formatDate(task.dueDate)}</small>
            </div>
        `;
    }).join('');
}

function toggleNotifications() {
    document.getElementById('notificationPanel').classList.toggle('active');
}

function openSearch() {
    document.getElementById('searchModal').classList.add('active');
    document.getElementById('searchInput').focus();
}

function closeSearch() {
    document.getElementById('searchModal').classList.remove('active');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const results = document.getElementById('searchResults');

    if (!query) {
        results.innerHTML = '';
        return;
    }

    const filteredTasks = state.tasks.filter(task =>
        task.title.toLowerCase().includes(query) ||
        task.category.toLowerCase().includes(query)
    );

    if (filteredTasks.length === 0) {
        results.innerHTML = '<div class="empty-state"><p>No results found</p></div>';
        return;
    }

    results.innerHTML = filteredTasks.map(task => `
        <div class="task-card priority-${task.priority}" onclick="closeSearch(); editTask(${task.id})">
            <div class="task-header">
                <div class="task-content">
                    <div class="task-title">${task.title}</div>
                    <div class="task-meta">
                        <span class="badge badge-category">${task.category}</span>
                        <span>📅 ${formatDate(task.dueDate)}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function updateProfile() {
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.completed).length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById('profileTotalTasks').textContent = total;
    document.getElementById('profileCompletedTasks').textContent = completed;
    document.getElementById('profileCompletionRate').textContent = rate + '%';

    const memberSince = new Date(state.currentUser.createdAt);
    document.getElementById('profileMemberSince').textContent =
        memberSince.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function openEditProfile() {
    document.getElementById('editName').value = state.currentUser.name;
    document.getElementById('editEmail').value = state.currentUser.email;
    document.getElementById('editProfileModal').classList.add('active');
}

function closeEditProfile() {
    document.getElementById('editProfileModal').classList.remove('active');
}

function saveProfile() {
    const newName = document.getElementById('editName').value.trim();

    if (!newName) {
        showAlert('editProfileAlert', 'Name cannot be empty');
        return;
    }

    state.currentUser.name = newName;

    const users = JSON.parse(localStorage.getItem('taskmaster_users') || '[]');
    const userIndex = users.findIndex(u => u.email === state.currentUser.email);
    if (userIndex !== -1) {
        users[userIndex].name = newName;
        localStorage.setItem('taskmaster_users', JSON.stringify(users));
    }

    localStorage.setItem('taskmaster_user', JSON.stringify(state.currentUser));

    const initials = newName.split(' ').map(n => n[0]).join('').toUpperCase();
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = newName;
    document.getElementById('profileAvatar').textContent = initials;
    document.getElementById('profileName').textContent = newName;

    showAlert('editProfileAlert', 'Profile updated successfully!', 'success');

    setTimeout(() => {
        closeEditProfile();
    }, 1500);
}

function updateStatsPage() {
    const statsContainer = document.getElementById('statsPage');

    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const categoryStats = state.categories.map(cat => {
        const catTasks = state.tasks.filter(t => t.category === cat);
        return {
            name: cat,
            count: catTasks.length,
            completed: catTasks.filter(t => t.completed).length
        };
    });

    const priorityStats = {
        high: state.tasks.filter(t => t.priority === 'high').length,
        medium: state.tasks.filter(t => t.priority === 'medium').length,
        low: state.tasks.filter(t => t.priority === 'low').length
    };

    statsContainer.innerHTML = `
        <div class="stats-page">
            <div class="chart-card">
                <h3 class="chart-title">📊 Overall Progress</h3>
                <div style="text-align: center; padding: 2rem 0;">
                    <div style="font-size: 4rem; font-weight: 700; color: var(--primary);">${completionRate}%</div>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem;">Completion Rate</p>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${completionRate}%;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 1rem; font-size: 0.875rem;">
                    <span>${completed} Completed</span>
                    <span>${pending} Pending</span>
                </div>
            </div>
            
            <div class="chart-card">
                <h3 class="chart-title">📁 Tasks by Category</h3>
                ${categoryStats.map(cat => `
                    <div style="margin-bottom: 1rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="font-weight: 600;">${cat.name}</span>
                            <span>${cat.completed}/${cat.count}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${cat.count > 0 ? (cat.completed / cat.count) * 100 : 0}%;"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="chart-card">
                <h3 class="chart-title">🎯 Tasks by Priority</h3>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1rem;">
                    <div style="text-align: center; padding: 1.5rem; background: var(--bg-card); border-radius: 0.75rem; border: 2px solid var(--danger);">
                        <div style="font-size: 2rem; color: var(--danger); font-weight: 700;">${priorityStats.high}</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">High</div>
                    </div>
                    <div style="text-align: center; padding: 1.5rem; background: var(--bg-card); border-radius: 0.75rem; border: 2px solid var(--warning);">
                        <div style="font-size: 2rem; color: var(--warning); font-weight: 700;">${priorityStats.medium}</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">Medium</div>
                    </div>
                    <div style="text-align: center; padding: 1.5rem; background: var(--bg-card); border-radius: 0.75rem; border: 2px solid var(--secondary);">
                        <div style="font-size: 2rem; color: var(--secondary); font-weight: 700;">${priorityStats.low}</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">Low</div>
                    </div>
                </div>
            </div>
            
            <div class="chart-card">
                <h3 class="chart-title">📈 Activity Summary</h3>
                <div class="profile-item">
                    <span>Total Tasks Created</span>
                    <strong style="color: var(--primary);">${total}</strong>
                </div>
                <div class="profile-item">
                    <span>Tasks Completed</span>
                    <strong style="color: var(--secondary);">${completed}</strong>
                </div>
                <div class="profile-item">
                    <span>Tasks Pending</span>
                    <strong style="color: var(--warning);">${pending}</strong>
                </div>
                <div class="profile-item">
                    <span>Success Rate</span>
                    <strong style="color: var(--info);">${completionRate}%</strong>
                </div>
            </div>
        </div>
    `;
}

function updateCalendar() {
    const calendarContainer = document.getElementById('calendarPage');
    const currentMonth = state.calendarMonth;
    const currentYear = state.calendarYear;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let calendarHTML = `
        <div class="calendar-container">
            <div class="calendar-header">
                <button class="icon-btn" onclick="changeMonth(-1)">◀</button>
                <h2>${monthNames[currentMonth]} ${currentYear}</h2>
                <button class="icon-btn" onclick="changeMonth(1)">▶</button>
            </div>
            
            <div class="calendar-grid">
                ${dayNames.map(day => `
                    <div style="text-align: center; font-weight: 700; color: var(--text-secondary); padding: 0.5rem;">
                        ${day}
                    </div>
                `).join('')}
    `;

    for (let i = 0; i < firstDay; i++) {
        calendarHTML += '<div class="calendar-day" style="opacity: 0.3;"></div>';
    }

    const today = new Date();
    const isCurrentMonth = currentMonth === today.getMonth() && currentYear === today.getFullYear();

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dateStr = date.toDateString();
        const todayStr = today.toDateString();
        const isToday = dateStr === todayStr;

        const dayTasks = state.tasks.filter(t => {
            const taskDate = new Date(t.dueDate).toDateString();
            return taskDate === dateStr;
        });

        const hasTasks = dayTasks.length > 0;

        calendarHTML += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${hasTasks ? 'has-tasks' : ''}" 
                 onclick="showDayTasks(${currentYear}, ${currentMonth}, ${day})"
                 style="cursor: pointer;">
                <div>${day}</div>
                ${hasTasks ? `
                    <div style="position: absolute; bottom: 2px; right: 2px; font-size: 0.65rem; background: var(--primary); color: white; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">
                        ${dayTasks.length}
                    </div>
                ` : ''}
            </div>
        `;
    }

    const selectedDay = isCurrentMonth ? today.getDate() : 1;
    const selectedDate = new Date(currentYear, currentMonth, selectedDay);
    const selectedTasks = state.tasks.filter(t => {
        const taskDate = new Date(t.dueDate).toDateString();
        return taskDate === selectedDate.toDateString();
    });

    calendarHTML += `
            </div>
            
            <div class="chart-card" style="margin-top: 1rem;">
                <h3 class="chart-title">📅 ${isCurrentMonth && selectedDay === today.getDate() ? "Today's Tasks" : `Tasks for ${monthNames[currentMonth]} ${selectedDay}`}</h3>
                <div id="calendarDayTasks">
                    ${selectedTasks.length === 0 ?
            '<div class="empty-state"><div class="empty-icon">📅</div><p>No tasks for this day</p></div>' :
            selectedTasks.map(task => `
                            <div class="task-card priority-${task.priority}" style="margin-bottom: 0.75rem;">
                                <div class="task-header">
                                    <input type="checkbox" class="task-checkbox" 
                                        ${task.completed ? 'checked' : ''} 
                                        onchange="toggleTask(${task.id})">
                                    <div class="task-content">
                                        <div class="task-title" style="${task.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                                            ${task.title}
                                        </div>
                                        <div class="task-meta">
                                            <span class="badge badge-category">${task.category}</span>
                                            <span class="badge badge-priority ${task.priority}">${task.priority}</span>
                                            <span>⏰ ${new Date(task.dueDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="task-actions">
                                    <button class="task-btn btn-edit" onclick="editTask(${task.id})">✏️ Edit</button>
                                    <button class="task-btn btn-delete" onclick="deleteTask(${task.id})">🗑️ Delete</button>
                                </div>
                            </div>
                        `).join('')
        }
                </div>
            </div>
        </div>
    `;

    calendarContainer.innerHTML = calendarHTML;
}

window.changeMonth = function (direction) {
    state.calendarMonth += direction;

    if (state.calendarMonth > 11) {
        state.calendarMonth = 0;
        state.calendarYear++;
    } else if (state.calendarMonth < 0) {
        state.calendarMonth = 11;
        state.calendarYear--;
    }

    updateCalendar();
};

window.showDayTasks = function (year, month, day) {
    const selectedDate = new Date(year, month, day);
    const selectedTasks = state.tasks.filter(t => {
        const taskDate = new Date(t.dueDate).toDateString();
        return taskDate === selectedDate.toDateString();
    });

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    const dayTasksContainer = document.getElementById('calendarDayTasks');
    const today = new Date();
    const isToday = selectedDate.toDateString() === today.toDateString();

    const titleElement = dayTasksContainer.parentElement.querySelector('.chart-title');
    titleElement.textContent = `📅 ${isToday ? "Today's Tasks" : `Tasks for ${monthNames[month]} ${day}, ${year}`}`;

    if (selectedTasks.length === 0) {
        dayTasksContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No tasks for this day</p></div>';
        return;
    }

    dayTasksContainer.innerHTML = selectedTasks.map(task => `
        <div class="task-card priority-${task.priority}" style="margin-bottom: 0.75rem;">
            <div class="task-header">
                <input type="checkbox" class="task-checkbox" 
                    ${task.completed ? 'checked' : ''} 
                    onchange="toggleTask(${task.id})">
                <div class="task-content">
                    <div class="task-title" style="${task.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                        ${task.title}
                    </div>
                    <div class="task-meta">
                        <span class="badge badge-category">${task.category}</span>
                        <span class="badge badge-priority ${task.priority}">${task.priority}</span>
                        <span>⏰ ${new Date(task.dueDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
            </div>
            <div class="task-actions">
                <button class="task-btn btn-edit" onclick="editTask(${task.id})">✏️ Edit</button>
                <button class="task-btn btn-delete" onclick="deleteTask(${task.id})">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
};

function updateCategories() {
    const categoriesContainer = document.getElementById('categoriesPage');

    const categoryData = state.categories.map(cat => {
        const catTasks = state.tasks.filter(t => t.category === cat);
        const completed = catTasks.filter(t => t.completed).length;

        const icons = {
            'Personal': '📱',
            'Work': '💼',
            'Shopping': '🛒',
            'Study': '📚'
        };

        return {
            name: cat,
            icon: icons[cat] || '📁',
            total: catTasks.length,
            completed: completed,
            pending: catTasks.length - completed
        };
    });

    categoriesContainer.innerHTML = `
        <div class="categories-page">
            <div class="chart-card">
                <h3 class="chart-title">📁 All Categories</h3>
                <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                    Manage and view your tasks by category
                </p>
                
                ${categoryData.map(cat => `
                    <div class="category-card" onclick="filterByCategory('${cat.name}')">
                        <div class="category-info">
                            <div class="category-icon">${cat.icon}</div>
                            <div>
                                <div style="font-weight: 700; font-size: 1.1rem;">${cat.name}</div>
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">
                                    ${cat.completed} completed, ${cat.pending} pending
                                </div>
                            </div>
                        </div>
                        <div class="category-count">${cat.total}</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="chart-card">
                <h3 class="chart-title">📊 Category Statistics</h3>
                ${categoryData.map(cat => {
        const percentage = cat.total > 0 ? Math.round((cat.completed / cat.total) * 100) : 0;
        return `
                        <div style="margin-bottom: 1.5rem;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="font-size: 1.5rem;">${cat.icon}</span>
                                    <span style="font-weight: 600;">${cat.name}</span>
                                </div>
                                <span style="font-weight: 700; color: var(--primary);">${percentage}%</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${percentage}%;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-secondary);">
                                <span>${cat.completed} completed</span>
                                <span>${cat.total} total</span>
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;
}

window.filterByCategory = function (category) {
    handleNavigation('homePage');
    setTimeout(() => {
        const categoryTasks = state.tasks.filter(t => t.category === category);
        const tasksList = document.getElementById('tasksList');

        if (categoryTasks.length === 0) {
            tasksList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <h3>No ${category} tasks</h3>
                    <p>Create a new task in this category</p>
                </div>
            `;
            return;
        }

        tasksList.innerHTML = categoryTasks.map(task => `
            <div class="task-card priority-${task.priority}">
                <div class="task-header">
                    <input type="checkbox" class="task-checkbox" 
                        ${task.completed ? 'checked' : ''} 
                        onchange="toggleTask(${task.id})">
                    <div class="task-content">
                        <div class="task-title" style="${task.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                            ${task.title}
                        </div>
                        <div class="task-meta">
                            <span class="badge badge-category">${task.category}</span>
                            <span class="badge badge-priority ${task.priority}">${task.priority}</span>
                            <span>📅 ${formatDate(task.dueDate)}</span>
                        </div>
                    </div>
                </div>
                <div class="task-actions">
                    <button class="task-btn btn-edit" onclick="editTask(${task.id})">✏️ Edit</button>
                    <button class="task-btn btn-delete" onclick="deleteTask(${task.id})">🗑️ Delete</button>
                </div>
            </div>
        `).join('');
    }, 100);
};

function updateSettings() {
    const settingsContainer = document.getElementById('settingsPage');

    const settings = JSON.parse(localStorage.getItem('taskmaster_settings') || '{}');
    const theme = settings.theme || 'dark';
    const notifications = settings.notifications !== false;
    const sound = settings.sound !== false;

    settingsContainer.innerHTML = `
        <div class="settings-page">
            <div class="settings-group">
                <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>🎨</span> Appearance
                </h3>
                <div class="settings-item" onclick="toggleTheme()">
                    <div>
                        <div class="settings-label">Dark Mode</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Switch between light and dark theme
                        </div>
                    </div>
                    <div class="toggle-switch ${theme === 'dark' ? 'active' : ''}" id="themeToggle">
                        <div class="toggle-slider"></div>
                    </div>
                </div>
            </div>
            
            <div class="settings-group">
                <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>🔔</span> Notifications
                </h3>
                <div class="settings-item" onclick="toggleSetting('notifications')">
                    <div>
                        <div class="settings-label">Push Notifications</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Get notified about upcoming tasks
                        </div>
                    </div>
                    <div class="toggle-switch ${notifications ? 'active' : ''}" id="notificationsToggle">
                        <div class="toggle-slider"></div>
                    </div>
                </div>
                
                <div class="settings-item" onclick="toggleSetting('sound')">
                    <div>
                        <div class="settings-label">Sound Effects</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Play sounds for actions
                        </div>
                    </div>
                    <div class="toggle-switch ${sound ? 'active' : ''}" id="soundToggle">
                        <div class="toggle-slider"></div>
                    </div>
                </div>
            </div>
            
            <div class="settings-group">
                <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>👤</span> Account
                </h3>
                <div class="settings-item" onclick="openEditProfile()">
                    <div>
                        <div class="settings-label">Edit Profile</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Update your name and information
                        </div>
                    </div>
                    <span style="font-size: 1.25rem;">▶</span>
                </div>
                
                <div class="settings-item" onclick="changePassword()">
                    <div>
                        <div class="settings-label">Change Password</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Update your account password
                        </div>
                    </div>
                    <span style="font-size: 1.25rem;">▶</span>
                </div>
            </div>
            
            <div class="settings-group">
                <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>📊</span> Data
                </h3>
                <div class="settings-item" onclick="exportData()">
                    <div>
                        <div class="settings-label">Export Data</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Download all your tasks
                        </div>
                    </div>
                    <span style="font-size: 1.25rem;">📥</span>
                </div>
                
                <div class="settings-item" onclick="clearData()">
                    <div>
                        <div class="settings-label" style="color: var(--danger);">Clear All Data</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Delete all tasks permanently
                        </div>
                    </div>
                    <span style="font-size: 1.25rem; color: var(--danger);">🗑️</span>
                </div>
            </div>
            
            <div class="settings-group">
                <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>ℹ️</span> About
                </h3>
                <div class="profile-item">
                    <span>Version</span>
                    <strong>1.0.0</strong>
                </div>
                <div class="profile-item">
                    <span>Developer</span>
                    <strong>TaskMaster Team</strong>
                </div>
            </div>
        </div>
    `;
}

window.toggleTheme = function () {
    const settings = JSON.parse(localStorage.getItem('taskmaster_settings') || '{}');
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    settings.theme = newTheme;
    localStorage.setItem('taskmaster_settings', JSON.stringify(settings));

    document.body.setAttribute('data-theme', newTheme);
    updateSettings();
};

window.toggleSetting = function (setting) {
    const settings = JSON.parse(localStorage.getItem('taskmaster_settings') || '{}');
    settings[setting] = !settings[setting];
    localStorage.setItem('taskmaster_settings', JSON.stringify(settings));
    updateSettings();
};

window.changePassword = function () {
    alert('Change password feature - Coming soon!');
};

window.exportData = function () {
    const dataStr = JSON.stringify(state.tasks, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'taskmaster-data.json';
    link.click();
};

window.clearData = function () {
    if (confirm('Are you sure? This will delete all your tasks permanently!')) {
        if (confirm('This action cannot be undone. Are you absolutely sure?')) {
            state.tasks = [];
            saveTasks();
            renderTasks();
            alert('All data has been cleared!');
        }
    }
};

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();

    // Reset time to midnight for accurate date comparison
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diff = dateOnly - nowOnly;
    const days = Math.round(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return '⚠️ Overdue';
    if (days === 0) return '📅 Today';
    if (days === 1) return '📅 Tomorrow';

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}