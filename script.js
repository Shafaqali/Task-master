import{getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,sendPasswordResetEmail,onAuthStateChanged,updateProfile as fbUpdateProfile,GoogleAuthProvider,signInWithPopup}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import{getFirestore,doc,setDoc,getDoc,addDoc,updateDoc,deleteDoc,collection,query,where,getDocs,onSnapshot,serverTimestamp,orderBy}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyCvjEmE28vCa4fjirnGwVKwZQgtDijxbwU",authDomain:"task-master-2004.firebaseapp.com",projectId:"task-master-2004",storageBucket:"task-master-2004.firebasestorage.app",messagingSenderId:"959840202961",appId:"1:959840202961:web:eb73413f4b75175e51d5f0"};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const gp=new GoogleAuthProvider();

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
const S={
  user:null,tasks:[],
  categories:['Personal','Work','Shopping','Study'],
  filter:'all',sort:'date',editingId:null,
  calMonth:new Date().getMonth(),calYear:new Date().getFullYear(),
  unsubTasks:null,
  streak:{current:0,best:0,lastDate:null,history:[],brokenAt:null}
};

// ══════════════════════════════════════════
//  PWA
// ══════════════════════════════════════════
let deferredPrompt=null;

function setupPWA(){
  // Register service worker
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js').then(reg=>{
        console.log('SW registered',reg.scope);
        // Listen for SW messages
        navigator.serviceWorker.addEventListener('message',e=>{
          if(e.data?.type==='CHECK_STREAK') evaluateStreak();
        });
      }).catch(err=>console.log('SW registration failed:',err));
    });
  }

  // Install prompt
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    deferredPrompt=e;
    // Show banner after 3 seconds if not dismissed before
    const dismissed=localStorage.getItem('pwa_dismissed');
    if(!dismissed){
      setTimeout(()=>{ $('pwaBanner').classList.remove('hidden'); },3000);
    }
  });

  window.addEventListener('appinstalled',()=>{
    $('pwaBanner').classList.add('hidden');
    deferredPrompt=null;
    showStreakToast('✅ App installed successfully!');
  });

  $('pwaInstallBtn').addEventListener('click',async()=>{
    if(!deferredPrompt)return;
    deferredPrompt.prompt();
    const{outcome}=await deferredPrompt.userChoice;
    deferredPrompt=null;
    $('pwaBanner').classList.add('hidden');
  });

  $('pwaDismissBtn').addEventListener('click',()=>{
    $('pwaBanner').classList.add('hidden');
    localStorage.setItem('pwa_dismissed','1');
  });

  // Online / offline indicator
  const toast=$('offlineToast');
  function updateOnlineStatus(){
    if(!navigator.onLine){
      toast.classList.add('show');
    }else{
      toast.classList.remove('show');
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

// ══════════════════════════════════════════
//  STREAK SYSTEM
// ══════════════════════════════════════════

const STREAK_KEY = uid => `tm_streak_${uid}`;

function loadStreakData(){
  if(!S.user) return;
  const raw = localStorage.getItem(STREAK_KEY(S.user.uid));
  if(raw){
    try{ S.streak = JSON.parse(raw); }catch(e){ resetStreakData(); }
  } else {
    resetStreakData();
  }
}

function saveStreakData(){
  if(!S.user) return;
  localStorage.setItem(STREAK_KEY(S.user.uid), JSON.stringify(S.streak));
}

function resetStreakData(){
  S.streak = {current:0, best:0, lastDate:null, history:[], brokenAt:null};
}

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dayKey(date){
  // Always use LOCAL date parts — works correctly for IST and any timezone
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// Safe date parser: handles Firestore Timestamps, ISO strings, and date-only strings
function parseTaskDate(dueDate){
  if(!dueDate) return null;
  if(typeof dueDate === 'object' && dueDate.toDate) return dueDate.toDate(); // Firestore Timestamp
  if(typeof dueDate === 'object' && dueDate.seconds) return new Date(dueDate.seconds * 1000);
  // Date-only string "2024-01-15" parses as UTC midnight — shift to local end-of-day
  if(typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)){
    const [y, m, d] = dueDate.split('-').map(Number);
    return new Date(y, m-1, d, 23, 59, 0); // local end-of-day
  }
  return new Date(dueDate);
}

function prevDayKey(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate()-1);
  return dayKey(d);
}

// ── CORE STREAK LOGIC ──
// Rule: If today has ANY task whose due time has PASSED and it's NOT completed → streak breaks
// Streak builds: when today has at least one task AND ALL tasks whose due time passed are completed
function evaluateStreak(){
  const today = todayKey();
  const now = new Date();

  // Sanitize corrupted state: current > 0 but lastDate null/wrong gap
  if(S.streak.current > 0 && S.streak.lastDate){
    const yesterday = prevDayKey(today);
    if(S.streak.lastDate !== today && S.streak.lastDate !== yesterday){
      // Gap detected — streak should have been 0
      S.streak.current = 0;
      S.streak.lastDate = null;
      saveStreakData();
    }
  }

  // All tasks due today — use parseTaskDate to handle Firestore Timestamps & date-only strings
  const todayTasks = S.tasks.filter(t => {
    if(!t.dueDate) return false;
    const due = parseTaskDate(t.dueDate);
    return due && dayKey(due) === today;
  });

  // Tasks whose deadline has already passed
  const expiredTasks = todayTasks.filter(t => {
    const due = parseTaskDate(t.dueDate);
    return due && due <= now;
  });

  // Has any expired task that is NOT completed → BREAK
  const hasFailedTask = expiredTasks.some(t => !t.completed);

  // All expired tasks are completed (and at least one exists)
  const allExpiredDone = expiredTasks.length > 0 && expiredTasks.every(t => t.completed);

  const prevStreak = S.streak.current;

  if(hasFailedTask){
    // ── BREAK ──
    if(S.streak.current > 0 || S.streak.brokenAt !== today){
      const broken = S.streak.current;
      S.streak.current = 0;
      S.streak.brokenAt = today;
      S.streak.lastDate = null;
      // Remove today from history
      S.streak.history = S.streak.history.filter(d => d !== today);
      saveStreakData();
      if(broken > 0) showStreakToast(`💔 Streak broken! You had ${broken} day${broken>1?'s':''}`);
    }
  } else if(allExpiredDone){
    // ── BUILD / MAINTAIN ──
    if(S.streak.lastDate !== today){
      const yesterday = prevDayKey(today);
      const isConsecutive = S.streak.lastDate === yesterday;
      const isFreshStart = !S.streak.lastDate || S.streak.current === 0;

      if(isConsecutive){
        S.streak.current += 1;
      } else if(isFreshStart){
        S.streak.current = 1;
      } else {
        // Gap of more than 1 day → reset to 1
        S.streak.current = 1;
      }

      S.streak.lastDate = today;
      S.streak.brokenAt = null; // clear broken state
      S.streak.best = Math.max(S.streak.best, S.streak.current);
      if(!S.streak.history.includes(today)){
        S.streak.history.push(today);
        if(S.streak.history.length > 7) S.streak.history.shift();
      }
      saveStreakData();

      // Milestone toasts
      const cur = S.streak.current;
      if(cur !== prevStreak){
        if(cur === 3) showStreakToast('🔥 3-day streak! You\'re on a roll!');
        else if(cur === 7) showStreakToast('🔥🔥 One week streak! Incredible!');
        else if(cur === 14) showStreakToast('⚡ 14-day streak! Unstoppable!');
        else if(cur === 30) showStreakToast('🏆 30-day streak! LEGENDARY!');
        else if(cur === 1 && prevStreak === 0) showStreakToast('🔥 Streak started! Keep going!');
      }
    }
  }
  // else: no expired tasks yet today — no change to streak

  renderStreakBanner();
}

function renderStreakBanner(){
  const banner=$('streakBanner');
  const fireEl=$('streakFireEmoji');
  const countEl=$('streakCount');
  const subEl=$('streakSub');
  const weekEl=$('streakWeek');
  const bestEl=$('streakBest');
  const sbTxt=$('sbStreakTxt');
  if(!banner) return;

  const{current,best,history,brokenAt,lastDate}=S.streak;
  const today=todayKey();
  const now=new Date();

  // Check state
  const todayTasks=S.tasks.filter(t=>{if(!t.dueDate)return false;const d=parseTaskDate(t.dueDate);return d&&dayKey(d)===today;});
  const expiredTasks=todayTasks.filter(t=>{const d=parseTaskDate(t.dueDate);return d&&d<=now;});
  const isBroken=brokenAt===today;
  const hasUpcoming=todayTasks.some(t=>{const d=parseTaskDate(t.dueDate);return d&&d>now&&!t.completed;});
  const isAtRisk=!isBroken && expiredTasks.length===0 && todayTasks.length>0 && hasUpcoming && current>0;

  // Counts
  countEl.textContent=current;
  sbTxt.textContent=`${current} day streak`;

  // 7-day dots
  weekEl.innerHTML='';
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const dk=dayKey(d);
    const isT=dk===today;
    const filled=history.includes(dk);
    const dot=document.createElement('div');
    if(filled){dot.className=`streak-dot ${isT?'today-done':'done'}`;}
    else if(isT){dot.className='streak-dot today-empty';}
    else{dot.className='streak-dot';}
    dot.title=dk;
    weekEl.appendChild(dot);
  }
  const lbl=document.createElement('span');
  lbl.className='streak-week-lbl';lbl.textContent='7d';
  weekEl.appendChild(lbl);

  // Best badge
  if(best>0){
    bestEl.textContent=`🏆 Best: ${best} day${best>1?'s':''}`;
    bestEl.classList.remove('hidden');
  } else {
    bestEl.classList.add('hidden');
  }

  // State classes
  banner.classList.remove('state-zero','state-broken','state-risk');

  if(isBroken){
    banner.classList.add('state-broken');
    fireEl.textContent='💔';
    subEl.textContent=`Streak broken — a task expired incomplete. Start fresh tomorrow!`;
  } else if(isAtRisk){
    banner.classList.add('state-risk');
    fireEl.textContent='⚠️';
    subEl.textContent=`Tasks due today! Complete before deadline or streak breaks!`;
  } else if(current===0){
    banner.classList.add('state-zero');
    fireEl.textContent='🔥';
    subEl.textContent=todayTasks.length>0
      ? `Complete today's tasks before they expire to start!`
      : `Add a task for today and complete it to start your streak!`;
  } else {
    fireEl.textContent=current>=14?'🔥🔥🔥':current>=7?'🔥🔥':'🔥';
    subEl.textContent=lastDate===today
      ? `Amazing! ${current} day${current>1?'s':''} strong — keep it up!`
      : hasUpcoming
        ? `Don't forget to complete today's tasks!`
        : `Great work so far!`;
  }

  // Update profile page streak if visible
  updateProfileStreakCard();
}

