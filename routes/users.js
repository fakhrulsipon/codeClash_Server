const express = require("express");
const { connectDB } = require("../db");
const { ObjectId } = require("mongodb");
const router = express.Router();

// get user role
router.get("/role/:email", async (req, res) => {
  const db = await connectDB();
  const usersCollection = db.collection("users");
  const email = req.params.email;
  const user = await usersCollection.findOne({ userEmail: email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json({ role: user.userRole });
});

// user leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const db = await connectDB();
    const submissionsCollection = db.collection("submissions");

    const leaderboard = await submissionsCollection
      .aggregate([
        {
          $group: {
            _id: "$userEmail",
            userEmail: { $first: "$userEmail" },
            userName: { $first: "$userName" },
            totalPoints: {
              // success points যোগ, failure points deduct
              $sum: {
                $cond: [
                  { $eq: ["$status", "Success"] },
                  "$point",
                  {
                    $cond: [{ $eq: ["$status", "Failure"] }, "$point", 0],
                  },
                ],
              },
            },
            totalSolved: {
              $sum: { $cond: [{ $eq: ["$status", "Success"] }, 1, 0] },
            },
            totalFailures: {
              $sum: { $cond: [{ $eq: ["$status", "Failure"] }, 1, 0] },
            },
          },
        },
        { $sort: { totalPoints: -1 } },
      ])
      .toArray();

    res.status(200).json({ success: true, leaderboard });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// top 4 problem solver
router.get("/leaderboard/top", async (req, res) => {
  try {
    const db = await connectDB();
    const submissionsCollection = db.collection("submissions");

    const leaderboard = await submissionsCollection
      .aggregate([
        {
          $group: {
            _id: "$userEmail",
            userEmail: { $first: "$userEmail" },
            userName: { $first: "$userName" },
            totalPoints: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "Success"] },
                  "$point",
                  {
                    $cond: [{ $eq: ["$status", "Failure"] }, "$point", 0],
                  },
                ],
              },
            },
            totalSolved: {
              $sum: { $cond: [{ $eq: ["$status", "Success"] }, 1, 0] },
            },
            totalFailures: {
              $sum: { $cond: [{ $eq: ["$status", "Failure"] }, 1, 0] },
            },
          },
        },
        { $sort: { totalPoints: -1 } },
        { $limit: 4 },
      ])
      .toArray();

    res.status(200).json({ success: true, leaderboard });
  } catch (error) {
    console.error("Error fetching top leaderboard:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});









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
      return res
        .status(200)
        .json({ message: "User already exists", user: existingUser });
    }

    const newUser = {
      userName,
      userEmail,
      userImage,
      userRole,
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    res.status(201).json({
      message: "User added successfully",
      userId: result.insertedId,
      user: newUser,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET all users with search & pagination
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const query = search
      ? { userName: { $regex: search, $options: "i" } } // name দিয়ে সার্চ
      : {};

    const total = await usersCollection.countDocuments(query);
    const users = await usersCollection
      .find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    res.json({ users, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET user by is email
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



// Get submissions of a single user by email
router.get("/submissions/:email", async (req, res) => {
  try {
    const db = await connectDB();
    const submissionsCollection = db.collection("submissions");

    const email = req.params.email;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // find submissions by userEmail
    const submissions = await submissionsCollection
      .find({ userEmail: email })
      .sort({ submittedAt: -1 })
      .toArray();

    if (!submissions || submissions.length === 0) {
      return res.status(404).json({ message: "No submissions found" });
    }

    res.status(200).json(submissions);
  } catch (err) {
    console.error("Error fetching submissions:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// get single user total point + success/failure + growth
router.get("/profile/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const db = await connectDB();
    const submissionsCollection = db.collection("submissions");
    const result = await submissionsCollection
      .aggregate([
        { $match: { userEmail: email } },
        {
          $group: {
            _id: "$userEmail",
            totalPoints: { $sum: "$point" },
            totalSubmissions: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $eq: ["$status", "Success"] }, 1, 0] },
            },
            failureCount: {
              $sum: { $cond: [{ $eq: ["$status", "Failure"] }, 1, 0] },
            },
            growth: {
              $push: {
                date: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$submittedAt",
                  },
                },
                count: 1,
              },
            },
          },
        },
      ])
      .toArray();

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "User not found or no submissions" });
    }

    // growthMap type annotation সরিয়ে দেওয়া
    const growthMap = {};
    result[0].growth.forEach((g) => {
      growthMap[g.date] = (growthMap[g.date] || 0) + g.count;
    });

    const growth = Object.keys(growthMap)
      .sort()
      .map((date) => ({ date, count: growthMap[date] }));
    res.json({
      email: result[0]._id,
      totalPoints: result[0].totalPoints,
      totalSubmissions: result[0].totalSubmissions,
      successCount: result[0].successCount,
      failureCount: result[0].failureCount,
      growth,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// update user role
router.patch("/:id/role", async (req, res) => {
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");
    const { id } = req.params;
    const { role } = req.body; // 'user' or 'admin'

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { userRole: role } }
    );

    res.json({ message: "Role updated", modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
