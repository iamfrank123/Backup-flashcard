// script.js aggiornato per JWT e backend MongoDB

const API_URL = ""; // lascia vuoto se backend è sullo stesso dominio
let token = localStorage.getItem("token") || null;

// ELEMENTI DOM
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const flashcardsContainer = document.getElementById("flashcardsContainer");
const addFlashcardForm = document.getElementById("addFlashcardForm");

// --- FUNZIONE FETCH CON TOKEN ---
async function authFetch(url, options = {}) {
  if (!options.headers) options.headers = {};
  if (token) options.headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    logout();
    alert("Sessione scaduta. Effettua di nuovo il login.");
    throw new Error("Unauthorized");
  }
  return res.json();
}

// --- LOGIN ---
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    try {
      const data = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).then((res) => res.json());

      if (data.token) {
        token = data.token;
        localStorage.setItem("token", token);
        loginForm.style.display = "none";
        loadFlashcards();
      } else {
        alert(data.message || "Errore login");
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// --- REGISTRAZIONE ---
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = registerForm.email.value;
    const password = registerForm.password.value;
    try {
      const data = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).then((res) => res.json());

      if (data.token) {
        token = data.token;
        localStorage.setItem("token", token);
        registerForm.style.display = "none";
        loadFlashcards();
      } else {
        alert(data.message || "Errore registrazione");
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// --- LOGOUT ---
function logout() {
  token = null;
  localStorage.removeItem("token");
  location.reload();
}

// --- CARICA FLASHCARDS ---
async function loadFlashcards() {
  try {
    const flashcards = await authFetch(`${API_URL}/flashcards`);
    displayFlashcards(flashcards);
  } catch (err) {
    console.error(err);
  }
}

// --- MOSTRA FLASHCARDS ---
function displayFlashcards(flashcards) {
  flashcardsContainer.innerHTML = "";
  flashcards.forEach((fc) => {
    const div = document.createElement("div");
    div.className = "flashcard";
    div.innerHTML = `
      <strong>${fc.question}</strong>
      <p>${fc.answer}</p>
      <button onclick="editFlashcard('${fc._id}')">Modifica</button>
      <button onclick="deleteFlashcard('${fc._id}')">Elimina</button>
    `;
    flashcardsContainer.appendChild(div);
  });
}

// --- AGGIUNGI FLASHCARD ---
if (addFlashcardForm) {
  addFlashcardForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = addFlashcardForm.question.value;
    const answer = addFlashcardForm.answer.value;
    const category = addFlashcardForm.category?.value || "";
    try {
      const flashcards = await authFetch(`${API_URL}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, category }),
      });
      displayFlashcards(flashcards);
      addFlashcardForm.reset();
    } catch (err) {
      console.error(err);
    }
  });
}

// --- MODIFICA FLASHCARD ---
async function editFlashcard(id) {
  const question = prompt("Nuova domanda:");
  const answer = prompt("Nuova risposta:");
  if (!question && !answer) return;
  try {
    const flashcards = await authFetch(`${API_URL}/flashcards/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer }),
    });
    displayFlashcards(flashcards);
  } catch (err) {
    console.error(err);
  }
}

// --- CANCELLA FLASHCARD ---
async function deleteFlashcard(id) {
  if (!confirm("Eliminare questa flashcard?")) return;
  try {
    const flashcards = await authFetch(`${API_URL}/flashcards/${id}`, {
      method: "DELETE",
    });
    displayFlashcards(flashcards);
  } catch (err) {
    console.error(err);
  }
}

// --- CARICAMENTO INIZIALE ---
if (token) {
  loadFlashcards();
}