function updateProfileStreakCard(){
  const numEl=$('profileStreakNum');
  const bestEl=$('profileStreakBest');
  if(numEl) numEl.textContent=S.streak.current;
  if(bestEl) bestEl.textContent=`🏆 Best: ${S.streak.best} day${S.streak.best!==1?'s':''}`;
}

function showStreakToast(msg){
  const t=$('streakToast');
  $('streakToastMsg').textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3500);
}

// Poll every minute to check if any task has expired
let streakPollTimer=null;
function startStreakPoller(){
  if(streakPollTimer) clearInterval(streakPollTimer);
  streakPollTimer=setInterval(()=>{ evaluateStreak(); }, 60000);
}

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
const $=id=>document.getElementById(id);
function showLoading(){$('loading').classList.add('active')}
function hideLoading(){$('loading').classList.remove('active')}
function showScreen(id){document.querySelectorAll('.auth-wrap').forEach(s=>s.classList.add('hidden'));$(id)?.classList.remove('hidden')}

function showAlert(cid,msg,type='error'){
  const el=$(cid);if(!el)return;
  const d=document.createElement('div');
  d.className=`alert alert-${type}`;d.innerHTML=msg;
  el.innerHTML='';el.appendChild(d);
  setTimeout(()=>d.remove(),6000);
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function fmtDate(ds){
  const d=new Date(ds),now=new Date();
  const dO=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const nO=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const diff=Math.round((dO-nO)/86400000);
  if(diff<0)return'Overdue';
  if(diff===0){
    return d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }
  if(diff===1)return'Tomorrow';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function friendlyErr(code){
  return({'auth/user-not-found':'No account with this email.','auth/wrong-password':'Wrong password.','auth/invalid-credential':'Invalid email or password.','auth/email-already-in-use':'Email already registered.','auth/weak-password':'Password min 6 characters.','auth/invalid-email':'Invalid email address.','auth/too-many-requests':'Too many attempts. Try later.','auth/popup-closed-by-user':'Google sign-in cancelled.','auth/network-request-failed':'Network error.'})[code]||code;
}

// ══════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════
async function handleLogin(){
  const email=$('loginEmail').value.trim(),pass=$('loginPassword').value;
  if(!email||!pass){showAlert('loginAlert','Please fill all fields');return;}
  showLoading();
  try{await signInWithEmailAndPassword(auth,email,pass);}
  catch(e){hideLoading();showAlert('loginAlert',friendlyErr(e.code));}
}

async function handleSignup(){
  const name=$('signupName').value.trim(),email=$('signupEmail').value.trim(),pass=$('signupPassword').value;
  if(!name||!email||!pass){showAlert('signupAlert','Please fill all fields');return;}
  if(pass.length<6){showAlert('signupAlert','Password must be at least 6 characters');return;}
  showLoading();
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await fbUpdateProfile(cred.user,{displayName:name});
    await setDoc(doc(db,'users',cred.user.uid),{name,email,createdAt:serverTimestamp(),photoURL:null});
  }catch(e){hideLoading();showAlert('signupAlert',friendlyErr(e.code));}
}

async function handleGoogleLogin(){
  showLoading();
  try{
    const result=await signInWithPopup(auth,gp);
    const u=result.user,ref=doc(db,'users',u.uid),snap=await getDoc(ref);
    if(!snap.exists())await setDoc(ref,{name:u.displayName||'User',email:u.email,photoURL:u.photoURL||null,createdAt:serverTimestamp()});
  }catch(e){hideLoading();showAlert('loginAlert',friendlyErr(e.code));}
}

async function handleForgotPassword(){
  const email=$('forgotEmail').value.trim();
  if(!email){showAlert('forgotAlert','Please enter your email');return;}
  showLoading();
  try{
    await sendPasswordResetEmail(auth,email);hideLoading();
    showAlert('forgotAlert',`Reset email sent to <strong>${email}</strong>!`,'success');
    setTimeout(()=>showScreen('loginScreen'),3000);
  }catch(e){hideLoading();showAlert('forgotAlert',friendlyErr(e.code));}
}

async function handleLogout(){if(!confirm('Logout?'))return;if(streakPollTimer)clearInterval(streakPollTimer);await signOut(auth);}

async function loadProfile(fu){
  const snap=await getDoc(doc(db,'users',fu.uid));
  if(snap.exists())return{uid:fu.uid,name:snap.data().name||fu.displayName||'User',email:fu.email,photoURL:snap.data().photoURL||fu.photoURL||null,createdAt:snap.data().createdAt?.toDate?.()?.toISOString()||new Date().toISOString()};
  return{uid:fu.uid,name:fu.displayName||'User',email:fu.email,photoURL:fu.photoURL||null,createdAt:new Date().toISOString()};
}

function subscribeToTasks(uid){
  if(S.unsubTasks)S.unsubTasks();
  const q=query(collection(db,'tasks'),where('uid','==',uid),orderBy('createdAt','desc'));
  S.unsubTasks=onSnapshot(q,(snap)=>{
    S.tasks=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderTasks();updateStats();checkNotifications();
    evaluateStreak(); // ← check streak on every task update
    const ap=document.querySelector('.page.active')?.id;
    if(ap==='statsPage')updateStatsPage();
    if(ap==='calendarPage')updateCalendar();
    if(ap==='categoriesPage')updateCategories();
  });
}

function showApp(){
  document.querySelectorAll('.auth-wrap').forEach(s=>s.classList.add('hidden'));
  $('appContainer').classList.add('active');
  hideLoading();
  const{name,email,photoURL}=S.user;
  syncAllAvatars(photoURL,name);
  $('userName').textContent=name;$('userEmail').textContent=email;
  $('profileName').textContent=name;$('profileEmail').textContent=email;
  const hr=new Date().getHours();
  const greet=hr<12?'GOOD MORNING':hr<17?'GOOD AFTERNOON':'GOOD EVENING';
  $('greetingTime').textContent=greet;
  $('greetingName').innerHTML=`Hey, <span>${esc(name.split(' ')[0])}</span>`;
  loadStreakData();
  renderStreakBanner();
  startStreakPoller();
  setupTheme();
}

// ══════════════════════════════════════════
//  TASKS
// ══════════════════════════════════════════
async function saveTask(){
  const title=$('taskTitle').value.trim(),category=$('taskCategory').value,priority=$('taskPriority').value,dueDate=$('taskDueDate').value;
  if(!title||!dueDate){showAlert('taskModalAlert','Please fill all required fields');return;}
  showLoading();
  try{
    if(S.editingId){
      await updateDoc(doc(db,'tasks',S.editingId),{title,category,priority,dueDate,updatedAt:serverTimestamp()});
    } else {
      await addDoc(collection(db,'tasks'),{uid:S.user.uid,title,category,priority,dueDate,completed:false,createdAt:serverTimestamp()});
    }
    closeTaskModal();
  }catch(e){showAlert('taskModalAlert','Error: '+e.message);}
  hideLoading();
}

window.toggleTask=async(id)=>{
  const t=S.tasks.find(t=>t.id===id);
  if(!t)return;
  await updateDoc(doc(db,'tasks',id),{completed:!t.completed});
  // Streak evaluated via onSnapshot → evaluateStreak() call
};

window.editTask=(id)=>openTaskModal(id);
window.deleteTask=async(id)=>{if(!confirm('Delete this task?'))return;await deleteDoc(doc(db,'tasks',id));};

function openTaskModal(id=null){
  S.editingId=id;
  if(id){
    const t=S.tasks.find(t=>t.id===id);
    $('modalTitle').textContent='Edit Task';$('taskTitle').value=t.title;
    $('taskCategory').value=t.category;$('taskPriority').value=t.priority;$('taskDueDate').value=t.dueDate;
  }else{
    $('modalTitle').textContent='New Task';$('taskTitle').value='';
    $('taskCategory').value='Personal';$('taskPriority').value='medium';$('taskDueDate').value='';
  }
  $('taskModalAlert').innerHTML='';$('taskModal').classList.add('active');
}
function closeTaskModal(){$('taskModal').classList.remove('active');S.editingId=null;}

function renderTasks(){
  let f=[...S.tasks];
  if(S.filter==='pending')f=f.filter(t=>!t.completed);
  else if(S.filter==='completed')f=f.filter(t=>t.completed);
  else if(S.filter==='high')f=f.filter(t=>t.priority==='high');
  else if(S.filter==='today'){const td=new Date().toDateString();f=f.filter(t=>new Date(t.dueDate).toDateString()===td);}
  f.sort((a,b)=>{
    if(S.sort==='priority')return({high:3,medium:2,low:1}[b.priority])-({high:3,medium:2,low:1}[a.priority]);
    if(S.sort==='category')return a.category.localeCompare(b.category);
    return new Date(a.dueDate)-new Date(b.dueDate);
  });
  const el=$('tasksList');
  if(!f.length){el.innerHTML=`<div class="empty"><svg width="40" height="40"><use href="#ic-task"/></svg><h3>No tasks found</h3><p>Try a different filter or add a task</p></div>`;return;}
  el.innerHTML=f.map(taskCardHTML).join('');
}

function taskCardHTML(t){
  const now=new Date();
  const due=new Date(t.dueDate);
  const isOverdue=!t.completed&&due<now;
  const isStreakRisk=!t.completed&&dayKey(due)===todayKey()&&due>now; // due today, future, not done
  const dateLabel=fmtDate(t.dueDate);

  const riskTag=isStreakRisk
    ?`<span class="streak-risk-tag">⚠️ Streak at risk</span>`
    :'';

  return`<div class="task-card priority-${t.priority}">
    <div class="task-hdr">
      <input type="checkbox" class="task-cb" ${t.completed?'checked':''} onchange="toggleTask('${t.id}')">
      <div class="task-body">
        <div class="task-title" style="${t.completed?'text-decoration:line-through;opacity:.4':''}">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="badge badge-cat">${esc(t.category)}</span>
          <span class="badge badge-${t.priority}">${t.priority}</span>
          <span style="${isOverdue?'color:var(--rose)':''}">
            <svg width="11" height="11" style="vertical-align:middle;margin-right:2px"><use href="#ic-clock"/></svg>${dateLabel}
          </span>
          ${riskTag}
        </div>
      </div>
    </div>
    <div class="task-actions">
      <button class="t-btn t-btn-edit" onclick="editTask('${t.id}')"><svg width="12" height="12"><use href="#ic-edit"/></svg> Edit</button>
      <button class="t-btn t-btn-del" onclick="deleteTask('${t.id}')"><svg width="12" height="12"><use href="#ic-trash"/></svg> Delete</button>
    </div>
  </div>`;
}

function updateStats(){
  const total=S.tasks.length,done=S.tasks.filter(t=>t.completed).length;
  $('totalTasks').textContent=total;$('completedTasks').textContent=done;
  $('pendingTasks').textContent=total-done;
  $('overdueTasks').textContent=S.tasks.filter(t=>!t.completed&&new Date(t.dueDate)<new Date()).length;
}

function checkNotifications(){
  const tom=new Date();tom.setDate(tom.getDate()+1);
  const up=S.tasks.filter(t=>!t.completed&&new Date(t.dueDate)<=tom);
  const b=$('notifBadge');b.textContent=up.length;b.style.display=up.length>0?'flex':'none';
  const list=$('notifList');
  if(!up.length){list.innerHTML=`<div class="empty"><svg width="32" height="32"><use href="#ic-bell"/></svg><p>No notifications</p></div>`;return;}
  list.innerHTML=up.map(t=>{const ov=new Date(t.dueDate)<new Date();
    return`<div class="notif-item ${ov?'danger':'warn'}">
      <p style="font-weight:600;margin-bottom:.15rem">${esc(t.title)}</p>
      <small style="color:var(--t2)">${ov?'Overdue':'Due soon'} · ${fmtDate(t.dueDate)}</small>
    </div>`}).join('');
}

// ══════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════
function openSearch(){$('searchModal').classList.add('active');$('searchInput').focus();}
function closeSearch(){$('searchModal').classList.remove('active');$('searchInput').value='';$('searchResults').innerHTML='';}
window.closeSearch=closeSearch;

function handleSearch(e){
  const q=e.target.value.toLowerCase(),res=$('searchResults');
  if(!q){res.innerHTML='';return;}
  const found=S.tasks.filter(t=>t.title.toLowerCase().includes(q)||t.category.toLowerCase().includes(q));
  if(!found.length){res.innerHTML='<div class="empty"><p>No results found</p></div>';return;}
  res.innerHTML=found.map(t=>`<div class="task-card priority-${t.priority}" onclick="closeSearch();editTask('${t.id}')">
    <div class="task-hdr"><div class="task-body">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta"><span class="badge badge-cat">${esc(t.category)}</span><span>${fmtDate(t.dueDate)}</span></div>
    </div></div></div>`).join('');
}

// ══════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════
function updateProfilePage(){
  const total=S.tasks.length,done=S.tasks.filter(t=>t.completed).length,rate=total>0?Math.round((done/total)*100):0;
  $('profileTotalTasks').textContent=total;$('profileCompletedTasks').textContent=done;
  $('profileCompletionRate').textContent=rate+'%';
  const d=new Date(S.user.createdAt);
  $('profileMemberSince').textContent=isNaN(d)?'Recently':d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
  updateProfileStreakCard();
}

// ══════════════════════════════════════════
//  PHOTO UPLOAD
// ══════════════════════════════════════════
let pendingPhotoDataURL=null;

function compressImage(file,maxPx=200,quality=0.82){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement('canvas');
        let w=img.width,h=img.height;
        if(w>h){if(w>maxPx){h=Math.round(h*maxPx/w);w=maxPx;}}
        else{if(h>maxPx){w=Math.round(w*maxPx/h);h=maxPx;}}
        canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg',quality));
      };
      img.onerror=reject;img.src=e.target.result;
    };
    reader.onerror=reject;reader.readAsDataURL(file);
  });
}

