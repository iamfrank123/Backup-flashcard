const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Mailjet = require('node-mailjet');

const router = express.Router();

// ATTENZIONE: Se non esiste, crea la cartella 'data' nella root del progetto
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SECRET = 'supersecretkey'; // Usa una chiave segreta robusta in produzione

// === FILE FUNCTIONS ===
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// === MAILJET CLIENT (ATTENZIONE: CAMBIA CON LE TUE CHIAVI) ===
const mailjet = Mailjet.apiConnect(
  'c07a08a60161be9bafcadab355f4dc3f', // API Key pubblica
  '07a3d302f2a173dd097be3728e4f04ce'  // API Key privata (secret)
);

function sendMail(toEmail, subject, text, html) {
  return mailjet.post("send", {'version':'v3.1'}).request({
    Messages: [{
      From: { Email: "smart.flashcards@mail.com", Name: "Smart Flashcards" },
      To: [{ Email: toEmail }],
      Subject: subject,
      TextPart: text,
      HTMLPart: html
    }]
  });
}

// === GENERA TOKEN JWT ===
function generateToken(user) {
  // Inseriamo tutti i dati essenziali nel payload
  return jwt.sign({ id: user.id, email: user.email, username: user.username }, SECRET, { expiresIn: '7d' });
}

// === REGISTRAZIONE ===
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const users = readUsers();

  if (users.some(u => u.email === email)) {
    return res.status(400).json({ error: 'Email già registrata' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const user = {
    id: Date.now().toString(),
    username,
    email,
    password: hashed,
    verified: false
  };
  users.push(user);
  writeUsers(users);

  // ATTENZIONE: Cambia l'URL base con il tuo dominio Render.com definitivo
  const verifyLink = `https://smart-flashcards-app.onrender.com/auth/verify/${user.id}`;
  await sendMail(email, 
    "Verifica Email — Smart Flashcards", 
    `Clicca qui per verificare la tua email: ${verifyLink}`, 
    `<p>Clicca per verificare la tua email: <a href="${verifyLink}">${verifyLink}</a></p>`
  );

  res.json({ message: 'Registrazione completata. Controlla la tua email per confermare.' });
});

// === VERIFICA EMAIL ===
router.get('/verify/:id', (req,res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(400).send('Utente non trovato.');
  user.verified = true;
  writeUsers(users);
  res.send('✅ Email verificata! Ora puoi accedere.');
});

// === LOGIN (MODIFICATO per restituire il token) ===
router.post('/login', (req,res) => {
  const { email, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Utente non trovato' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Password errata' });
  if (!user.verified) return res.status(400).json({ error: 'Email non verificata' });

  const token = generateToken(user);
  
  // Restituisce il token al frontend per salvarlo in localStorage
  res.json({ message: 'Login riuscito', token: token }); 
});

// === LOGOUT (MODIFICATO per operare lato client) ===
router.post('/logout', (req,res) => {
  // La pulizia effettiva del token avviene lato client (localStorage). 
  // Questa risposta serve solo per confermare l'operazione.
  res.json({ message: 'Logout eseguito' });
});

// === RESET PASSWORD: INVIO EMAIL ===
router.post('/forgot', async (req,res) => {
  const { email } = req.body;
  const users = readUsers();
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Utente non trovato' });

  const resetToken = jwt.sign({ id: user.id }, SECRET, { expiresIn: '1h' });
  // ATTENZIONE: Cambia l'URL base con il tuo dominio Render.com definitivo
  const resetLink = `https://smart-flashcards-app.onrender.com/auth/reset/${resetToken}`; 
  await sendMail(email, 
    "Recupero password — Smart Flashcards", 
    `Clicca qui per reimpostare la password: ${resetLink}`,
    `<p>Clicca per reimpostare la password: <a href="${resetLink}">${resetLink}</a></p>`
  );
  res.json({ message: 'Email di recupero inviata' });
});

// === RESET PASSWORD: NUOVA PASSWORD ===
router.post('/reset/:token', (req,res) => {
  const { password } = req.body;
  try {
    const decoded = jwt.verify(req.params.token, SECRET);
    const users = readUsers();
    const user = users.find(u => u.id === decoded.id);
    if (!user) return res.status(400).json({ error: 'Utente non trovato' });
    user.password = bcrypt.hashSync(password, 10);
    writeUsers(users);
    res.json({ message: 'Password aggiornata con successo' });
  } catch {
    res.status(400).json({ error: 'Token non valido o scaduto' });
  }
});

module.exports = router;
