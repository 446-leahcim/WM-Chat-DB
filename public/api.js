// api.js: ALREADY DONE. Everything the PAGE says to the SERVER lives in this file.
// chat.js calls these functions, and each one fetches one of YOUR routes in server.js.
// Read them: each comment says which route it calls and what it sends.

// ALREADY DONE: fetch does NOT throw on a 404 or a 500. readJSON() reads the server's answer.
// If the status is OK, it gives back the data. If not, it throws the server's error message.
async function readJSON(response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error);
    error.name = `Error ${response.status}`;
    error.notBuilt = response.status === 501; // 501 = that route is not built yet
    throw error;
  }
  return data;
}

// GET /api/status
// Gives back { database, where, collections, counts, seed } for the status line.
async function getStatus() {
  const response = await fetch("/api/status");
  return readJSON(response);
}

// POST /api/reset empties chatDB and seeds it again (the Reset chat button).
async function resetChat() {
  const response = await fetch("/api/reset", { method: "POST" });
  return readJSON(response);
}

// ---------- Station U: Accounts ----------
// Signs up: POST /api/users with { username, displayName }. Gives back the new user.
async function signUp(username, displayName) {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username, displayName: displayName }),
  });
  return readJSON(response);
}

// Signs in: GET /api/users/:username. Gives back that user (or throws the 404).
async function signIn(username) {
  const response = await fetch(`/api/users/${username}`);
  return readJSON(response);
}

// Gives back an array of every user (GET /api/users).
async function getUsers() {
  const response = await fetch("/api/users");
  return readJSON(response);
}

// ---------- Day 3: Conversations ----------
// Gives back an array of every chat this user is in (GET /api/chats?user=...).
async function getChats(user) {
  const response = await fetch(`/api/chats?user=${user}`);
  return readJSON(response);
}

// Opens a direct message: POST /api/chats/direct with { from, to }. Gives back the chat.
async function startDirect(from, to) {
  const response = await fetch("/api/chats/direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: from, to: to }),
  });
  return readJSON(response);
}

// Starts a group: POST /api/chats/group with { from, name, members }. Gives back the chat.
async function startGroup(from, name, members) {
  const response = await fetch("/api/chats/group", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: from, name: name, members: members }),
  });
  return readJSON(response);
}

// ---------- Day 4: Messages ----------
// Gives back the chat's messages (GET /api/chats/:id/messages?user=...).
// If after has a value, add &after=... so the server only sends the new ones.
async function getMessages(chatId, user, after) {
  let url = `/api/chats/${chatId}/messages?user=${user}`;
  if (after) {
    url = url + `&after=${after}`;
  }
  const response = await fetch(url);
  return readJSON(response);
}

// Sends a message: POST /api/chats/:id/messages with { from, text }. Gives back the saved message.
async function sendMessage(chatId, from, text) {
  const response = await fetch(`/api/chats/${chatId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: from, text: text }),
  });
  return readJSON(response);
}

// ---------- Day 3: Conversations (add people) and the Extension (leave, rename) ----------
// Adds someone to a group: PATCH /api/chats/:id/members with { by, username }. Gives back the chat.
async function addMember(chatId, by, username) {
  const response = await fetch(`/api/chats/${chatId}/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ by: by, username: username }),
  });
  return readJSON(response);
}

// Leaves a group: DELETE /api/chats/:id/members/:username (no body).
async function leaveChat(chatId, username) {
  const response = await fetch(`/api/chats/${chatId}/members/${username}`, { method: "DELETE" });
  return readJSON(response);
}

// Renames a group: PATCH /api/chats/:id with { by, name }. Gives back the chat.
async function renameChat(chatId, by, name) {
  const response = await fetch(`/api/chats/${chatId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ by: by, name: name }),
  });
  return readJSON(response);
}