function syncAllAvatars(photoURL,name){
  const initials=name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  ['userAvatar','profileAvatar','editAvatarPreview'].forEach(id=>{
    const el=$(id);if(!el)return;
    if(photoURL){el.innerHTML=`<img src="${photoURL}" alt="${esc(name)}">`;}
    else{el.innerHTML='';el.textContent=initials;}
  });
}

window.openEditProfile=function(){
  pendingPhotoDataURL=null;
  $('editName').value=S.user.name;$('editEmail').value=S.user.email;$('editProfileAlert').innerHTML='';
  const prev=$('editAvatarPreview');
  const initials=S.user.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  if(S.user.photoURL){prev.innerHTML=`<img src="${S.user.photoURL}" alt="avatar">`;$('removePhotoBtn').classList.remove('hidden');}
  else{prev.innerHTML='';prev.textContent=initials;$('removePhotoBtn').classList.add('hidden');}
  $('editProfileModal').classList.add('active');
};

window.removePhoto=function(){
  pendingPhotoDataURL='';
  const initials=($('editName').value.trim()||S.user.name).split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  const prev=$('editAvatarPreview');prev.innerHTML='';prev.textContent=initials;$('removePhotoBtn').classList.add('hidden');
};

function closeEditProfile(){$('editProfileModal').classList.remove('active');pendingPhotoDataURL=null;}

