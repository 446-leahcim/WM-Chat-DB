// chat.js: draws the chat page and decides WHEN to talk to the server.
// You do NOT need to change this file. Read it to see WHEN each api.js function runs.
// Every api.js call has a comment saying which station or day builds its route: // api.js (Day 3)

const POLL_EVERY = 2000; // ask the server for new messages every 2 seconds

// Everything the page remembers while it's open.
const state = {
  me: null, // the signed-in user: { _id, displayName }
  users: {}, // every user, by username: { "alan": { _id, displayName } }
  chats: [], // the chats I'm in, newest first
  openChat: null, // the chat on the screen
  messages: [], // its messages, oldest first
  lastSentAt: null, // when the newest message on screen was sent
  seen: {}, // when I last looked at each chat (for the orange "new" dot)
  timer: null,
  busy: false,
};

const $ = (id) => document.getElementById(id);

// ---------- Small helpers ----------

// Red bar for real errors. Gray bar for "not built yet".
function showError(error) {
  if (error.notBuilt) return showNotice(error.message);
  $("error").textContent = `${error.name}: ${error.message}`;
  $("error").classList.remove("hidden");
}

function showNotice(text) {
  $("notice").textContent = text;
  $("notice").classList.remove("hidden");
}

function hideMessages() {
  $("error").classList.add("hidden");
  $("notice").classList.add("hidden");
}

function displayName(username) {
  if (username === state.me?._id) return "You";
  return state.users[username]?.displayName || username;
}

// A direct message is named after the OTHER person. A group has its own name.
function chatName(chat) {
  if (chat.type === "group") return chat.name;
  const other = chat.members.find((m) => m !== state.me._id) || state.me._id;
  return state.users[other]?.displayName || other;
}

const COLORS = ["#0c2340", "#f57e20", "#ec1c24", "#163a63", "#d9631a", "#2e7d6b", "#6b4fa0", "#b03a48"];
function colorFor(text) {
  let total = 0;
  for (const letter of text) total = (total * 31 + letter.charCodeAt(0)) % 1000003;
  return COLORS[total % COLORS.length];
}

function fillAvatar(el, text) {
  const words = text.split(/[\s-]+/).filter(Boolean);
  el.textContent = words.slice(0, 2).map((w) => w[0]).join("") || "?";
  el.style.background = colorFor(text);
}

function makeAvatar(text, size) {
  const el = document.createElement("span");
  el.className = `avatar ${size} shrink-0`;
  fillAvatar(el, text);
  return el;
}

function timeText(date) {
  const d = new Date(date);
  const today = new Date().toDateString() === d.toDateString();
  if (today) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function preview(chat) {
  const last = chat.lastMessage;
  if (!last) return chat.type === "group" ? "New group. Say hi!" : "No messages yet";
  if (last.from === "system") return last.text;
  return `${displayName(last.from)}: ${last.text}`;
}

// ---------- The status line ----------
async function renderStatus() {
  try {
    const status = await getStatus(); // api.js (given)
    const counts = status.counts;
    $("status").innerHTML = `<span class="status-dot bg-green-500"></span>`;
    $("status").className = "flex items-center gap-2 text-green-700 font-semibold";
    $("status").append(
      `Chat: ${status.database} on ${status.where} · users ${counts.users} · chats ${counts.chats} · messages ${counts.messages}`
    );
    if (status.seed !== "done") showNotice(`Not seeded: ${status.seed}`);
  } catch (error) {
    $("status").innerHTML = `<span class="status-dot bg-gray-400"></span>`;
    $("status").className = "flex items-center gap-2 text-navy/60";
    $("status").append(`Chat not connected: ${error.message}`);
  }
}

// ---------- Signing in and out ----------
function showSignedIn(user) {
  // Only a real user (with a username in _id) can sign in.
  if (!user || typeof user._id !== "string") {
    throw new Error("The server didn't send back a user. Check that your sign-in route sends ONE user");
  }
  state.me = user;
  sessionStorage.setItem("wm-chat-user", user._id); // this TAB remembers who you are
  $("signin-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  $("me-box").classList.replace("hidden", "flex");
  $("me-name").textContent = user.displayName;
  $("me-username").textContent = `@${user._id}`;
  fillAvatar($("me-avatar"), user.displayName);
  startPolling();
}

function signOut() {
  stopPolling();
  sessionStorage.removeItem("wm-chat-user");
  Object.assign(state, { me: null, chats: [], openChat: null, messages: [], lastSentAt: null, seen: {} });
  $("app-view").classList.add("hidden");
  $("signin-view").classList.remove("hidden");
  $("me-box").classList.replace("flex", "hidden");
  closeChat();
  hideMessages();
}

$("signin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessages();
  $("signin-note").textContent = "";
  try {
    const username = $("signin-username").value.trim().toLowerCase();
    if (!username) {
      $("signin-note").textContent = "Type your username first. New here? Use Sign up.";
      return;
    }
    const user = await signIn(username); // api.js (Station U)
    showSignedIn(user);
  } catch (error) {
    if (error.notBuilt) $("signin-note").textContent = error.message;
    else showError(error);
  }
});

$("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessages();
  $("signup-note").textContent = "";
  try {
    const username = $("signup-username").value.trim().toLowerCase();
    const display = $("signup-display").value.trim();
    const user = await signUp(username, display); // api.js (Station U)
    showSignedIn(user);
    renderStatus();
  } catch (error) {
    if (error.notBuilt) $("signup-note").textContent = error.message;
    else showError(error);
  }
});

