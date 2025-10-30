const express = require("express");
const { ObjectId } = require("mongodb");
const { connectDB } = require("../db");

const router = express.Router();

// GET admin dashboard statistics - SIMPLIFIED VERSION
router.get("/dashboard", async (req, res) => {
  let db;
  try {
    console.log("📊 Starting admin dashboard data fetch...");
    
    db = await connectDB();
    if (!db) {
      throw new Error("Database connection failed");
    }

    // Get basic counts with error handling for each collection
    const collections = {
      users: db.collection("users"),
      problems: db.collection("problems"), 
      contests: db.collection("contests"),
      teams: db.collection("teams"),
      submissions: db.collection("submissions"),
      contestParticipants: db.collection("contestParticipants")
    };

    // Count documents in each collection
    const counts = {};
    for (const [key, collection] of Object.entries(collections)) {
      try {
        counts[key] = await collection.countDocuments();
        console.log(`✅ ${key}: ${counts[key]}`);
      } catch (error) {
        console.error(`❌ Error counting ${key}:`, error.message);
        counts[key] = 0;
      }
    }

    // Get today's submissions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let todaySubmissions = 0;
    try {
      todaySubmissions = await collections.submissions.countDocuments({
        submittedAt: {
          $gte: today,
          $lt: tomorrow
        }
      });
    } catch (error) {
      console.error("Error counting today's submissions:", error.message);
    }

    // Get accepted submissions
    let acceptedSubmissions = 0;
    try {
      acceptedSubmissions = await collections.submissions.countDocuments({ 
        status: "Accepted" 
      });
    } catch (error) {
      console.error("Error counting accepted submissions:", error.message);
    }

    // Calculate acceptance rate
    const acceptanceRate = counts.submissions > 0 
      ? parseFloat(((acceptedSubmissions / counts.submissions) * 100).toFixed(1))
      : 0;

    // Get recent submissions
    let recentSubmissions = [];
    try {
      recentSubmissions = await collections.submissions.find()
        .sort({ submittedAt: -1 })
        .limit(5)
        .toArray();
    } catch (error) {
      console.error("Error fetching recent submissions:", error.message);
    }

    // Format recent submissions
    const formattedRecentSubmissions = recentSubmissions.map(sub => ({
      _id: sub._id?.toString() || 'unknown',
      userId: sub.userId || sub.userEmail || "Unknown",
      userName: sub.userName || "Unknown User",
      problemId: sub.problemId || "N/A",
      problemName: sub.problemTitle || "Unknown Problem",
      language: sub.language || "Unknown",
      result: sub.status || "Unknown",
      submittedAt: sub.submittedAt || new Date()
    }));

    // Get active users (last 1 hour)
    let activeUsers = 0;
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const activeUserEmails = await collections.submissions.distinct("userEmail", {
        submittedAt: {
          $gte: oneHourAgo
        }
      });
      activeUsers = activeUserEmails.length;
    } catch (error) {
      console.error("Error counting active users:", error.message);
    }

    // Get top language
    let topLanguage = "N/A";
    try {
      const languageStats = await collections.submissions.aggregate([
        {
          $match: {
            language: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: "$language",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]).toArray();

      topLanguage = languageStats.length > 0 ? languageStats[0]._id : "N/A";
    } catch (error) {
      console.error("Error getting top language:", error.message);
    }

    const response = {
      totalUsers: counts.users,
      totalProblems: counts.problems,
      totalContests: counts.contests,
      totalTeams: counts.teams,
      submissionsToday: todaySubmissions,
      acceptanceRate: acceptanceRate,
      activeUsers: activeUsers,
      pendingReviews: 0, // You can implement this later
      avgSolveTime: "0m 0s", // Mock data for now
      topLanguage: topLanguage,
      userGrowth: 0, // You can implement this later
      submissionGrowth: 0, // You can implement this later
      recentSubmissions: formattedRecentSubmissions
    };

    console.log("✅ Dashboard data fetched successfully:", response);
    res.json(response);

  } catch (error) {
    console.error("❌ CRITICAL ERROR in admin dashboard:", error);
    
    // Return fallback data
    const fallbackResponse = {
      totalUsers: 0,
      totalProblems: 0,
      totalContests: 0,
      totalTeams: 0,
      submissionsToday: 0,
      acceptanceRate: 0,
      activeUsers: 0,
      pendingReviews: 0,
      avgSolveTime: "0m 0s",
      topLanguage: "N/A",
      userGrowth: 0,
      submissionGrowth: 0,
      recentSubmissions: [],
      error: error.message
    };
    
    res.status(500).json(fallbackResponse);
  }
});

// Debug endpoint to check database state
router.get("/debug", async (req, res) => {
  try {
    const db = await connectDB();
    
    const collections = [
      "users", "problems", "submissions", "contests", 
      "teams", "contestParticipants"
    ];

    const results = {};

    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        const sample = await collection.find().limit(1).toArray();
        
        results[collectionName] = {
          count,
          sample: sample.length > 0 ? "Data exists" : "No data",
          fields: sample.length > 0 ? Object.keys(sample[0]) : []
        };
      } catch (error) {
        results[collectionName] = { 
          error: error.message,
          count: 0
        };
      }
    }

    res.json({
      success: true,
      database: "Connected",
      collections: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;