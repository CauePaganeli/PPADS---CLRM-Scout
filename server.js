const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const db = new sqlite3.Database("./database.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partida TEXT,
      jogador TEXT,
      tipoEvento TEXT,
      minuto INTEGER,
      observacao TEXT
    )
  `);
});

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/evento", (req, res) => {
  res.render("evento");
});

app.post("/evento", (req, res) => {
  const { partida, jogador, tipoEvento, minuto, observacao } = req.body;

  db.run(
    `INSERT INTO eventos (partida, jogador, tipoEvento, minuto, observacao)
     VALUES (?, ?, ?, ?, ?)`,
    [partida, jogador, tipoEvento, minuto, observacao],
    (err) => {
      if (err) return res.send("Erro ao salvar");
      res.redirect("/eventos");
    }
  );
});

app.get("/eventos", (req, res) => {
  db.all("SELECT * FROM eventos", [], (err, rows) => {
    if (err) return res.send("Erro ao buscar eventos");
    res.render("eventos", { eventos: rows });
  });
});

app.get("/ranking", (req, res) => {
  db.all(
    `SELECT jogador, COUNT(*) as gols
     FROM eventos
     WHERE tipoEvento = 'Gol'
     GROUP BY jogador
     ORDER BY gols DESC`,
    [],
    (err, rows) => {
      if (err) return res.send("Erro ao buscar ranking");
      res.render("ranking", { ranking: rows });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});