$("sign-out").addEventListener("click", signOut);

// ---------- The People list (everyone who has signed up) ----------
async function loadUsers() {
  try {
    const users = await getUsers(); // api.js (Station U)
    state.users = {};
    for (const user of users) state.users[user._id] = user;
    return true;
  } catch (error) {
    return error;
  }
}

// ---------- Your chats (left side) ----------
async function loadChats() {
  try {
    state.chats = await getChats(state.me._id); // api.js (Day 3)
    $("chats-note").textContent = "";
  } catch (error) {
    state.chats = [];
    if (error.notBuilt) $("chats-note").textContent = error.message;
    else showError(error);
  }

  // The open chat is gone (you left, or it was deleted)? Close it.
  if (state.openChat && !state.chats.some((c) => c._id === state.openChat._id)) {
    if (!state.openChat.local) closeChat();
  }
  // Keep the open chat's name and members up to date (someone renamed it or added people).
  const fresh = state.chats.find((c) => c._id === state.openChat?._id);
  if (fresh) {
    state.openChat = fresh;
    drawChatHeader();
  }
  drawChatList();
}

function drawChatList() {
  const list = $("chat-list");
  list.innerHTML = "";
  for (const chat of state.chats) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-item";
    if (chat._id === state.openChat?._id) button.classList.add("active");
    button.addEventListener("click", () => openChat(chat));

    const text = document.createElement("span");
    text.className = "min-w-0 flex-1";
    const top = document.createElement("span");
    top.className = "flex items-baseline justify-between gap-2";
    const name = document.createElement("span");
    name.className = "truncate font-semibold";
    name.textContent = chatName(chat);
    const when = document.createElement("span");
    when.className = "shrink-0 text-xs text-navy/50";
    when.textContent = timeText(chat.updatedAt);
    top.append(name, when);
    const small = document.createElement("span");
    small.className = "block truncate text-sm text-navy/60";
    small.textContent = preview(chat);
    text.append(top, small);

    button.append(makeAvatar(chatName(chat), "h-11 w-11"), text);

    // Orange dot: something new since I last looked (and I didn't send it).
    const seen = state.seen[chat._id];
    const last = chat.lastMessage;
    if (last && last.from !== state.me._id && chat._id !== state.openChat?._id && (!seen || seen < chat.updatedAt)) {
      name.classList.add("font-bold");
      const dot = document.createElement("span");
      dot.className = "unread-dot shrink-0";
      button.append(dot);
    }

    li.append(button);
    list.append(li);
  }
}

// ---------- The open chat (right side) ----------
function openChat(chat) {
  state.openChat = chat;
  state.messages = [];
  state.lastSentAt = null;
  state.seen[chat._id] = chat.updatedAt;
  $("messages").innerHTML = "";
  $("messages-note").textContent = "";
  $("chat-empty").classList.add("hidden");
  $("chat-open").classList.replace("hidden", "flex");
  $("app-view").dataset.open = "chat";
  drawChatHeader();
  drawChatList();
  loadMessages();
  $("composer-text").focus();
}

function closeChat() {
  state.openChat = null;
  state.messages = [];
  $("chat-open").classList.replace("flex", "hidden");
  $("chat-empty").classList.remove("hidden");
  $("app-view").dataset.open = "list";
  drawChatList();
}

