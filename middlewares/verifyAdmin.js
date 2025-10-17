const { connectDB } = require("../db");

const verifyAdmin = async (req, res, next) => {
  try {
   
    const email = req.decoded?.email;
    console.log(email)
    if (!email) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    
    const db = await connectDB();
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ email });

    // Check admin role
    if (!user || user.role !== "admin") {
      return res.status(403).send({ message: "forbidden access" });
    }

    next();
  } catch (error) {
    console.error("❌ verifyAdmin middleware error:", error);
    res.status(500).send({ message: "internal server error" });
  }
};

module.exports = { verifyAdmin };
