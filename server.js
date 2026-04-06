const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const db = new Database("database.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partida TEXT NOT NULL,
    jogador TEXT NOT NULL,
    tipoEvento TEXT NOT NULL,
    minuto INTEGER NOT NULL,
    observacao TEXT
  )
`);

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/evento", (req, res) => {
  res.render("evento");
});

app.post("/evento", (req, res) => {
  try {
    const { partida, jogador, tipoEvento, minuto, observacao } = req.body;

    const stmt = db.prepare(`
      INSERT INTO eventos (partida, jogador, tipoEvento, minuto, observacao)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      partida,
      jogador,
      tipoEvento,
      Number(minuto),
      observacao || ""
    );

    res.redirect("/eventos");
  } catch (error) {
    console.error("Erro ao salvar evento:", error);
    res.status(500).send("Erro ao salvar evento.");
  }
});

app.get("/eventos", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM eventos ORDER BY id DESC");
    const eventos = stmt.all();

    res.render("eventos", { eventos });
  } catch (error) {
    console.error("Erro ao buscar eventos:", error);
    res.status(500).send("Erro ao buscar eventos.");
  }
});

app.get("/ranking", (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT jogador, COUNT(*) AS gols
      FROM eventos
      WHERE tipoEvento = 'Gol'
      GROUP BY jogador
      ORDER BY gols DESC, jogador ASC
    `);

    const ranking = stmt.all();

    res.render("ranking", { ranking });
  } catch (error) {
    console.error("Erro ao buscar ranking:", error);
    res.status(500).send("Erro ao buscar ranking.");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});