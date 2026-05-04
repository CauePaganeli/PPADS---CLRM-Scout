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

// =========================
// CRIAÇÃO DAS TABELAS
// =========================
db.exec(`
  CREATE TABLE IF NOT EXISTS campeonatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS times (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS jogadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    time_id INTEGER NOT NULL,
    FOREIGN KEY (time_id) REFERENCES times(id)
  );

  CREATE TABLE IF NOT EXISTS partidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL UNIQUE,
    campeonato_id INTEGER NOT NULL,
    mandante_id INTEGER NOT NULL,
    visitante_id INTEGER NOT NULL,
    FOREIGN KEY (campeonato_id) REFERENCES campeonatos(id),
    FOREIGN KEY (mandante_id) REFERENCES times(id),
    FOREIGN KEY (visitante_id) REFERENCES times(id)
  );

  CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partida_id INTEGER NOT NULL,
    jogador_id INTEGER NOT NULL,
    time_id INTEGER NOT NULL,
    tipoEvento TEXT NOT NULL,
    minuto INTEGER NOT NULL,
    observacao TEXT,
    FOREIGN KEY (partida_id) REFERENCES partidas(id),
    FOREIGN KEY (jogador_id) REFERENCES jogadores(id),
    FOREIGN KEY (time_id) REFERENCES times(id)
  );
`);

const colunasEventos = db.prepare("PRAGMA table_info(eventos)").all();
const temTimeId = colunasEventos.some(coluna => coluna.name === "time_id");

if (!temTimeId) {
  db.prepare("ALTER TABLE eventos ADD COLUMN time_id INTEGER").run();

  db.prepare(`
    UPDATE eventos
    SET time_id = (
      SELECT time_id
      FROM jogadores
      WHERE jogadores.id = eventos.jogador_id
    )
    WHERE time_id IS NULL
  `).run();
}

// =========================
// SEED INICIAL
// =========================
function seedDatabase() {
  const totalCampeonatos = db.prepare("SELECT COUNT(*) AS total FROM campeonatos").get().total;
  if (totalCampeonatos === 0) {
    db.prepare("INSERT INTO campeonatos (nome) VALUES (?)").run("Brasileirão");
    db.prepare("INSERT INTO campeonatos (nome) VALUES (?)").run("Copa do Brasil");
  }

  const totalTimes = db.prepare("SELECT COUNT(*) AS total FROM times").get().total;
  if (totalTimes === 0) {
    db.prepare("INSERT INTO times (nome) VALUES (?)").run("Palmeiras");
    db.prepare("INSERT INTO times (nome) VALUES (?)").run("Santos");
    db.prepare("INSERT INTO times (nome) VALUES (?)").run("Corinthians");
  }

  const palmeiras = db.prepare("SELECT * FROM times WHERE nome = ?").get("Palmeiras");
  const santos = db.prepare("SELECT * FROM times WHERE nome = ?").get("Santos");
  const corinthians = db.prepare("SELECT * FROM times WHERE nome = ?").get("Corinthians");
  const brasileirao = db.prepare("SELECT * FROM campeonatos WHERE nome = ?").get("Brasileirão");

  const totalJogadores = db.prepare("SELECT COUNT(*) AS total FROM jogadores").get().total;
  if (totalJogadores === 0) {
    db.prepare("INSERT INTO jogadores (nome, time_id) VALUES (?, ?)").run("Endrick", palmeiras.id);
    db.prepare("INSERT INTO jogadores (nome, time_id) VALUES (?, ?)").run("Pedro Apim", santos.id);
    db.prepare("INSERT INTO jogadores (nome, time_id) VALUES (?, ?)").run("Maycon Jr", santos.id);
    db.prepare("INSERT INTO jogadores (nome, time_id) VALUES (?, ?)").run("Yuri Alberto", corinthians.id);
  }

  const totalPartidas = db.prepare("SELECT COUNT(*) AS total FROM partidas").get().total;
  if (totalPartidas === 0) {
    db.prepare(`
      INSERT INTO partidas (descricao, campeonato_id, mandante_id, visitante_id)
      VALUES (?, ?, ?, ?)
    `).run("Palmeiras x Santos", brasileirao.id, palmeiras.id, santos.id);

    db.prepare(`
      INSERT INTO partidas (descricao, campeonato_id, mandante_id, visitante_id)
      VALUES (?, ?, ?, ?)
    `).run("Santos x Corinthians", brasileirao.id, santos.id, corinthians.id);
  }
}

seedDatabase();

// =========================
// HELPERS
// =========================
function getCampeonatos() {
  return db.prepare("SELECT * FROM campeonatos ORDER BY nome").all();
}

