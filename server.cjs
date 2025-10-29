// === VARIABILI GLOBALI ===
let currentUser = null;
let currentFolder = null;
let currentList = null;
let socket;

// === FUNZIONI UTILI ===
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }
function el(tag, cls) { const e=document.createElement(tag); if(cls) e.className=cls; return e; }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function escapeHtml(s){return (s+'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function getCheckboxState() { return qs('#alignNumbers')?.checked || false; } // Nuova funzione

function msg(text,type='warn'){
  const area=qs('#message');
  if(!text){area.innerHTML='';return;}
  area.innerHTML=`<div class="${type}">${text}</div>`;
}

// === AUTENTICAZIONE ===
function openAuthModal(tab='login'){
  show(qs('#modalAuth'));
  switchTab(tab);
}
function closeAuthModal(){ hide(qs('#modalAuth')); }
function switchTab(tab){
  qsa('#authTabs .tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  qs('#formLogin').classList.toggle('hidden',tab!=='login');
  qs('#formRegister').classList.toggle('hidden',tab!=='register');
}

qs('#btnLogin').onclick=()=>openAuthModal('login');
qs('#btnRegister').onclick=()=>openAuthModal('register');
qsa('#authTabs .tab').forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
qsa('[data-action="close"]').forEach(b=>b.onclick=closeAuthModal);
qs('#btnRecover').onclick = async () => {
  const email = prompt('Inserisci la tua email per recuperare la password:');
  if (!email) return;
  const res = await fetch('/auth/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (res.ok) alert(data.message);
  else alert(data.error || 'Errore durante il recupero password');
};


qs('#formLogin').onsubmit=async e=>{
  e.preventDefault();
  const email=qs('#loginEmail').value, password=qs('#loginPassword').value;
  const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const data=await r.json();
  if(!r.ok) return alert(data.error||'Errore login');
  
  // Controllo essenziale dopo login
  if (data.token) {
    localStorage.setItem('token', data.token);
    
    // Esegui autologin per prendere i dati utente
    const userCheck = await fetch('/auth/me', { headers: { Authorization: `Bearer ${data.token}` } });
    if (userCheck.ok) {
      currentUser = await userCheck.json();
      afterLogin();
      closeAuthModal();
    } else {
      alert('Login riuscito ma non posso caricare i dati utente. Riprova.');
      localStorage.removeItem('token');
    }
  } else {
    alert(data.error || 'Errore login, nessun token ricevuto.');
  }
};

qs('#formRegister').onsubmit=async e=>{
  e.preventDefault();
  const username=qs('#regUsername').value, email=qs('#regEmail').value, password=qs('#regPassword').value;
  const r=await fetch('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,email,password})});
  const data=await r.json();
  if(!r.ok) return alert(data.error||'Errore registrazione');
  alert('Registrato! Controlla la tua email per la verifica. Ora puoi accedere.');
  switchTab('login');
};

qs('#btnLogout').onclick=async()=>{
  await fetch('/auth/logout', { method: 'POST' }); // Invia richiesta di logout al server
  localStorage.removeItem('token');
  currentUser=null;
  hide(qs('#userMenu'));
  show(qs('#userArea'));
  // Pulisci la sidebar
  qs('#foldersList').innerHTML = '';
  qs('#listsList').innerHTML = '';
  currentFolder = null;
  currentList = null;
  // Pulisci l'editor
  qs('#listTitle').value = '';
  qs('#box1').value = '';
  qs('#box2').value = '';
  qs('#cards').innerHTML = '';
  msg('');
};

// === DOPO LOGIN ===
function afterLogin(){
  hide(qs('#userArea'));
  show(qs('#userMenu'));
  qs('#usernameLabel').textContent=currentUser.username;
  socket.emit('join',currentUser.id);
  loadFolders();
}

// === SOCKET.IO ===
function initSocket(){
  socket=io();
  socket.on('connect',()=>console.log('socket connected'));
  socket.on('lists:updated',loadLists);
}

// === FETCH WRAPPER ===
async function api(path,method='GET',body){
  const token=localStorage.getItem('token');
  const res=await fetch(path,{
    method,
    headers:{'Content-Type':'application/json','Authorization':token?`Bearer ${token}`:''},
    body:body?JSON.stringify(body):undefined
  });
  if(res.status===401){ alert('Sessione scaduta'); localStorage.removeItem('token'); location.reload(); }
  return res.json();
}

// === CARTELLE ===
async function loadFolders(){
  const data=await api('/api/folders');
  const ul=qs('#foldersList'); ul.innerHTML='';
  data.forEach(f=>{
    const li=qs('#tplFolderItem').content.cloneNode(true);
    const nameEl = li.querySelector('.name');
    nameEl.textContent=f.name;
    nameEl.onclick=()=>{currentFolder=f;loadLists();};
    li.querySelector('.rename').onclick=()=>renameFolder(f);
    li.querySelector('.del').onclick=()=>deleteFolder(f);
    ul.appendChild(li);
  });
}
qs('#btnNewFolder').onclick=async()=>{
  const name=prompt('Nome cartella:'); if(!name) return;
  await api('/api/folders','POST',{name});
  loadFolders();
};
async function renameFolder(f){
  const name=prompt('Nuovo nome:',f.name); if(!name) return;
  await api(`/api/folders/${f.id}`,'PUT',{name});
  loadFolders();
}
async function deleteFolder(f){
  if(!confirm('Eliminare cartella? Verranno eliminate anche tutte le liste in essa contenute.')) return;
  await api(`/api/folders/${f.id}`,'DELETE');
  loadFolders();
}

// === LISTE ===
async function loadLists(){
  if(!currentFolder) return;
  const data=await api(`/api/folders/${currentFolder.id}/lists`);
  const ul=qs('#listsList'); ul.innerHTML='';
  data.forEach(l=>{
    const li=qs('#tplListItem').content.cloneNode(true);
    const nameEl = li.querySelector('.name');
    nameEl.textContent=l.name;
    nameEl.onclick=()=>openList(l);
    li.querySelector('.open').onclick=()=>openList(l);
    li.querySelector('.rename').onclick=()=>renameList(l);
    li.querySelector('.del').onclick=()=>deleteList(l);
    ul.appendChild(li);
  });
}
qs('#btnNewList').onclick=async()=>{
  if(!currentFolder) return alert('Seleziona una cartella');
  const name=prompt('Nome lista:'); if(!name) return;
  await api(`/api/folders/${currentFolder.id}/lists`,'POST',{name});
  loadLists();
};
async function renameList(l){
  const name=prompt('Nuovo nome:',l.name); if(!name) return;
  await api(`/api/lists/${l.id}`,'PUT',{name});
  loadLists();
}
async function deleteList(l){
  if(!confirm('Eliminare lista?')) return;
  await api(`/api/lists/${l.id}`,'DELETE');
  loadLists();
}

async function openList(l){
  currentList=l;
  qs('#listTitle').value=l.name;
  const data=await api(`/api/lists/${l.id}`);
  // Riporta i dati senza numerazione per rispettare la struttura DB
  qs('#box1').value=data.front.join('\n'); 
  qs('#box2').value=data.back.join('\n');
  
  // Applica subito la numerazione e genera le carte
  updateBoxNumbers(qs('#box1'));
  updateBoxNumbers(qs('#box2'));
  generateCards();
}

// === LOGICA AGGIORNATA PER L'ALLINEAMENTO ===
function splitLines(text){
  const lines = text.split(/\n/);
  
  // Se il flag di allineamento è attivo, manteniamo le righe vuote e i numeri, 
  // ma rimuoviamo la numerazione esplicita per avere solo il contenuto.
  if (getCheckboxState()) {
    return lines.map(l => l.trim().replace(/^\d+\.\s*/, ''));
  }
  
  // Comportamento predefinito: filtra le righe vuote e rimuovi la numerazione
  return lines.map(l => l.trim().replace(/^\d+\.\s*/, ''))
             .filter(Boolean);
}

// === FUNZIONE DI UTILITY ESTERNA per la cancellazione (FIX BUG) ===
function deleteCardAndLines(cardElement, index) {
  // 1. Rimuovi la flashcard dall'interfaccia
  cardElement.remove();

  // 2. Prendi il contenuto grezzo dei box
  let box1Content = qs('#box1').value.split('\n');
  let box2Content = qs('#box2').value.split('\n');
  
  // Otteniamo gli array delle righe che verranno usate per generare le carte
  const effectiveLines1 = splitLines(qs('#box1').value);
  const effectiveLines2 = splitLines(qs('#box2').value);

  if (index >= effectiveLines1.length || index >= effectiveLines2.length) return;

  // Trova l'indice della riga da rimuovere nell'array *originale* del box
  let lineToRemove1 = -1;
  let currentEffectiveIndex1 = -1;
  for(let i=0; i<box1Content.length; i++) {
    // Verifica se la riga corrente contribuisce alle "effectiveLines"
    if (box1Content[i].trim() !== '') {
      currentEffectiveIndex1++;
      if (currentEffectiveIndex1 === index) {
        lineToRemove1 = i;
        break;
      }
    }
  }

  let lineToRemove2 = -1;
  let currentEffectiveIndex2 = -1;
  for(let i=0; i<box2Content.length; i++) {
    if (box2Content[i].trim() !== '') {
      currentEffectiveIndex2++;
      if (currentEffectiveIndex2 === index) {
        lineToRemove2 = i;
        break;
      }
    }
  }

  // 4. Esegui lo splice sulle linee originali (mantenendo le righe vuote intermedie se presenti)
  if(lineToRemove1 !== -1) box1Content.splice(lineToRemove1, 1);
  if(lineToRemove2 !== -1) box2Content.splice(lineToRemove2, 1);
  
  // 5. Riscrivi i contenuti dei box
  qs('#box1').value = box1Content.join('\n');
  qs('#box2').value = box2Content.join('\n');
  
  // 6. Ricalcola la numerazione e rigenera le flashcards
  updateBoxNumbers(qs('#box1'));
  updateBoxNumbers(qs('#box2'));
  generateCards(); 
}

// === GENERATORE FLASHCARDS ===
function generateCards(){
  const t1 = qs('#box1').value;
  const t2 = qs('#box2').value;
  
  // Usiamo la splitLines aggiornata
  let arr1 = splitLines(t1);
  let arr2 = splitLines(t2);
  
  // Se la modalità Allinea è attiva, filtra le righe vuote in modo che non vengano generate carte per esse.
  // Questo è necessario perché splitLines ritorna le righe vuote se il checkbox è spuntato.
  if (getCheckboxState()) {
    // Troviamo la lunghezza massima effettiva, ignorando le righe che sono vuote in entrambi i box
    const maxLen = Math.max(arr1.length, arr2.length);
    
    const effectiveCards = [];
    for (let i = 0; i < maxLen; i++) {
      const f = arr1[i] || '';
      const b = arr2[i] || '';
      // Genera carta solo se ALMENO uno dei due lati non è vuoto.
      if (f.trim() !== '' || b.trim() !== '') {
        effectiveCards.push({front: f, back: b, sourceIndex: i});
      }
    }
    arr1 = effectiveCards.map(c => c.front);
    arr2 = effectiveCards.map(c => c.back);

    // Messaggio di avviso solo se la lunghezza dei *contenuti* non corrisponde
    if (arr1.length !== arr2.length) {
      msg(`Attenzione: numero di flashcards generate diverso! Fronte: ${arr1.length}, Retro: ${arr2.length}. Controlla le righe vuote.`);
    } else {
      msg('');
    }
  } else {
    // Comportamento predefinito: controlla la lunghezza dei risultati filtrati
    if (arr1.length !== arr2.length) {
      msg(`Attenzione: numero di righe con contenuto diverso! Fronte: ${arr1.length}, Retro: ${arr2.length}`);
    } else {
      msg('');
    }
  }


  const n = Math.min(arr1.length, arr2.length);
  const cards = qs('#cards');
  cards.innerHTML = '';

  for (let i = 0; i < n; i++) {
    const front = arr1[i];
    const back  = arr2[i];

    const c = el('div', 'card');
    c.innerHTML = `
      <button class="delCard">X</button>
      <div class="card-inner">
        <div class="face front">${escapeHtml(front)}</div>
        <div class="face back">${escapeHtml(back)}</div>
      </div>
    `;

    // Click per girare la carta
    c.querySelector('.card-inner').onclick = () => c.classList.toggle('flipped');

    // Click su X per cancellare la carta e la riga corrispondente (usa la funzione FIX)
    c.querySelector('.delCard').onclick = (e) => {
      e.stopPropagation(); // evita flip
      deleteCardAndLines(c, i); // Passa l'indice della carta generata
    };

    cards.appendChild(c);
  }
  if (n === 0 && (t1.trim() || t2.trim())) msg('Nessuna carta generata. Controlla che i box non siano vuoti o che le righe abbiano corrispondenza.');
  else if (!getCheckboxState() && arr1.length !== arr2.length) {
    // Mantieni il messaggio di avviso se le lunghezze non corrispondono in modalità predefinita
  } else if (n > 0) {
    msg(''); // Pulisce i messaggi di avviso precedenti se ha successo
  }
}

// === BOTTONE GENERA / PREVIEW / RESET ===
qs('#btnGenerate').onclick = generateCards;
qs('#btnPreview').onclick = generateCards;
qs('#btnResetCards').onclick = () => {
  qs('#cards').innerHTML = '';
  msg('');
};

// === SALVATAGGIO LISTA ===
qs('#btnSaveList').onclick=async()=>{
  if(!currentFolder) return alert('Seleziona una cartella');
  const name=qs('#listTitle').value.trim()||'Senza nome';
  // Al salvataggio usiamo la funzione splitLines in modalità predefinita (senza allineamento)
  // per salvare solo le righe con contenuto.
  // Passiamo false per forzare il comportamento predefinito
  const front = qs('#box1').value.split(/\n+/).map(l => l.trim().replace(/^\d+\.\s*/, '')).filter(Boolean);
  const back = qs('#box2').value.split(/\n+/).map(l => l.trim().replace(/^\d+\.\s*/, '')).filter(Boolean);

  if(front.length !== back.length) {
    if (!confirm(`Attenzione! I lati Fronte (${front.length}) e Retro (${back.length}) hanno un numero di contenuti diverso. Vuoi salvare comunque solo i contenuti allineati?`)) {
      return;
    }
  }
  
  // Limita la lunghezza al minimo per il salvataggio
  const n = Math.min(front.length, back.length);
  
  const payload = {
    name,
    front: front.slice(0, n),
    back: back.slice(0, n)
  };
  
  if(currentList)
    await api(`/api/lists/${currentList.id}`,'PUT', payload);
  else {
    const newList = await api(`/api/folders/${currentFolder.id}/lists`,'POST', payload);
    currentList = newList; // Imposta la lista corrente
  }
  alert('Lista salvata!');
  loadLists();
};

// === EXPORT / IMPORT ===
qs('#btnExport').onclick=async()=>{
  if(!currentList) return alert('Nessuna lista aperta o salvata');
  const res=await fetch(`/api/lists/${currentList.id}/export`);
  const blob=await res.blob();
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=currentList.name+'.json';
  a.click();
};

qs('#btnImport').onclick=()=>qs('#fileImport').click();
qs('#fileImport').onchange=async e=>{
  const file=e.target.files[0]; if(!file) return;
  const text=await file.text();
  try {
    const data=JSON.parse(text);
    if(!currentFolder) return alert('Seleziona una cartella prima di importare');
    if (!data.name || !Array.isArray(data.front) || !Array.isArray(data.back)) {
      return alert('File JSON non valido per l\'importazione. Assicurati che contenga "name", "front" e "back".');
    }
    await api(`/api/folders/${currentFolder.id}/lists`,'POST',data);
    alert('Import completato!');
    loadLists();
  } catch (error) {
    alert('Errore di parsing del file JSON.');
  }
  // Resetta l'input file per consentire l'importazione successiva dello stesso file
  e.target.value = ''; 
};

// === AVVIO ===
window.addEventListener('DOMContentLoaded',()=>{
  initSocket();
  const token=localStorage.getItem('token');
  if(token){
    // Usa /auth/me per verificare il token e ottenere i dati utente
    fetch('/auth/me',{headers:{Authorization:`Bearer ${token}`}})
      .then(r=>{
        if(r.ok) return r.json();
        throw new Error('Token non valido');
      })
      .then(d=>{
        currentUser=d;
        afterLogin();
      })
      .catch(e=>{
        console.error('Auto-login fallito', e);
        localStorage.removeItem('token');
      });
  }

  // Funzione di utilità per numerazione
  function updateBoxNumbers(box){
    // Conserva tutte le righe, anche quelle vuote, per non perdere la spaziatura
    const lines = box.value.split('\n');
    let counter = 1;
    
    box.value = lines.map(line => {
      // Pulisce la riga da numerazione precedente (es. "1. Testo" -> "Testo")
      const content = line.trim().replace(/^\d+\.\s*/, ''); 
      
      if (content === '') {
        return ''; // Mantiene la riga vuota
      } else {
        return `${counter++}. ${content}`;
      }
    }).join('\n');
  }
  
  // Applica quando l'utente esce dal box e rigenera le carte per aggiornare la visualizzazione
  qs('#box1').addEventListener('blur', ()=>{ updateBoxNumbers(qs('#box1')); generateCards(); });
  qs('#box2').addEventListener('blur', ()=>{ updateBoxNumbers(qs('#box2')); generateCards(); });
  
  // Rigenera le carte ogni volta che si cambia lo stato del checkbox
  qs('#alignNumbers').addEventListener('change', generateCards);

});
