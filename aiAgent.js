// miskaran's contribution start
const express = require("express");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const { getDB } = require("./db");
const router = express.Router();

// Maximum messages per chat session
const MAX_MESSAGES_PER_CHAT = 50;

// ✅ POST — Ask AI and store in existing chat or create new one
router.post("/", async (req, res) => {
  const { query, userEmail, chatId } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }
  if (!userEmail) {
    return res.status(401).json({ error: "User email is required" });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "tngtech/deepseek-r1t2-chimera:free",
        messages: [{ role: "user", content: query }],
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "CodeClash AI Agent"
        },
        timeout: 30000,
      }
    );

    const answer = response.data?.choices?.[0]?.message?.content || "No response from AI";

    const db = getDB();
    const chatsCollection = db.collection("aiChats");

    let result;
    let currentChatId = chatId;

    if (chatId) {
      const existingChat = await chatsCollection.findOne({ 
        _id: new ObjectId(chatId), 
        userEmail: userEmail 
      });

      if (!existingChat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (existingChat.messages.length >= MAX_MESSAGES_PER_CHAT) {
        return res.status(400).json({ 
          error: "Chat message limit reached. Please start a new chat.",
          limitReached: true 
        });
      }

      const newMessages = [
        ...existingChat.messages,
        { sender: "user", text: query, timestamp: new Date() },
        { sender: "ai", text: answer, timestamp: new Date() }
      ];

      result = await chatsCollection.updateOne(
        { _id: new ObjectId(chatId) },
        { 
          $set: { 
            messages: newMessages,
            updatedAt: new Date(),
            name: existingChat.name === "New Chat" ? 
                  query.slice(0, 30) + (query.length > 30 ? "..." : "") : 
                  existingChat.name
          } 
        }
      );
    } else {
      const doc = {
        userEmail: userEmail,
        name: query.slice(0, 30) + (query.length > 30 ? "..." : ""),
        messages: [
          { sender: "user", text: query, timestamp: new Date() },
          { sender: "ai", text: answer, timestamp: new Date() }
        ],
        messageCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      result = await chatsCollection.insertOne(doc);
      currentChatId = result.insertedId;
    }

    res.json({ 
      answer,
      chatId: currentChatId,
      isNewChat: !chatId
    });

  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return res.status(408).json({ error: "AI request timeout" });
    }
    
    if (err.response?.status === 429) {
      return res.status(429).json({ error: "AI service rate limit exceeded" });
    }
    
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

// ✅ GET — Fetch user's chat history (only metadata)
router.get("/history", async (req, res) => {
  const userEmail = req.query.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: "User email is required" });
  }

  try {
    const db = getDB();
    const chatsCollection = db.collection("aiChats");
    
    const chats = await chatsCollection
      .find({ userEmail: userEmail })
      .project({
        name: 1,
        messageCount: 1,
        createdAt: 1,
        updatedAt: 1,
        _id: 1
      })
      .sort({ updatedAt: -1 })
      .limit(20)
      .toArray();

    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

// ✅ GET — Get full chat messages by chat ID
router.get("/chats/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const userEmail = req.query.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: "User email is required" });
  }

  try {
    const db = getDB();
    const chatsCollection = db.collection("aiChats");
    
    const chat = await chatsCollection.findOne({ 
      _id: new ObjectId(chatId), 
      userEmail: userEmail 
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

// ✅ PUT — Rename chat
router.put("/chats/:id", async (req, res) => {
  const { id } = req.params;
  const { name, userEmail } = req.body;

  if (!name) return res.status(400).json({ error: "New name required" });
  if (!userEmail) return res.status(401).json({ error: "User email required" });

  try {
    const db = getDB();
    const chatsCollection = db.collection("aiChats");

    const result = await chatsCollection.updateOne(
      { 
        _id: new ObjectId(id),
        userEmail: userEmail
      },
      { $set: { name } }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Chat not found or access denied" });

    res.json({ success: true, message: "Chat renamed successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to rename chat" });
  }
});

// ✅ DELETE — Delete chat
router.delete("/chats/:id", async (req, res) => {
  const { id } = req.params;
  const userEmail = req.query.userEmail;

  if (!userEmail) return res.status(401).json({ error: "User email required" });

  try {
    const db = getDB();
    const chatsCollection = db.collection("aiChats");

    const result = await chatsCollection.deleteOne({ 
      _id: new ObjectId(id),
      userEmail: userEmail
    });

    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Chat not found or access denied" });

    res.json({ success: true, message: "Chat deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

module.exports = router;
// miskaran's contribution end