const express = require("express");
const { connectDB } = require("../db");

const router = express.Router();

// Add user
router.post("/", async (req, res) => {
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");

    const { userName, userEmail, userImage, userRole } = req.body;
    if (!userName || !userEmail || !userImage || !userRole) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await usersCollection.findOne({ userEmail });
    if (existingUser) {
      return res.status(200).json({ message: "User already exists", user: existingUser });
    }

    const newUser = {
      userName,
      userEmail,
      userImage,
      userRole,
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    res.status(201).json({ message: "User added successfully", userId: result.insertedId, user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET all users
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");

    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});


// GET user by email
router.get("/:email", async (req, res) => {
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");

    const { email } = req.params;
    const user = await usersCollection.findOne({ userEmail: email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});


module.exports = router;