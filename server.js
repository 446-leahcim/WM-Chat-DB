// server.js: the chat's server. Express sends the chat page AND answers every /api request.
// Every message, chat, and user lives in MongoDB (chatDB), and the server has the final say.
// YOU write the routes, one day at a time. Each one answers 501 "not built yet" until you build it.
import express from "express";
import { ObjectId } from "mongodb";
import { connectDB, seedDatabase } from "./mongo.js";
import { setUpChat } from "./setup/chat.js";

const PORT = 3000;
const app = express();

// Sends the chat page (everything in the public folder) to the browser.
app.use(express.static("public"));

// ---------- Station U: read JSON bodies ----------
app.use(express.json());

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validUsername(value) {
  const username = normalizeUsername(value);
  return username.length > 0 && /^[a-z0-9][a-z0-9-]*$/.test(username);
}

function isValidChatId(value) {
  return typeof value === "string" && ObjectId.isValid(value);
}

function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

// ALREADY DONE: connects with your connectDB(), seeds with your seedDatabase(),
// adds GET /api/status and POST /api/reset.
const db = await setUpChat(app, connectDB, seedDatabase);

// ---------- Station U: Accounts ----------
// POST /api/users   body: { "username": "alan", "displayName": "Alan M." }
// Signs up a new user. 400 if the username breaks the rules, 409 if it's taken.
// Everyone who signs up joins the West-MEC Lounge.
app.post("/api/users", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";

  if (!validUsername(username)) {
    return errorResponse(res, 400, "Username must use only lowercase letters, numbers, or dashes.");
  }
  if (!displayName) {
    return errorResponse(res, 400, "Display name is required.");
  }

  const users = db.collection("users");
  const existing = await users.findOne({ _id: username });
  if (existing) {
    return errorResponse(res, 409, `Username "${username}" is already taken.`);
  }

  const user = { _id: username, displayName, createdAt: new Date() };
  await users.insertOne(user);

  const lounge = await db.collection("chats").findOne({ type: "group", name: "West-MEC" });
  if (lounge) {
    await db.collection("chats").updateOne(
      { _id: lounge._id },
      { $addToSet: { members: username } }
    );
  }

  res.status(201).json(user);
});

// GET /api/users/:username: signs in. Sends back ONE user, or 404 if there's no one with that username.
app.get("/api/users/:username", async (req, res) => {
  const username = normalizeUsername(req.params.username);
  if (!validUsername(username)) {
    return errorResponse(res, 400, "Username is not valid.");
  }

  const user = await db.collection("users").findOne({ _id: username });
  if (!user) {
    return errorResponse(res, 404, `No user named "${username}".`);
  }

  res.json(user);
});

// GET /api/users: sends back an array of every user, A to Z (the People list).
app.get("/api/users", async (req, res) => {
  const users = await db.collection("users").find({}).sort({ _id: 1 }).toArray();
  res.json(users);
});

// ---------- Day 3: Conversations ----------
// GET /api/chats?user=alan: sends back every chat that user is a member of, newest first.
app.get("/api/chats", async (req, res) => {
  const user = normalizeUsername(req.query.user);
  if (!validUsername(user)) {
    return errorResponse(res, 400, "A valid user is required.");
  }

  const userDoc = await db.collection("users").findOne({ _id: user });
  if (!userDoc) {
    return errorResponse(res, 404, `User "${user}" does not exist.`);
  }

  const chats = await db.collection("chats")
    .find({ members: user })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  res.json(chats);
});

// POST /api/chats/direct   body: { "from": "alan", "to": "maria" }
// Opens a direct message between two people. Already have one? Sends that one back (200).
// New one? 201. 400 if someone is missing or it's yourself, 404 if either user doesn't exist.
app.post("/api/chats/direct", async (req, res) => {
  const { from, to } = req.body ?? {};
  const fromUser = normalizeUsername(from);
  const toUser = normalizeUsername(to);

  if (!validUsername(fromUser) || !validUsername(toUser)) {
    return errorResponse(res, 400, "Both users are required.");
  }
  if (fromUser === toUser) {
    return errorResponse(res, 400, "A direct message cannot be with yourself.");
  }

  const [fromDoc, toDoc] = await Promise.all([
    db.collection("users").findOne({ _id: fromUser }),
    db.collection("users").findOne({ _id: toUser }),
  ]);

  if (!fromDoc || !toDoc) {
    return errorResponse(res, 404, "One or both users do not exist.");
  }

  const existing = await db.collection("chats").findOne({
    type: "direct",
    members: { $all: [fromUser, toUser], $size: 2 },
  });

  if (existing) {
    return res.json(existing);
  }

  const chat = {
    type: "direct",
    members: [fromUser, toUser],
    createdBy: fromUser,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessage: null,
  };

  const result = await db.collection("chats").insertOne(chat);
  const saved = { ...chat, _id: result.insertedId };
  res.status(201).json(saved);
});

