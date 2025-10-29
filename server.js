// server.js aggiornato con MongoDB + JWT e dotenv
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config(); // carica variabili da .env

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET; // da .env
const MONGO_URI = process.env.MONGO_URI;   // da .env

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// --- SCHEMI MONGODB ---
const flashcardSchema = new mongoose.Schema({
  question: String,
  answer: String,
  category: String,
});

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  flashcards: [flashcardSchema],
});

const User = mongoose.model("User", userSchema);

// --- MIDDLEWARE AUTENTICAZIONE JWT ---
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Bearer <token>
  if (!token) return res.status(401).json({ message: "Access denied" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

// --- CONNESSIONE MONGODB ---
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connesso"))
  .catch((err) => console.error("Errore connessione MongoDB:", err));

// --- ENDPOINTS ---
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "./public" });
});

// REGISTRAZIONE
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email e password richieste" });

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const newUser = new User({ email, password: hashedPassword, flashcards: [] });
    await newUser.save();
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ token });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Email già registrata" });
    }
    res.status(500).json({ message: "Errore server" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email e password richieste" });

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "Utente non trovato" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ message: "Password errata" });

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token });
});

// OTTIENI FLASHCARDS
app.get("/flashcards", authenticateToken, async (req, res) => {
  const user = await User.findOne({ email: req.user.email });
  if (!user) return res.status(404).json({ message: "Utente non trovato" });
  res.json(user.flashcards);
});

// AGGIUNGI FLASHCARD
app.post("/flashcards", authenticateToken, async (req, res) => {
  const { question, answer, category } = req.body;
  if (!question || !answer) return res.status(400).json({ message: "Dati mancanti" });

  const user = await User.findOne({ email: req.user.email });
  user.flashcards.push({ question, answer, category });
  await user.save();
  res.json(user.flashcards);
});

// MODIFICA FLASHCARD
app.put("/flashcards/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { question, answer, category } = req.body;

  const user = await User.findOne({ email: req.user.email });
  const flashcard = user.flashcards.id(id);
  if (!flashcard) return res.status(404).json({ message: "Flashcard non trovata" });

  flashcard.question = question ?? flashcard.question;
  flashcard.answer = answer ?? flashcard.answer;
  flashcard.category = category ?? flashcard.category;
  await user.save();
  res.json(user.flashcards);
});

// CANCELLA FLASHCARD
app.delete("/flashcards/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const user = await User.findOne({ email: req.user.email });
  const flashcard = user.flashcards.id(id);
  if (!flashcard) return res.status(404).json({ message: "Flashcard non trovata" });

  flashcard.remove();
  await user.save();
  res.json(user.flashcards);
});

// --- AVVIO SERVER ---
app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
