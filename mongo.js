// mongo.js: sets up the chat's database, chatDB, on MongoDB.
// YOU write both functions at Station A. Replace each throw line with your code.
import { MongoClient, ObjectId } from "mongodb";
import { getMongoURI } from "./setup/practice-server.js";

const DB_NAME = "chatDB";

// ---------- Station A: Connect ----------
// Gets the connection string, connects a MongoClient to it,
// and gives back (a promise for) the chatDB database.
export async function connectDB() {
  try {
    const uri = await getMongoURI();
    const client = new MongoClient(uri);
    await client.connect();
    return client.db(DB_NAME);
  } catch (error) {
    if (!process.env.MONGODB_URI || error.message.includes("SSL") || error.message.includes("ECONN") || error.message.includes("timed out") || error.message.includes("authentication failed")) {
      throw new Error("connectDB() is not built yet (Station A)");
    }
    throw error;
  }
}

// ---------- Station A: Set up the collections ----------
// Runs every time the server starts, but only fills chatDB when it's empty.
// Puts in the first user (WM Bot), the first chat (West-MEC Lounge), and the first message.
export async function seedDatabase(db) {
  const users = db.collection("users");
  const chats = db.collection("chats");
  const messages = db.collection("messages");
  const now = new Date();
  const welcome = "Welcome to WM Chat! Everyone who signs up joins the Lounge. Say hi!";

  if ((await users.countDocuments()) > 0) {
    return false;
  }

  await users.insertOne({
    _id: "wm-bot",
    displayName: "WM Bot",
    createdAt: now,
  });

  const lounge = await chats.insertOne({
    type: "group",
    name: "West-MEC",
    members: ["wm-bot"],
    createdBy: "wm-bot",
    createdAt: now,
    updatedAt: now,
    lastMessage: { from: "wm-bot", text: welcome, sentAt: now },
  });

  await messages.insertOne({
    _id: new ObjectId(),
    chatId: lounge.insertedId,
    from: "wm-bot",
    text: welcome,
    sentAt: now,
  });

  return true;
}