// POST /api/chats/group   body: { "from": "alan", "name": "Study Group", "members": ["maria", "jay"] }
// Starts a group chat. The person who starts it is in it too.
// 400 if there's no name or no one else, 404 if anyone isn't a user.
app.post("/api/chats/group", async (req, res) => {
  const from = normalizeUsername(req.body?.from);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const requested = Array.isArray(req.body?.members) ? req.body.members.map(normalizeUsername).filter(Boolean) : [];

  if (!validUsername(from)) {
    return errorResponse(res, 400, "The chat creator is required.");
  }
  if (!name) {
    return errorResponse(res, 400, "Group name is required.");
  }
  const others = requested.filter((person) => person !== from);
  if (others.length === 0) {
    return errorResponse(res, 400, "A group needs at least one other member.");
  }

  const members = [...new Set([from, ...others])];
  const users = await db.collection("users").find({ _id: { $in: members } }).toArray();
  if (users.length !== members.length) {
    return errorResponse(res, 404, "One or more group members do not exist.");
  }

  const chat = {
    type: "group",
    name,
    members,
    createdBy: from,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessage: null,
  };

  const result = await db.collection("chats").insertOne(chat);
  const saved = { ...chat, _id: result.insertedId };
  res.status(201).json(saved);
});

// ---------- Day 4: Messages ----------
// GET /api/chats/:id/messages?user=alan&after=2026-10-12T18:00:00.000Z
// Sends back the chat's messages, oldest first. With after: only the ones sent after that time.
// 400 bad id, 404 no chat, 403 if user isn't a member.
app.get("/api/chats/:id/messages", async (req, res) => {
  const { id } = req.params;
  if (!isValidChatId(id)) {
    return errorResponse(res, 400, "Chat id is invalid.");
  }

  const chatId = new ObjectId(id);
  const chat = await db.collection("chats").findOne({ _id: chatId });
  if (!chat) {
    return errorResponse(res, 404, "Chat not found.");
  }

  const user = normalizeUsername(req.query.user);
  if (!validUsername(user) || !chat.members.includes(user)) {
    return errorResponse(res, 403, "You are not a member of this chat.");
  }

  const query = { chatId };
  if (req.query.after) {
    const since = new Date(req.query.after);
    if (Number.isNaN(since.getTime())) {
      return errorResponse(res, 400, "'after' is not a valid date.");
    }
    query.sentAt = { $gt: since };
  }

  const messages = await db.collection("messages").find(query).sort({ sentAt: 1 }).toArray();
  res.json(messages);
});

// POST /api/chats/:id/messages   body: { "from": "alan", "text": "hey!" }
// Sends a message. Also saves it on the chat as lastMessage, so the chat list can show it.
// 400 bad id or bad text, 404 no chat, 403 if from isn't a member.
app.post("/api/chats/:id/messages", async (req, res) => {
  const { id } = req.params;
  const from = normalizeUsername(req.body?.from);
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!isValidChatId(id)) {
    return errorResponse(res, 400, "Chat id is invalid.");
  }
  if (!text) {
    return errorResponse(res, 400, "Message text is required.");
  }

  const chatId = new ObjectId(id);
  const chat = await db.collection("chats").findOne({ _id: chatId });
  if (!chat) {
    return errorResponse(res, 404, "Chat not found.");
  }
  if (!validUsername(from) || !chat.members.includes(from)) {
    return errorResponse(res, 403, "You are not a member of this chat.");
  }

  const sentAt = new Date();
  const message = { _id: new ObjectId(), chatId: chatId, from, text, sentAt };
  await db.collection("messages").insertOne(message);
  await db.collection("chats").updateOne(
    { _id: chatId },
    { $set: { updatedAt: sentAt, lastMessage: { from, text, sentAt } } }
  );

  res.status(201).json(message);
});

// ---------- Day 3: Conversations (adding people) ----------
// ALREADY DONE (you use it in add people): saves a gray "system" line in the chat, like "alan added maria",
// and makes it the chat's lastMessage.
async function systemMessage(chatId, text) {
  const message = { _id: new ObjectId(), chatId: chatId, from: "system", text, sentAt: new Date() };
  await db.collection("messages").insertOne(message);
  await db.collection("chats").updateOne(
    { _id: chatId },
    { $set: { updatedAt: message.sentAt, lastMessage: { from: "system", text, sentAt: message.sentAt } } }
  );
}