function getTimes() {
  return db.prepare("SELECT * FROM times ORDER BY nome").all();
}

function getJogadores() {
  return db.prepare(`
    SELECT j.id, j.nome, t.nome AS time_nome
    FROM jogadores j
    JOIN times t ON t.id = j.time_id
    ORDER BY j.nome
  `).all();
}

function getPartidas() {
  return db.prepare(`
    SELECT 
      p.id,
      p.descricao,
      c.nome AS campeonato_nome
    FROM partidas p
    JOIN campeonatos c ON c.id = p.campeonato_id
    ORDER BY p.descricao
  `).all();
}

function getCampeonatoByNome(nome) {
  return db.prepare("SELECT * FROM campeonatos WHERE nome = ?").get(nome);
}

function getTimeByNome(nome) {
  return db.prepare("SELECT * FROM times WHERE nome = ?").get(nome);
}

function getJogadorByNome(nome) {
  return db.prepare("SELECT * FROM jogadores WHERE nome = ?").get(nome);
}

function getPartidaByDescricao(descricao) {
  return db.prepare("SELECT * FROM partidas WHERE descricao = ?").get(descricao);
}

function getOrCreateCampeonato(nome) {
  let campeonato = getCampeonatoByNome(nome);
  if (!campeonato) {
    const info = db.prepare("INSERT INTO campeonatos (nome) VALUES (?)").run(nome);
    campeonato = db.prepare("SELECT * FROM campeonatos WHERE id = ?").get(info.lastInsertRowid);
  }
  return campeonato;
}

function getOrCreateTime(nome) {
  let time = getTimeByNome(nome);
  if (!time) {
    const info = db.prepare("INSERT INTO times (nome) VALUES (?)").run(nome);
    time = db.prepare("SELECT * FROM times WHERE id = ?").get(info.lastInsertRowid);
  }
  return time;
}

function getOrCreateJogador(nome, timeId, confirmarTransferencia = false) {
  let jogador = getJogadorByNome(nome);

  if (!jogador) {
    const info = db.prepare(`
      INSERT INTO jogadores (nome, time_id)
      VALUES (?, ?)
    `).run(nome, timeId);

    return db.prepare("SELECT * FROM jogadores WHERE id = ?").get(info.lastInsertRowid);
  }

  if (jogador.time_id !== timeId) {
    if (!confirmarTransferencia) {
      const timeAtual = db.prepare("SELECT * FROM times WHERE id = ?").get(jogador.time_id);
      const novoTime = db.prepare("SELECT * FROM times WHERE id = ?").get(timeId);

      const erro = new Error("CONFIRMAR_TRANSFERENCIA");
      erro.timeAtual = timeAtual.nome;
      erro.novoTime = novoTime.nome;
      throw erro;
    }

    db.prepare(`
      UPDATE jogadores
      SET time_id = ?
      WHERE id = ?
    `).run(timeId, jogador.id);

    jogador = db.prepare("SELECT * FROM jogadores WHERE id = ?").get(jogador.id);
  }

  return jogador;
}

function getOrCreatePartida(descricao, campeonatoId, mandanteId, visitanteId) {
  let partida = getPartidaByDescricao(descricao);

  if (!partida) {
    const info = db.prepare(`
      INSERT INTO partidas (descricao, campeonato_id, mandante_id, visitante_id)
      VALUES (?, ?, ?, ?)
    `).run(descricao, campeonatoId, mandanteId, visitanteId);

    partida = db.prepare("SELECT * FROM partidas WHERE id = ?").get(info.lastInsertRowid);
  }

  return partida;
}

function isTipoEventoValido(tipoEvento) {
  return ["Gol", "Assistência", "Cartão Amarelo", "Cartão Vermelho"].includes(tipoEvento);
}

function parseOptionalId(value) {
  if (!value || value === "" || value === "todos") return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : "INVALID";
}

// =========================
// ROTAS
// =========================
app.get("/", (req, res) => {
  const partidasRecentes = db.prepare(`
    SELECT descricao
    FROM partidas
    ORDER BY id DESC
    LIMIT 5
  `).all();

  const rankingArtilharia = db.prepare(`
    SELECT j.nome AS jogador, COUNT(*) AS gols
    FROM eventos e
    JOIN jogadores j ON j.id = e.jogador_id
    WHERE e.tipoEvento = 'Gol'
    GROUP BY j.id, j.nome
    ORDER BY gols DESC, j.nome ASC
    LIMIT 5
  `).all();

  res.render("index", {
    partidasRecentes,
    rankingArtilharia
  });
});

