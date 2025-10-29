// miskaran's contribution start
const express = require("express");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const { getDB } = require("./db"); // assuming you export getDB() from db.js
const router = express.Router();

// ✅ POST — Ask AI and store chat
router.post("/ai-agent", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  try {
    // 🧩 Ask OpenRouter AI
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "tngtech/deepseek-r1t2-chimera:free",
        messages: [{ role: "user", content: query }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const answer =
      response.data?.choices?.[0]?.message?.content ||
      response.data?.completion ||
      "No response from AI";

    // 🗃️ Store conversation in MongoDB
    const db = getDB();
    const chatsCollection = db.collection("aiChats");

    const doc = {
      name: query.slice(0, 30) + "...", // default name = first few chars of query
      query,
      response: answer,
      createdAt: new Date(),
    };

    await chatsCollection.insertOne(doc);

    res.json({ answer });
  } catch (err) {
    console.error("❌ AI Agent error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

// ✅ GET — Fetch previous chat history
router.get("/history", async (req, res) => {
  try {
    const db = getDB();
    const chatsCollection = db.collection("aiChats");
    const chats = await chatsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json(chats);
  } catch (err) {
    console.error("❌ Error fetching chat history:", err.message);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

// ✅ PUT — Rename chat
router.put("/chats/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "New name required" });

    const db = getDB();
    const chatsCollection = db.collection("aiChats");

    const result = await chatsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { name } }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Chat not found" });

    res.json({ success: true, message: "Chat renamed successfully" });
  } catch (err) {
    console.error("❌ Error renaming chat:", err.message);
    res.status(500).json({ error: "Failed to rename chat" });
  }
});

// ✅ DELETE — Delete chat
router.delete("/chats/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();
    const chatsCollection = db.collection("aiChats");

    const result = await chatsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Chat not found" });

    res.json({ success: true, message: "Chat deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting chat:", err.message);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

module.exports = router;
// miskaran's contribution end