async function saveProfile(){
  const newName=$('editName').value.trim();
  if(!newName){showAlert('editProfileAlert','Name cannot be empty');return;}
  showLoading();
  try{
    const u=auth.currentUser;let newPhotoURL=S.user.photoURL;
    if(pendingPhotoDataURL===''){newPhotoURL=null;}
    else if(pendingPhotoDataURL){newPhotoURL=pendingPhotoDataURL;}
    const authPhotoURL=(newPhotoURL&&newPhotoURL.startsWith('http'))?newPhotoURL:null;
    await fbUpdateProfile(u,{displayName:newName,photoURL:authPhotoURL});
    await updateDoc(doc(db,'users',u.uid),{name:newName,photoURL:newPhotoURL||null});
    S.user.name=newName;S.user.photoURL=newPhotoURL||null;pendingPhotoDataURL=null;
    syncAllAvatars(S.user.photoURL,newName);
    $('userName').textContent=newName;$('profileName').textContent=newName;
    showAlert('editProfileAlert','Profile updated!','success');
    setTimeout(closeEditProfile,1500);
  }catch(e){showAlert('editProfileAlert',e.message);}
  hideLoading();
}

// ══════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════
function toggleSidebar(){$('sidebar').classList.toggle('active');$('sidebarOverlay').classList.toggle('active');}
const pageTitles={homePage:'Tasks',statsPage:'Statistics',calendarPage:'Calendar',categoriesPage:'Categories',settingsPage:'Settings',profilePage:'Profile'};

