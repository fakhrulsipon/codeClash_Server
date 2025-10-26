const admin = require("firebase-admin");

const serviceAccount = require("../firebase-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const verifyFBToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    // console.log(authHeader)

   if(!authHeader) {
    return res.status(401).send({message: 'unauthorized access'})
   }

    const token = authHeader.split(" ")[1];
   if(!token) {
    return res.status(401).send({message: 'unauthorized access'})
   }

    // verify the token
    
    try{
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
    }
    catch (error) {
        return res.status(403).send({message: 'forbidden access'})
    }

    
  } catch (error) {
    console.error("❌ Firebase token verification failed:", error);
    res.status(403).json({ message: "Invalid or expired token" });
  }
};

module.exports = { verifyFBToken };
