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

// GET user dashboard statistics
router.get("/dashboard/:email", async (req, res) => {
  try {
    const db = await connectDB();
    const submissionsCollection = db.collection("submissions");
    const usersCollection = db.collection("users");

    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Verify user exists
    const user = await usersCollection.findOne({ userEmail: email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get user's submissions
    const submissions = await submissionsCollection
      .find({ userEmail: email })
      .sort({ submittedAt: -1 })
      .toArray();

    // Calculate statistics
    const totalSubmissions = submissions.length;
    const successSubmissions = submissions.filter(sub => sub.status === "Success").length;
    const totalPoints = submissions.reduce((sum, sub) => sum + (sub.point || 0), 0);

    // Get unique solved problems count
    const solvedProblemIds = [...new Set(
      submissions
        .filter(sub => sub.status === "Success")
        .map(sub => sub.problemId?.toString())
        .filter(Boolean)
    )];
    const totalSolved = solvedProblemIds.length;

    const successRate = totalSubmissions > 0
      ? Math.round((successSubmissions / totalSubmissions) * 100)
      : 0;

    // Get favorite language
    const languageStats = {};
    submissions.forEach(sub => {
      if (sub.language) {
        languageStats[sub.language] = (languageStats[sub.language] || 0) + 1;
      }
    });

    const favoriteLanguage = Object.keys(languageStats).length > 0
      ? Object.keys(languageStats).reduce((a, b) =>
        languageStats[a] > languageStats[b] ? a : b
      )
      : "N/A";

    // Get problems solved today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const problemsSolvedToday = submissions.filter(sub =>
      sub.status === "Success" &&
      new Date(sub.submittedAt) >= today &&
      new Date(sub.submittedAt) < tomorrow
    ).length;

    // Simple calculations for now
    const currentStreak = 0;
    const userRank = "N/A";

    // Prepare recent submissions
    const recentSubmissions = submissions.slice(0, 10).map(sub => ({
      _id: sub._id,
      problemId: sub.problemId,
      problemName: sub.problemTitle || "Unknown Problem",
      difficulty: sub.problemDifficulty || "Unknown",
      language: sub.language,
      result: sub.status,
      submittedAt: sub.submittedAt,
      points: sub.point || 0
    }));

    res.json({
      success: true,
      totalSolved,
      totalPoints,
      successRate,
      currentStreak,
      rank: userRank,
      recentSubmissions,
      favoriteLanguage,
      problemsSolvedToday
    });

  } catch (error) {
    console.error("Error fetching user dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard data"
    });
  }
});


// GET top users for leaderboard (REAL implementation)
router.get("/leaderboard/top", async (req, res) => {
  try {
    const db = await connectDB();
    const submissionsCollection = db.collection("submissions");
    const usersCollection = db.collection("users");

    console.log("🔍 Fetching real leaderboard data...");

    // Get all users first
    const allUsers = await usersCollection.find({}).toArray();
    console.log(`👥 Found ${allUsers.length} users in database`);

    // Calculate stats for each user from their submissions
    const usersWithStats = await Promise.all(
      allUsers.map(async (user) => {
        try {
          // Get user's submissions
          const userSubmissions = await submissionsCollection
            .find({ userEmail: user.userEmail })
            .toArray();

          console.log(`📊 ${user.userEmail} has ${userSubmissions.length} submissions`);

          // Calculate statistics
          const totalPoints = userSubmissions.reduce((sum, sub) => sum + (sub.point || 0), 0);
          const totalSolved = userSubmissions.filter(sub => sub.status === "Success").length;
          const totalFailures = userSubmissions.filter(sub => sub.status === "Failure").length;

          return {
            userEmail: user.userEmail,
            userName: user.userName,
            totalPoints: totalPoints,
            totalSolved: totalSolved,
            totalFailures: totalFailures,
            avatarUrl: user.userImage || "",
            submissionCount: userSubmissions.length // for debugging
          };
        } catch (error) {
          console.error(`Error processing user ${user.userEmail}:`, error);
          return {
            userEmail: user.userEmail,
            userName: user.userName,
            totalPoints: 0,
            totalSolved: 0,
            totalFailures: 0,
            avatarUrl: user.userImage || "",
            submissionCount: 0,
            error: error.message
          };
        }
      })
    );

    // Filter out users with no activity and sort by points
    const activeUsers = usersWithStats.filter(user =>
      user.totalPoints > 0 || user.totalSolved > 0
    );

    console.log(`🏆 ${activeUsers.length} active users found`);

    // Sort by total points (descending) and take top 4
    const topUsers = activeUsers
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 4);

    console.log("🎯 Top users:", topUsers);

    // If we have real users with data, return them
    if (topUsers.length > 0) {
      return res.json({
        success: true,
        leaderboard: topUsers,
        source: "real_data",
        totalUsers: allUsers.length,
        activeUsers: activeUsers.length
      });
    }

    // If no active users, try to return all users with default stats
    if (allUsers.length > 0) {
      const fallbackUsers = allUsers.slice(0, 4).map((user, index) => ({
        userEmail: user.userEmail,
        userName: user.userName,
        totalPoints: Math.max(100, 1000 - (index * 200)),
        totalSolved: Math.max(5, 30 - (index * 5)),
        totalFailures: Math.max(1, 5 + index),
        avatarUrl: user.userImage || "",
        source: "fallback_stats"
      }));

      console.log("🔄 Using fallback stats for users");

      return res.json({
        success: true,
        leaderboard: fallbackUsers,
        source: "fallback_data",
        totalUsers: allUsers.length
      });
    }

    // Ultimate fallback to mock data
    console.log("⚠️ No users found in database, using mock data");
    const mockTopUsers = [
      {
        userEmail: "admin@example.com",
        userName: "Code Master",
        totalPoints: 1250,
        totalSolved: 45,
        totalFailures: 5,
        avatarUrl: ""
      },
      {
        userEmail: "user1@example.com",
        userName: "Algorithm Pro",
        totalPoints: 980,
        totalSolved: 32,
        totalFailures: 8,
        avatarUrl: ""
      },
      {
        userEmail: "user2@example.com",
        userName: "Data Wizard",
        totalPoints: 760,
        totalSolved: 28,
        totalFailures: 12,
        avatarUrl: ""
      },
      {
        userEmail: "user3@example.com",
        userName: "Logic Genius",
        totalPoints: 650,
        totalSolved: 25,
        totalFailures: 15,
        avatarUrl: ""
      }
    ];

    res.json({
      success: true,
      leaderboard: mockTopUsers,
      source: "mock_data"
    });

  } catch (error) {
    console.error("❌ Error in leaderboard:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching leaderboard",
      error: error.message
    });
  }
});

module.exports = router;
