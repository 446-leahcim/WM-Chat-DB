// setup/practice-server.js: ALREADY DONE. You don't need to change this file.
// getMongoURI() gives back the connection string your mongo.js should use:
//   1. MONGODB_URI from your .env file, if you pasted one in (MongoDB Atlas)
//   2. If not, it starts a PRACTICE MongoDB server on this computer and gives back its address.
//      No account, nothing to pay for. Your data is saved in the .practice-db folder.
// practiceDB() is for groups who build Accounts BEFORE Station A: until your connectDB works,
// setup/chat.js uses it so your routes still have a database to talk to.
import fs from "node:fs";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

// Reads your .env file (if you made one) into process.env
try {
  process.loadEnvFile();
} catch {
  // No .env file yet: that's OK, you get the practice server.
}

let practice = null;

export async function getMongoURI() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  fs.mkdirSync(".practice-db", { recursive: true });
  practice = await MongoMemoryServer.create({
    instance: { dbPath: ".practice-db", storageEngine: "wiredTiger" },
  });
  return practice.getUri();
}

// The practice chatDB, for before you've built connectDB (Station A). Always this computer, never Atlas.
export async function practiceDB() {
  fs.mkdirSync(".practice-db", { recursive: true });
  practice = await MongoMemoryServer.create({
    instance: { dbPath: ".practice-db", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(practice.getUri());
  await client.connect();
  return client.db("chatDB");
}

// Where your data lives, for the status line.
export function where() {
  if (!process.env.MONGODB_URI) return "the practice server";
  if (process.env.MONGODB_URI.includes(".mongodb.net")) return "MongoDB Atlas";
  return "MONGODB_URI";
}

// Ctrl+C: shut the practice server down cleanly, so your data is saved.
process.on("SIGINT", async () => {
  console.log("\nStopping WM Chat...");
  if (practice) await practice.stop({ doCleanup: false });
  process.exit(0);
});
