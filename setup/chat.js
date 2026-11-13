// setup/chat.js: ALREADY DONE. You don't need to change this file.
// Connects with YOUR connectDB(), fills chatDB with YOUR seedDatabase(), and adds two routes:
// (connectDB not built yet? You get the practice chatDB on this computer until Station A.)
//   GET /api/status   the green line on the page
//   POST /api/reset   the Reset chat button: empties all three collections, then seeds them again
import { where, practiceDB } from "./practice-server.js";

const COLLECTIONS = ["users", "chats", "messages"];

export async function setUpChat(app, connectDB, seedDatabase) {
  let db = null;
  let problem = null;
  let seedProblem = null;
  let place = where();

  try {
    db = await connectDB();
    console.log(`Connected to ${db.databaseName} on ${place}`);
  } catch (error) {
    if (error.message.includes("not built yet")) {
      // You haven't done Station A yet: use the practice chatDB on this computer for now.
      db = await practiceDB();
      place = "the practice server (until you build connectDB in Station A)";
      console.log(`connectDB() is not built yet (Station A). Using the practice chatDB on this computer.`);
    } else {
      problem = error;
      db = null;
      console.log(`Database not connected: ${error.message}`);
    }
  }

  async function seed() {
    try {
      const added = await seedDatabase(db);
      seedProblem = null;
      if (added) console.log("Seeded chatDB: WM Bot, the West-MEC Lounge, and a welcome message");
    } catch (error) {
      seedProblem = error;
      console.log(`Not seeded: ${error.message}`);
    }
  }
  if (db) await seed();

  app.get("/api/status", async (req, res) => {
    if (!db) {
      return res.status(500).json({ error: problem.message });
    }
    try {
      const collections = await db.listCollections().toArray();
      const counts = {};
      for (const name of COLLECTIONS) {
        counts[name] = await db.collection(name).countDocuments();
      }
      res.json({
        database: db.databaseName,
        where: place,
        collections: collections.map((c) => c.name).sort(),
        counts: counts,
        seed: seedProblem ? seedProblem.message : "done",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/reset", async (req, res) => {
    if (!db) {
      return res.status(500).json({ error: problem.message });
    }
    for (const name of COLLECTIONS) {
      await db.collection(name).deleteMany({});
    }
    await seed();
    if (seedProblem && !seedProblem.message.includes("not built yet")) {
      return res.status(500).json({ error: seedProblem.message });
    }
    res.json({ reset: true });
  });

  return db;
}