function goTo(pageId){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  $(pageId)?.classList.add('active');
  document.querySelectorAll('.nav-item,.bnav-btn').forEach(el=>el.classList.toggle('active',el.dataset.page===pageId));
  if($('sidebar').classList.contains('active'))toggleSidebar();
  $('hdrTitle').textContent=pageTitles[pageId]||'Tasks';
  if(pageId==='profilePage')updateProfilePage();
  if(pageId==='statsPage')updateStatsPage();
  if(pageId==='calendarPage')updateCalendar();
  if(pageId==='categoriesPage')updateCategories();
  if(pageId==='settingsPage')updateSettings();
}

// ══════════════════════════════════════════
//  STATS PAGE
// ══════════════════════════════════════════
function updateStatsPage(){
  const total=S.tasks.length,done=S.tasks.filter(t=>t.completed).length,pending=total-done;
  const rate=total>0?Math.round((done/total)*100):0;
  const catStats=S.categories.map(cat=>{const ct=S.tasks.filter(t=>t.category===cat);return{name:cat,count:ct.length,done:ct.filter(t=>t.completed).length};});
  const pri={high:S.tasks.filter(t=>t.priority==='high').length,medium:S.tasks.filter(t=>t.priority==='medium').length,low:S.tasks.filter(t=>t.priority==='low').length};
  const{current,best}=S.streak;
  $('statsPage').innerHTML=`<div class="pg">
    <div class="sec-card" style="background:linear-gradient(135deg,#ff6b35,#f7931e);border:none">
      <div style="display:flex;align-items:center;gap:1rem">
        <div style="font-size:2.5rem">${current>=7?'🔥🔥':'🔥'}</div>
        <div>
          <div style="font-size:1.8rem;font-weight:900;color:white;line-height:1">${current} <span style="font-size:.85rem;opacity:.9">days</span></div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.85);text-transform:uppercase;letter-spacing:.08em;font-weight:700">Current Streak</div>
          <div style="font-size:.78rem;color:rgba(255,255,255,.9);margin-top:.3rem">🏆 Best: ${best} day${best!==1?'s':''}</div>
        </div>
      </div>
    </div>
    <div class="sec-card">
      <h3 class="sec-card-title"><svg width="16" height="16"><use href="#ic-bar-chart"/></svg> Overall Progress</h3>
      <div style="text-align:center;padding:1.5rem 0">
        <div style="font-family:'JetBrains Mono',monospace;font-size:3.2rem;font-weight:700;color:var(--accent)">${rate}%</div>
        <p style="color:var(--t2);margin-top:.4rem;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase">Completion Rate</p>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${rate}%"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:.875rem;font-size:.78rem;color:var(--t2)">
        <span>${done} Completed</span><span>${pending} Pending</span>
      </div>
    </div>
    <div class="sec-card">
      <h3 class="sec-card-title"><svg width="16" height="16"><use href="#ic-folder"/></svg> By Category</h3>
      ${catStats.map(c=>`<div style="margin-bottom:.875rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:.4rem;font-size:.85rem">
          <span style="font-weight:600">${c.name}</span>
          <span style="color:var(--t2);font-family:'JetBrains Mono',monospace;font-size:.78rem">${c.done}/${c.count}</span>
        </div>
        <div class="prog-bar"><div class="prog-fill" style="width:${c.count>0?(c.done/c.count)*100:0}%"></div></div>
      </div>`).join('')}
    </div>
    <div class="sec-card">
      <h3 class="sec-card-title"><svg width="16" height="16"><use href="#ic-alert"/></svg> By Priority</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-top:.5rem">
        <div style="text-align:center;padding:1.1rem .5rem;background:var(--raised);border-radius:12px;border:2px solid var(--rose)">
          <div style="font-size:1.6rem;color:var(--rose);font-weight:800;font-family:'JetBrains Mono',monospace">${pri.high}</div>
          <div style="font-size:.72rem;color:var(--t2);margin-top:.35rem;text-transform:uppercase;letter-spacing:.05em">High</div>
        </div>
        <div style="text-align:center;padding:1.1rem .5rem;background:var(--raised);border-radius:12px;border:2px solid var(--amber)">
          <div style="font-size:1.6rem;color:var(--amber);font-weight:800;font-family:'JetBrains Mono',monospace">${pri.medium}</div>
          <div style="font-size:.72rem;color:var(--t2);margin-top:.35rem;text-transform:uppercase;letter-spacing:.05em">Med</div>
        </div>
        <div style="text-align:center;padding:1.1rem .5rem;background:var(--raised);border-radius:12px;border:2px solid var(--jade)">
          <div style="font-size:1.6rem;color:var(--jade);font-weight:800;font-family:'JetBrains Mono',monospace">${pri.low}</div>
          <div style="font-size:.72rem;color:var(--t2);margin-top:.35rem;text-transform:uppercase;letter-spacing:.05em">Low</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════
//  CALENDAR
// ══════════════════════════════════════════
function updateCalendar(){
  const{calMonth:cm,calYear:cy}=S;
  const firstDay=new Date(cy,cm,1).getDay(),daysInMonth=new Date(cy,cm+1,0).getDate();
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const days=['S','M','T','W','T','F','S'];
  const today=new Date();
  let html=`<div class="pg">
    <div class="cal-nav">
      <button class="ibtn" onclick="changeMonth(-1)"><svg width="16" height="16" style="transform:rotate(180deg)"><use href="#ic-chevron-right"/></svg></button>
      <h2>${months[cm]} ${cy}</h2>
      <button class="ibtn" onclick="changeMonth(1)"><svg width="16" height="16"><use href="#ic-chevron-right"/></svg></button>
    </div>
    <div class="cal-grid">
      ${days.map(d=>`<div style="text-align:center;font-weight:700;color:var(--t2);padding:.4rem;font-size:.68rem;letter-spacing:.05em">${d}</div>`).join('')}`;
  for(let i=0;i<firstDay;i++)html+='<div class="cal-day" style="opacity:.1"></div>';
  for(let day=1;day<=daysInMonth;day++){
    const ds=new Date(cy,cm,day).toDateString();
    const isToday=ds===today.toDateString();
    const dt=S.tasks.filter(t=>new Date(t.dueDate).toDateString()===ds);
    html+=`<div class="cal-day ${isToday?'today':''} ${dt.length?'has-tasks':''}" onclick="showDayTasks(${cy},${cm},${day})">
      <div>${day}</div>
      ${dt.length?`<div style="position:absolute;bottom:2px;right:2px;font-size:.5rem;background:var(--accent);color:white;border-radius:50%;width:13px;height:13px;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace">${dt.length}</div>`:''}
    </div>`;
  }
  const selDay=cm===today.getMonth()&&cy===today.getFullYear()?today.getDate():1;
  const selT=S.tasks.filter(t=>new Date(t.dueDate).toDateString()===new Date(cy,cm,selDay).toDateString());
  html+=`</div>
    <div class="sec-card" style="margin-top:.875rem">
      <h3 class="sec-card-title" id="calDayTitle"><svg width="15" height="15"><use href="#ic-calendar"/></svg> ${cm===today.getMonth()&&cy===today.getFullYear()?"Today's Tasks":`${months[cm]} ${selDay}`}</h3>
      <div id="calDayTasks">${renderDayTasks(selT)}</div>
    </div>
  </div>`;
  $('calendarPage').innerHTML=html;
}

function renderDayTasks(tasks){
  if(!tasks.length)return`<div class="empty"><svg width="32" height="32"><use href="#ic-calendar"/></svg><p>No tasks for this day</p></div>`;
  return tasks.map(t=>`<div class="task-card priority-${t.priority}" style="margin-bottom:.6rem">
    <div class="task-hdr">
      <input type="checkbox" class="task-cb" ${t.completed?'checked':''} onchange="toggleTask('${t.id}')">
      <div class="task-body">
        <div class="task-title" style="${t.completed?'text-decoration:line-through;opacity:.4':''}">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="badge badge-cat">${esc(t.category)}</span>
          <span class="badge badge-${t.priority}">${t.priority}</span>
          <span>${new Date(t.dueDate).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
      </div>
    </div>
    <div class="task-actions">
      <button class="t-btn t-btn-edit" onclick="editTask('${t.id}')"><svg width="12" height="12"><use href="#ic-edit"/></svg> Edit</button>
      <button class="t-btn t-btn-del" onclick="deleteTask('${t.id}')"><svg width="12" height="12"><use href="#ic-trash"/></svg> Delete</button>
    </div>
  </div>`).join('');
}

window.changeMonth=(dir)=>{
  S.calMonth+=dir;
  if(S.calMonth>11){S.calMonth=0;S.calYear++;}
  else if(S.calMonth<0){S.calMonth=11;S.calYear--;}
  updateCalendar();
};
window.showDayTasks=(y,m,d)=>{
  const sd=new Date(y,m,d);
  const tasks=S.tasks.filter(t=>new Date(t.dueDate).toDateString()===sd.toDateString());
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const isToday=sd.toDateString()===new Date().toDateString();
  $('calDayTitle').innerHTML=`<svg width="15" height="15"><use href="#ic-calendar"/></svg> ${isToday?"Today's Tasks":`${months[m]} ${d}, ${y}`}`;
  $('calDayTasks').innerHTML=renderDayTasks(tasks);
};

// ══════════════════════════════════════════
//  CATEGORIES
// ══════════════════════════════════════════
function updateCategories(){
  const icons={Personal:'📱',Work:'💼',Shopping:'🛒',Study:'📚'};
  const data=S.categories.map(cat=>{const ct=S.tasks.filter(t=>t.category===cat);return{name:cat,icon:icons[cat]||'📁',total:ct.length,done:ct.filter(t=>t.completed).length};});
  $('categoriesPage').innerHTML=`<div class="pg">
    <div class="sec-card">
      <h3 class="sec-card-title"><svg width="16" height="16"><use href="#ic-folder"/></svg> All Categories</h3>
      ${data.map(c=>`<div class="cat-row" onclick="filterByCategory('${c.name}')">
        <div class="cat-info">
          <div style="font-size:1.5rem">${c.icon}</div>
          <div>
            <div style="font-weight:700;font-size:.875rem">${c.name}</div>
            <div style="font-size:.75rem;color:var(--t2);margin-top:.2rem">${c.done} done · ${c.total-c.done} pending</div>
          </div>
        </div>
        <div class="cat-count">${c.total}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

window.filterByCategory=(cat)=>{
  goTo('homePage');
  setTimeout(()=>{
    S.filter='all';
    document.querySelectorAll('.chip[data-filter]').forEach(c=>c.classList.remove('active'));
    const filtered=S.tasks.filter(t=>t.category===cat);
    $('tasksList').innerHTML=filtered.length?filtered.map(taskCardHTML).join(''):`<div class="empty"><svg width="36" height="36"><use href="#ic-folder"/></svg><h3>No ${cat} tasks</h3></div>`;
  },100);
};

// ══════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════
function updateSettings(){
  const cfg=JSON.parse(localStorage.getItem('tm_settings')||'{}');
  const theme=cfg.theme||'dark',notifs=cfg.notifications!==false,sound=cfg.sound!==false;
  $('settingsPage').innerHTML=`<div class="pg">
    <div class="stg-grp">
      <h3><svg width="15" height="15"><use href="#ic-sun"/></svg> Appearance</h3>
      <div class="stg-item" onclick="toggleTheme()">
        <div><div class="stg-lbl">Dark Mode</div><div class="stg-sub">Switch light / dark theme</div></div>
        <div class="toggle ${theme==='dark'?'on':''}" id="themeToggle"><div class="toggle-dot"></div></div>
      </div>
    </div>
    <div class="stg-grp">
      <h3><svg width="15" height="15"><use href="#ic-bell"/></svg> Notifications</h3>
      <div class="stg-item" onclick="toggleSetting('notifications')">
        <div><div class="stg-lbl">Push Notifications</div><div class="stg-sub">Upcoming task alerts</div></div>
        <div class="toggle ${notifs?'on':''}" id="notifsToggle"><div class="toggle-dot"></div></div>
      </div>
      <div class="stg-item" onclick="toggleSetting('sound')">
        <div><div class="stg-lbl">Sound Effects</div><div class="stg-sub">Action sounds</div></div>
        <div class="toggle ${sound?'on':''}" id="soundToggle"><div class="toggle-dot"></div></div>
      </div>
    </div>
    <div class="stg-grp">
      <h3>🔥 Streak</h3>
      <div class="pitem"><span>Current Streak</span><strong>${S.streak.current} day${S.streak.current!==1?'s':''}</strong></div>
      <div class="pitem"><span>Best Streak</span><strong>${S.streak.best} day${S.streak.best!==1?'s':''}</strong></div>
      <div class="stg-item" onclick="resetStreak()">
        <div><div class="stg-lbl" style="color:var(--rose)">Reset Streak</div><div class="stg-sub">Clear streak data</div></div>
        <svg width="16" height="16" style="color:var(--rose)"><use href="#ic-trash"/></svg>
      </div>
    </div>
    <div class="stg-grp">
      <h3><svg width="15" height="15"><use href="#ic-user"/></svg> Account</h3>
      <div class="stg-item" onclick="openEditProfile()">
        <div><div class="stg-lbl">Edit Profile</div><div class="stg-sub">Update name & info</div></div>
        <svg width="16" height="16" style="color:var(--t2)"><use href="#ic-chevron-right"/></svg>
      </div>
      <div class="stg-item" onclick="handleChangePwd()">
        <div><div class="stg-lbl">Change Password</div><div class="stg-sub">Send password reset email</div></div>
        <svg width="16" height="16" style="color:var(--t2)"><use href="#ic-chevron-right"/></svg>
      </div>
    </div>
    <div class="stg-grp">
      <h3><svg width="15" height="15"><use href="#ic-download"/></svg> Data</h3>
      <div class="stg-item" onclick="exportData()">
        <div><div class="stg-lbl">Export Data</div><div class="stg-sub">Download tasks as JSON</div></div>
        <svg width="16" height="16" style="color:var(--t2)"><use href="#ic-download"/></svg>
      </div>
      <div class="stg-item" onclick="clearAllData()">
        <div><div class="stg-lbl" style="color:var(--rose)">Clear All Data</div><div class="stg-sub">Delete all tasks permanently</div></div>
        <svg width="16" height="16" style="color:var(--rose)"><use href="#ic-trash"/></svg>
      </div>
    </div>
    <div class="stg-grp">
      <h3>About</h3>
      <div class="pitem"><span>Version</span><strong>2.1.0 PWA</strong></div>
      <div class="pitem"><span>Backend</span><strong>Firebase</strong></div>
      <div class="pitem"><span>User ID</span><strong style="font-family:'JetBrains Mono',monospace;font-size:.7rem">${S.user?.uid?.slice(0,12)}…</strong></div>
    </div>
  </div>`;
}

window.toggleTheme=()=>{
  const cfg=JSON.parse(localStorage.getItem('tm_settings')||'{}');
  cfg.theme=cfg.theme==='dark'?'light':'dark';
  localStorage.setItem('tm_settings',JSON.stringify(cfg));
  document.body.setAttribute('data-theme',cfg.theme);
  updateSettings();
};
window.toggleSetting=(k)=>{
  const cfg=JSON.parse(localStorage.getItem('tm_settings')||'{}');
  cfg[k]=!cfg[k];localStorage.setItem('tm_settings',JSON.stringify(cfg));updateSettings();
};
window.resetStreak=()=>{
  if(!confirm('Reset your streak data?'))return;
  resetStreakData();saveStreakData();renderStreakBanner();updateSettings();
};
window.handleChangePwd=async()=>{
  if(!confirm('Send password reset email to '+S.user.email+'?'))return;
  try{await sendPasswordResetEmail(auth,S.user.email);alert('Password reset email sent!');}
  catch(e){alert('Error: '+e.message);}
};
window.exportData=()=>{
  const blob=new Blob([JSON.stringify(S.tasks,null,2)],{type:'application/json'});
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'taskmaster-data.json'});
  a.click();
};
window.clearAllData=async()=>{
  if(!confirm('Delete ALL tasks? Cannot be undone!'))return;
  if(!confirm('Are you absolutely sure?'))return;
  showLoading();
  try{
    const q=query(collection(db,'tasks'),where('uid','==',S.user.uid));
    const snap=await getDocs(q);
    await Promise.all(snap.docs.map(d=>deleteDoc(d.ref)));
    alert('All tasks deleted!');
  }catch(e){alert('Error: '+e.message);}
  hideLoading();
};

function setupTheme(){const cfg=JSON.parse(localStorage.getItem('tm_settings')||'{}');document.body.setAttribute('data-theme',cfg.theme||'dark');}

// ══════════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════════
function setupEvents(){
  // Photo input
  const fileInp=$('photoFileInput');
  if(fileInp){
    fileInp.addEventListener('change',async(e)=>{
      const file=e.target.files[0];if(!file)return;
      if(file.size>8*1024*1024){showAlert('editProfileAlert','Image too large. Max 8MB.');return;}
      try{
        const dataURL=await compressImage(file);
        pendingPhotoDataURL=dataURL;
        const prev=$('editAvatarPreview');
        prev.innerHTML=`<img src="${dataURL}" alt="preview">`;
        $('removePhotoBtn').classList.remove('hidden');
      }catch(err){showAlert('editProfileAlert','Could not read image.');}
      fileInp.value='';
    });
  }

  // Auth
  $('loginBtn').addEventListener('click',handleLogin);
  $('loginEmail').addEventListener('keydown',e=>e.key==='Enter'&&handleLogin());
  $('loginPassword').addEventListener('keydown',e=>e.key==='Enter'&&handleLogin());
  $('signupBtn').addEventListener('click',handleSignup);
  $('googleLoginBtn').addEventListener('click',handleGoogleLogin);
  $('googleSignupBtn').addEventListener('click',handleGoogleLogin);
  $('sendResetOtpBtn').addEventListener('click',handleForgotPassword);
  $('resendVerifyBtn').addEventListener('click',()=>showScreen('loginScreen'));
  $('logoutBtn').addEventListener('click',handleLogout);
  $('showSignup').addEventListener('click',e=>{e.preventDefault();showScreen('signupScreen');});
  $('showLogin').addEventListener('click',e=>{e.preventDefault();showScreen('loginScreen');});
  $('showLogin2').addEventListener('click',e=>{e.preventDefault();showScreen('loginScreen');});
  $('showForgotPassword').addEventListener('click',e=>{e.preventDefault();showScreen('forgotPasswordScreen');});
  $('backToLogin').addEventListener('click',e=>{e.preventDefault();showScreen('loginScreen');});

  // App nav
  $('menuBtn').addEventListener('click',toggleSidebar);
  $('sidebarOverlay').addEventListener('click',toggleSidebar);
  document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>goTo(el.dataset.page)));
  document.querySelectorAll('.bnav-btn').forEach(el=>el.addEventListener('click',()=>goTo(el.dataset.page)));

  // Tasks
  $('addTaskBtn').addEventListener('click',()=>openTaskModal());
  $('saveTaskBtn').addEventListener('click',saveTask);
  $('closeModal').addEventListener('click',closeTaskModal);
  $('taskModal').addEventListener('click',e=>{if(e.target.id==='taskModal')closeTaskModal();});

  // Notif
  $('notifBtn').addEventListener('click',()=>$('notifPanel').classList.toggle('active'));
  $('closeNotifPanel').addEventListener('click',()=>$('notifPanel').classList.remove('active'));

  // Search
  $('searchBtn').addEventListener('click',openSearch);
  $('searchInput').addEventListener('input',handleSearch);
  $('searchModal').addEventListener('click',e=>{if(e.target.id==='searchModal')closeSearch();});

  // Filters
  document.querySelectorAll('.chip[data-filter]').forEach(c=>c.addEventListener('click',()=>{
    S.filter=c.dataset.filter;
    document.querySelectorAll('.chip[data-filter]').forEach(x=>x.classList.toggle('active',x===c));
    renderTasks();
  }));
  $('sortSelect').addEventListener('change',e=>{S.sort=e.target.value;renderTasks();});

  // Profile
  $('closeEditProfile').addEventListener('click',closeEditProfile);
  $('saveProfileBtn').addEventListener('click',saveProfile);
  $('editProfileModal').addEventListener('click',e=>{if(e.target.id==='editProfileModal')closeEditProfile();});
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  setupTheme();
  setupPWA();
  setupEvents();

  // Handle streak check messages from Service Worker (background sync / midnight)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message', e => {
      if(e.data?.type === 'CHECK_STREAK' && S.user){
        evaluateStreak();
      }
    });
  }
  onAuthStateChanged(auth,async(fu)=>{
    if(fu){
      S.user=await loadProfile(fu);
      subscribeToTasks(fu.uid);
      showApp();
    }else{
      if(S.unsubTasks){S.unsubTasks();S.unsubTasks=null;}
      if(streakPollTimer){clearInterval(streakPollTimer);streakPollTimer=null;}
      S.user=null;S.tasks=[];
      $('appContainer').classList.remove('active');
      showScreen('loginScreen');
    }
  });
});