// PATCH /api/chats/:id/members   body: { "by": "alan", "username": "jay" }
// Adds someone to a group. 400 bad id or a direct message, 404 no chat or no user,
// 403 if by isn't a member, 409 if they're already in it.
app.patch("/api/chats/:id/members", async (req, res) => {
  const { id } = req.params;
  const by = normalizeUsername(req.body?.by);
  const username = normalizeUsername(req.body?.username);

  if (!isValidChatId(id)) {
    return errorResponse(res, 400, "Chat id is invalid.");
  }

  const chatId = new ObjectId(id);
  const chat = await db.collection("chats").findOne({ _id: chatId });
  if (!chat) {
    return errorResponse(res, 404, "Chat not found.");
  }
  if (chat.type !== "group") {
    return errorResponse(res, 400, "You can only add members to a group chat.");
  }
  if (!validUsername(by) || !chat.members.includes(by)) {
    return errorResponse(res, 403, "Only members can add people.");
  }
  if (!validUsername(username)) {
    return errorResponse(res, 400, "Username is required.");
  }

  const user = await db.collection("users").findOne({ _id: username });
  if (!user) {
    return errorResponse(res, 404, `User "${username}" does not exist.`);
  }
  if (chat.members.includes(username)) {
    return errorResponse(res, 409, `User "${username}" is already a member.`);
  }

  await db.collection("chats").updateOne(
    { _id: chatId },
    { $addToSet: { members: username }, $set: { updatedAt: new Date() } }
  );
  await systemMessage(chatId, `${by} added ${username}`);

  const updated = await db.collection("chats").findOne({ _id: chatId });
  res.json(updated);
});

// ---------- Extension (done early): Leave and Rename ----------
// DELETE /api/chats/:id/members/:username: leaves a group.
// The last one out deletes the chat AND its messages. 400 bad id or a direct message, 404 no chat or not a member.
app.delete("/api/chats/:id/members/:username", async (req, res) => {
  const { id, username } = req.params;
  const member = normalizeUsername(username);

  if (!isValidChatId(id)) {
    return errorResponse(res, 400, "Chat id is invalid.");
  }

  const chatId = new ObjectId(id);
  const chat = await db.collection("chats").findOne({ _id: chatId });
  if (!chat) {
    return errorResponse(res, 404, "Chat not found.");
  }
  if (chat.type !== "group") {
    return errorResponse(res, 400, "You can only leave a group chat.");
  }
  if (!validUsername(member) || !chat.members.includes(member)) {
    return errorResponse(res, 404, `User "${member}" is not a member of this group.`);
  }

  const remaining = chat.members.filter((person) => person !== member);
  if (remaining.length === 0) {
    await db.collection("chats").deleteOne({ _id: chatId });
    await db.collection("messages").deleteMany({ chatId });
    return res.json({ deleted: true, chatId: chatId.toString() });
  }

  await db.collection("chats").updateOne(
    { _id: chatId },
    { $set: { members: remaining, updatedAt: new Date() } }
  );
  await systemMessage(chatId, `${member} left the group`);

  const updated = await db.collection("chats").findOne({ _id: chatId });
  res.json(updated);
});

// PATCH /api/chats/:id   body: { "by": "alan", "name": "Study Squad" }
// Renames a group. 400 bad id, no name, or a direct message, 404 no chat, 403 if by isn't a member.
app.patch("/api/chats/:id", async (req, res) => {
  const { id } = req.params;
  const by = normalizeUsername(req.body?.by);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!isValidChatId(id)) {
    return errorResponse(res, 400, "Chat id is invalid.");
  }
  if (!name) {
    return errorResponse(res, 400, "Group name is required.");
  }

  const chatId = new ObjectId(id);
  const chat = await db.collection("chats").findOne({ _id: chatId });
  if (!chat) {
    return errorResponse(res, 404, "Chat not found.");
  }
  if (chat.type !== "group") {
    return errorResponse(res, 400, "You can only rename a group chat.");
  }
  if (!validUsername(by) || !chat.members.includes(by)) {
    return errorResponse(res, 403, "Only members can rename the group.");
  }

  await db.collection("chats").updateOne(
    { _id: chatId },
    { $set: { name, updatedAt: new Date() } }
  );

  const updated = await db.collection("chats").findOne({ _id: chatId });
  res.json(updated);
});

// Starts the server. Already running in another terminal? You get EADDRINUSE: Ctrl+C there first.
app.listen(PORT, (error) => {
  if (error) throw error;
  console.log(`WM Chat running at http://localhost:${PORT}`);
});