app.get("/evento", (req, res) => {
  res.render("evento", {
    campeonatos: getCampeonatos(),
    times: getTimes(),
    jogadores: getJogadores(),
    erro: null,
    dadosFormulario: {},
    confirmacaoTransferencia: null // 🔥 ESSENCIAL
  });
});

app.post("/evento", (req, res) => {
  try {
    const {
      campeonato,
      mandante,
      visitante,
      timeJogador,
      jogador,
      tipoEvento,
      minuto,
      observacao,
      confirmarTransferencia
    } = req.body;

    if (!campeonato || !mandante || !visitante || !timeJogador || !jogador || !tipoEvento || !minuto) {
      return res.status(400).render("evento", {
        campeonatos: getCampeonatos(),
        times: getTimes(),
        jogadores: getJogadores(),
        erro: "Preencha todos os campos obrigatórios.",
        dadosFormulario: req.body,
        confirmacaoTransferencia: null
      });
    }

    const campeonatoNome = campeonato.trim();
    const mandanteNome = mandante.trim();
    const visitanteNome = visitante.trim();
    const timeJogadorNome = timeJogador.trim();
    const jogadorNome = jogador.trim();
    const minutoNum = Number(minuto);

    if (mandanteNome.toLowerCase() === visitanteNome.toLowerCase()) {
      return res.status(400).render("evento", {
        campeonatos: getCampeonatos(),
        times: getTimes(),
        jogadores: getJogadores(),
        erro: "Mandante e visitante não podem ser iguais.",
        dadosFormulario: req.body,
        confirmacaoTransferencia: null
      });
    }

    if (!isTipoEventoValido(tipoEvento)) {
      return res.status(400).render("evento", {
        campeonatos: getCampeonatos(),
        times: getTimes(),
        jogadores: getJogadores(),
        erro: "Tipo de evento inválido.",
        dadosFormulario: req.body,
        confirmacaoTransferencia: null
      });
    }

    if (!Number.isInteger(minutoNum) || minutoNum < 1 || minutoNum > 140) {
      return res.status(400).render("evento", {
        campeonatos: getCampeonatos(),
        times: getTimes(),
        jogadores: getJogadores(),
        erro: "O minuto informado é inválido. Informe um valor entre 1 e 140.",
        dadosFormulario: req.body,
        confirmacaoTransferencia: null
      });
    }

    const campeonatoRegistro = getOrCreateCampeonato(campeonatoNome);
    const mandanteRegistro = getOrCreateTime(mandanteNome);
    const visitanteRegistro = getOrCreateTime(visitanteNome);
    const timeJogadorRegistro = getOrCreateTime(timeJogadorNome);

    if (
      timeJogadorRegistro.id !== mandanteRegistro.id &&
      timeJogadorRegistro.id !== visitanteRegistro.id
    ) {
      return res.status(400).render("evento", {
        campeonatos: getCampeonatos(),
        times: getTimes(),
        jogadores: getJogadores(),
        erro: "O time do jogador deve ser um dos times da partida.",
        dadosFormulario: req.body,
        confirmacaoTransferencia: null
      });
    }

    let jogadorRegistro;

    try {
      jogadorRegistro = getOrCreateJogador(
        jogadorNome,
        timeJogadorRegistro.id,
        confirmarTransferencia === "sim"
      );
    } catch (error) {
      if (error.message === "CONFIRMAR_TRANSFERENCIA") {
        return res.status(409).render("evento", {
          campeonatos: getCampeonatos(),
          times: getTimes(),
          jogadores: getJogadores(),
          erro: null,
          dadosFormulario: req.body,
          confirmacaoTransferencia: {
            jogador: jogadorNome,
            timeAtual: error.timeAtual,
            novoTime: error.novoTime
          }
        });
      }

      throw error;
    }

    const descricaoPartida = `${mandanteNome} x ${visitanteNome}`;
    const partidaRegistro = getOrCreatePartida(
      descricaoPartida,
      campeonatoRegistro.id,
      mandanteRegistro.id,
      visitanteRegistro.id
    );

    db.prepare(`
      INSERT INTO eventos (partida_id, jogador_id, time_id, tipoEvento, minuto, observacao)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      partidaRegistro.id,
      jogadorRegistro.id,
      timeJogadorRegistro.id,
      tipoEvento,
      minutoNum,
      observacao || ""
    );

    res.redirect("/eventos");
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao registrar evento.");
  }
});

app.get("/evento", (req, res) => {
  res.render("evento", {
    campeonatos: getCampeonatos(),
    times: getTimes(),
    jogadores: getJogadores(),
    erro: null,
    dadosFormulario: {},
    confirmacaoTransferencia: null
  });
});

app.get("/eventos", (req, res) => {
  try {
    const eventos = db.prepare(`
      SELECT
        e.id,
        p.descricao AS partida,
        j.nome AS jogador,
        t.nome AS time,
        e.tipoEvento,
        e.minuto,
        e.observacao
      FROM eventos e
      JOIN partidas p ON p.id = e.partida_id
      JOIN jogadores j ON j.id = e.jogador_id
      JOIN times t ON t.id = e.time_id
      ORDER BY e.id DESC
    `).all();

    res.render("eventos", { eventos });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao buscar eventos.");
  }
});

app.get("/ranking", (req, res) => {
  try {
    const tipo = req.query.tipo || "artilharia";
    const campeonatoId = parseOptionalId(req.query.campeonato);
    const timeId = parseOptionalId(req.query.time);

    if (campeonatoId === "INVALID" || timeId === "INVALID") {
      return res.status(400).render("ranking", {
        ranking: [],
        tipo,
        titulo: "Ranking",
        campeonatos: getCampeonatos(),
        times: getTimes(),
        campeonatoSelecionado: req.query.campeonato || "",
        timeSelecionado: req.query.time || "",
        mensagem: "Filtro inválido informado."
      });
    }

    let tipoEventoWhere = "";
    let titulo = "";

    if (tipo === "artilharia") {
      tipoEventoWhere = `e.tipoEvento = 'Gol'`;
      titulo = "Ranking de Artilharia";
    } else if (tipo === "assistencias") {
      tipoEventoWhere = `e.tipoEvento = 'Assistência'`;
      titulo = "Ranking de Assistências";
    } else if (tipo === "disciplinar") {
      tipoEventoWhere = `e.tipoEvento IN ('Cartão Amarelo', 'Cartão Vermelho')`;
      titulo = "Ranking Disciplinar";
    } else {
      return res.status(400).render("ranking", {
        ranking: [],
        tipo,
        titulo: "Ranking",
        campeonatos: getCampeonatos(),
        times: getTimes(),
        campeonatoSelecionado: req.query.campeonato || "",
        timeSelecionado: req.query.time || "",
        mensagem: "Tipo de ranking inválido."
      });
    }

    let sql = "";

if (tipo === "disciplinar") {
  sql = `
    SELECT
      j.nome AS jogador,
      t.nome AS time,
      SUM(CASE WHEN e.tipoEvento = 'Cartão Vermelho' THEN 1 ELSE 0 END) AS cartoesVermelhos,
      SUM(CASE WHEN e.tipoEvento = 'Cartão Amarelo' THEN 1 ELSE 0 END) AS cartoesAmarelos
    FROM eventos e
    JOIN jogadores j ON j.id = e.jogador_id
    JOIN times t ON t.id = e.time_id
    JOIN partidas p ON p.id = e.partida_id
    WHERE ${tipoEventoWhere}
  `;
} else {
  sql = `
    SELECT
      j.nome AS jogador,
      t.nome AS time,
      COUNT(*) AS total
    FROM eventos e
    JOIN jogadores j ON j.id = e.jogador_id
    JOIN times t ON t.id = e.time_id
    JOIN partidas p ON p.id = e.partida_id
    WHERE ${tipoEventoWhere}
  `;
}

    const params = [];

    if (campeonatoId !== null) {
      sql += ` AND p.campeonato_id = ? `;
      params.push(campeonatoId);
    }

    if (timeId !== null) {
      sql += ` AND j.time_id = ? `;
      params.push(timeId);
    }

    if (tipo === "disciplinar") {
  sql += `
    GROUP BY j.id, j.nome, t.nome
    ORDER BY cartoesVermelhos DESC, cartoesAmarelos DESC, j.nome ASC
  `;
} else {
  sql += `
    GROUP BY j.id, j.nome, t.nome
    ORDER BY total DESC, j.nome ASC
  `;
}

    const ranking = db.prepare(sql).all(...params);

    const mensagem = ranking.length === 0
      ? "Não há estatísticas disponíveis para o critério escolhido."
      : null;

    res.render("ranking", {
      ranking,
      tipo,
      titulo,
      campeonatos: getCampeonatos(),
      times: getTimes(),
      campeonatoSelecionado: campeonatoId || "",
      timeSelecionado: timeId || "",
      mensagem
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao consultar ranking.");
  }
});

app.get("/estatisticas-jogador", (req, res) => {
  try {
    const nome = (req.query.nome || "").trim();
    const campeonatoId = parseOptionalId(req.query.campeonato);
    const timeId = parseOptionalId(req.query.time);

    if (campeonatoId === "INVALID" || timeId === "INVALID") {
      return res.status(400).render("estatisticas-jogador", {
        estatistica: null,
        jogadores: getJogadores(),
        campeonatos: getCampeonatos(),
        times: getTimes(),
        filtros: {
          nome,
          campeonato: req.query.campeonato || "",
          time: req.query.time || ""
        },
        mensagem: "Filtro inválido informado."
      });
    }

    let estatistica = null;
    let mensagem = null;

    if (nome) {
      let sqlJogador = `
        SELECT j.id, j.nome, t.nome AS time_nome, j.time_id
        FROM jogadores j
        JOIN times t ON t.id = j.time_id
        WHERE j.nome LIKE ?
      `;

      const paramsJogador = [`%${nome}%`];

      if (timeId !== null) {
        sqlJogador += ` AND j.time_id = ? `;
        paramsJogador.push(timeId);
      }

      sqlJogador += ` ORDER BY j.nome LIMIT 1 `;

      const jogador = db.prepare(sqlJogador).get(...paramsJogador);

      if (!jogador) {
        mensagem = "Nenhum jogador encontrado para o critério informado.";
      } else {
        let sqlStats = `
          SELECT
            COUNT(DISTINCT e.partida_id) AS partidas,
            SUM(CASE WHEN e.tipoEvento = 'Gol' THEN 1 ELSE 0 END) AS gols,
            SUM(CASE WHEN e.tipoEvento = 'Assistência' THEN 1 ELSE 0 END) AS assistencias,
            SUM(CASE WHEN e.tipoEvento IN ('Cartão Amarelo', 'Cartão Vermelho') THEN 1 ELSE 0 END) AS cartoes
          FROM eventos e
          JOIN partidas p ON p.id = e.partida_id
          WHERE e.jogador_id = ?
        `;

        const paramsStats = [jogador.id];

        if (campeonatoId !== null) {
          sqlStats += ` AND p.campeonato_id = ? `;
          paramsStats.push(campeonatoId);
        }

        if (timeId !== null) {
          sqlStats += ` AND e.time_id = ? `;
          paramsStats.push(timeId);
        }

        const stats = db.prepare(sqlStats).get(...paramsStats);

        let sqlPorTime = `
          SELECT
            t.nome AS time,
            COUNT(DISTINCT e.partida_id) AS partidas,
            SUM(CASE WHEN e.tipoEvento = 'Gol' THEN 1 ELSE 0 END) AS gols,
            SUM(CASE WHEN e.tipoEvento = 'Assistência' THEN 1 ELSE 0 END) AS assistencias,
            SUM(CASE WHEN e.tipoEvento IN ('Cartão Amarelo', 'Cartão Vermelho') THEN 1 ELSE 0 END) AS cartoes
          FROM eventos e
          JOIN times t ON t.id = e.time_id
          JOIN partidas p ON p.id = e.partida_id
          WHERE e.jogador_id = ?
        `;

        const paramsPorTime = [jogador.id];

        if (campeonatoId !== null) {
          sqlPorTime += ` AND p.campeonato_id = ? `;
          paramsPorTime.push(campeonatoId);
        }

        if (timeId !== null) {
          sqlPorTime += ` AND e.time_id = ? `;
          paramsPorTime.push(timeId);
        }

        sqlPorTime += `
          GROUP BY t.id, t.nome
          ORDER BY t.nome
        `;

        const porTime = db.prepare(sqlPorTime).all(...paramsPorTime);

        let historicoSql = `
          SELECT DISTINCT p.descricao
          FROM eventos e
          JOIN partidas p ON p.id = e.partida_id
          WHERE e.jogador_id = ?
        `;

        const historicoParams = [jogador.id];

        if (campeonatoId !== null) {
          historicoSql += ` AND p.campeonato_id = ? `;
          historicoParams.push(campeonatoId);
        }

        const historico = db.prepare(historicoSql).all(...historicoParams);

        estatistica = {
          jogador: jogador.nome,
          time: jogador.time_nome,
          partidas: stats?.partidas || 0,
          gols: stats?.gols || 0,
          assistencias: stats?.assistencias || 0,
          cartoes: stats?.cartoes || 0,
          porTime: porTime || [],
          historico
        };
      }
    }

    res.render("estatisticas-jogador", {
      estatistica,
      jogadores: getJogadores(),
      campeonatos: getCampeonatos(),
      times: getTimes(),
      filtros: {
        nome,
        campeonato: campeonatoId || "",
        time: timeId || ""
      },
      mensagem
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao consultar estatísticas do jogador.");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});