function drawChatHeader() {
  const chat = state.openChat;
  $("chat-title").textContent = chatName(chat);
  fillAvatar($("chat-avatar"), chatName(chat));
  const names = chat.members.map(displayName);
  $("chat-members").textContent =
    chat.type === "group" ? `${chat.members.length} members: ${names.join(", ")}` : `Direct message with @${chat.members.find((m) => m !== state.me._id)}`;
  const isGroup = chat.type === "group";
  $("group-tools").classList.toggle("hidden", !isGroup);
  $("group-tools").classList.toggle("flex", isGroup);
}

// Gets only the NEW messages (the ones after lastSentAt) and adds them to the screen.
async function loadMessages() {
  const chat = state.openChat;
  if (!chat) return;
  try {
    const fresh = await getMessages(chat._id, state.me._id, state.lastSentAt); // api.js (Day 4)
    if (chat !== state.openChat && chat._id !== state.openChat?._id) return; // you clicked a different chat while waiting
    $("messages-note").textContent = "";
    const known = new Set(state.messages.map((m) => m._id));
    const added = fresh.filter((m) => !known.has(m._id));
    if (added.length === 0) return;
    state.messages.push(...added);
    state.lastSentAt = state.messages[state.messages.length - 1].sentAt;
    state.seen[chat._id] = state.lastSentAt;
    drawMessages(added);
  } catch (error) {
    if (error.notBuilt) $("messages-note").textContent = error.message;
    else showError(error);
  }
}

function drawMessages(added) {
  const box = $("messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  for (const message of added) {
    const before = state.messages[state.messages.indexOf(message) - 1];
    box.append(drawMessage(message, before));
  }
  if (nearBottom || added.some((m) => m.from === state.me._id)) {
    box.scrollTop = box.scrollHeight;
  }
}

function drawMessage(message, before) {
  const li = document.createElement("li");
  if (message.from === "system") {
    li.className = "msg system";
    li.textContent = message.text;
    return li;
  }
  const mine = message.from === state.me._id;
  li.className = mine ? "msg mine" : "msg";

  // Show the name when the sender changes (in groups, and not on my own messages).
  const sameSender = before && before.from === message.from;
  if (!mine && !sameSender && state.openChat.type === "group") {
    const who = document.createElement("span");
    who.className = "who";
    who.style.color = colorFor(displayName(message.from));
    who.textContent = displayName(message.from);
    li.append(who);
  }

  const bubble = document.createElement("span");
  bubble.className = "bubble";
  bubble.textContent = message.text; // textContent, never innerHTML: a message is just text
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = timeText(message.sentAt);
  li.append(bubble, time);
  return li;
}

$("composer").addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessages();
  const text = $("composer-text").value;
  try {
    await sendMessage(state.openChat._id, state.me._id, text); // api.js (Day 4)
    $("composer-text").value = "";
    await loadMessages();
    await loadChats();
  } catch (error) {
    if (error.notBuilt) $("messages-note").textContent = error.message;
    else showError(error);
  }
});

$("back").addEventListener("click", closeChat);

// ---------- Polling: ask the server "anything new?" every 2 seconds ----------
async function poll() {
  if (state.busy || !state.me) return; // the last check isn't done yet
  state.busy = true;
  try {
    await loadMessages();
    await loadChats();
  } finally {
    state.busy = false;
  }
}

async function startPolling() {
  stopPolling();
  const result = await loadUsers();
  if (result !== true) {
    if (result.notBuilt) showNotice(result.message);
    else showError(result);
  }
  await loadChats();
  state.timer = setInterval(poll, POLL_EVERY);
}

function stopPolling() {
  clearInterval(state.timer);
  state.timer = null;
}

// ---------- Pop-up lists of people ----------
function personButton(user, onClick) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "person";
  const name = document.createElement("span");
  name.innerHTML = `<b></b> <span class="text-sm text-navy/50"></span>`;
  name.querySelector("b").textContent = user.displayName;
  name.querySelector("span").textContent = `@${user._id}`;
  button.append(makeAvatar(user.displayName, "h-8 w-8 text-xs"), name);
  button.addEventListener("click", () => onClick(user, button));
  li.append(button);
  return li;
}

function everyoneElse() {
  return Object.values(state.users).filter((u) => u._id !== state.me._id);
}

// + Message: pick one person, then open (or start) your direct message with them.
$("new-dm").addEventListener("click", async () => {
  hideMessages();
  const result = await loadUsers();
  $("dm-note").textContent = result === true ? "" : result.message;
  const list = $("dm-people");
  list.innerHTML = "";
  for (const user of everyoneElse()) {
    list.append(
      personButton(user, async () => {
        try {
          const chat = await startDirect(state.me._id, user._id); // api.js (Day 3)
          $("dm-dialog").close();
          chat.local = true; // show it right away, even before getChats sees it
          await loadChats();
          openChat(state.chats.find((c) => c._id === chat._id) || chat);
        } catch (error) {
          $("dm-note").textContent = error.notBuilt ? error.message : `${error.name}: ${error.message}`;
        }
      })
    );
  }
  $("dm-dialog").showModal();
});

// + Group: a name and some people.
$("new-group").addEventListener("click", async () => {
  hideMessages();
  const result = await loadUsers();
  $("group-note").textContent = result === true ? "" : result.message;
  $("group-name").value = "";
  const list = $("group-people");
  list.innerHTML = "";
  for (const user of everyoneElse()) {
    const li = document.createElement("li");
    li.innerHTML = `<label class="person"><input type="checkbox" class="h-4 w-4 accent-orange"><b></b><span class="text-sm text-navy/50"></span></label>`;
    li.querySelector("input").value = user._id;
    li.querySelector("b").textContent = user.displayName;
    li.querySelector("span").textContent = `@${user._id}`;
    list.append(li);
  }
  $("group-dialog").showModal();
});

$("group-cancel").addEventListener("click", () => $("group-dialog").close());

$("group-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("group-name").value;
  const members = [...$("group-people").querySelectorAll("input:checked")].map((box) => box.value);
  try {
    const chat = await startGroup(state.me._id, name, members); // api.js (Day 3)
    $("group-dialog").close();
    chat.local = true;
    await loadChats();
    openChat(state.chats.find((c) => c._id === chat._id) || chat);
  } catch (error) {
    $("group-note").textContent = error.notBuilt ? error.message : `${error.name}: ${error.message}`;
  }
});

// + Add (groups only): everyone who isn't in the group yet.
$("add-member").addEventListener("click", async () => {
  hideMessages();
  await loadUsers();
  const list = $("add-people");
  list.innerHTML = "";
  const outside = Object.values(state.users).filter((u) => !state.openChat.members.includes(u._id));
  if (outside.length === 0) list.innerHTML = `<li class="note">Everyone is already in this group.</li>`;
  for (const user of outside) {
    list.append(
      personButton(user, async (person, button) => {
        try {
          state.openChat = await addMember(state.openChat._id, state.me._id, person._id); // api.js (Day 3)
          button.disabled = true;
          button.classList.add("opacity-40");
          drawChatHeader();
          await loadMessages();
        } catch (error) {
          $("add-dialog").close();
          showError(error);
        }
      })
    );
  }
  $("add-dialog").showModal();
});

// Rename (groups only)
$("rename").addEventListener("click", () => {
  hideMessages();
  $("rename-name").value = state.openChat.name;
  $("rename-dialog").showModal();
});
$("rename-cancel").addEventListener("click", () => $("rename-dialog").close());
$("rename-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("rename-dialog").close();
  try {
    state.openChat = await renameChat(state.openChat._id, state.me._id, $("rename-name").value); // api.js (Extension)
    drawChatHeader();
    await loadMessages();
    await loadChats();
  } catch (error) {
    showError(error);
  }
});

// Leave (groups only)
$("leave").addEventListener("click", () => {
  hideMessages();
  $("leave-dialog").showModal();
});
$("leave-cancel").addEventListener("click", () => $("leave-dialog").close());
$("leave-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("leave-dialog").close();
  try {
    await leaveChat(state.openChat._id, state.me._id); // api.js (Extension)
    closeChat();
    await loadChats();
  } catch (error) {
    showError(error);
  }
});

// Reset chat: empties chatDB and seeds it again. Every account is gone, so everyone signs up again.
$("reset").addEventListener("click", async () => {
  hideMessages();
  try {
    await resetChat(); // api.js (given)
    signOut();
    showNotice("chatDB was reset: WM Bot and the West-MEC Lounge are back. Every account is gone, so sign up again.");
  } catch (error) {
    showError(error);
  }
  renderStatus();
});

// ---------- When the page opens ----------
async function start() {
  await renderStatus();
  setInterval(renderStatus, 10000);

  // Signed in on this tab before you refreshed? Sign back in.
  const saved = sessionStorage.getItem("wm-chat-user");
  if (!saved || saved === "undefined") {
    sessionStorage.removeItem("wm-chat-user");
    return;
  }
  try {
    showSignedIn(await signIn(saved)); // api.js (Station U)
  } catch {
    sessionStorage.removeItem("wm-chat-user");
  }
}

start();
