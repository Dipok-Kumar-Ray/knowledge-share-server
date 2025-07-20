const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const serviceAccount = require("./firebase/serviceAccountKey.json");
const app = express();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

//middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://unique-sable-76ac89.netlify.app",
    ],
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oclat4d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const articlesCollection = client.db("eduHive").collection("articles");

    // Create a user
    app.get("/articles", async (req, res) => {
      // const cursor = articlesCollection.find();
      // const result = await cursor.toArray();
      const result = await articlesCollection.find().toArray();
      res.send(result);
    });

    // Get article (safe fallback for arrays)
    app.patch("/userLike/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { userEmail } = req.body;

        if (!userEmail)
          return res.status(400).send({ message: "userEmail required" });

        if (req.decoded.email !== userEmail) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const article = await articlesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!article)
          return res.status(404).send({ message: "Article not found" });

        const alreadyLiked = article.likes.includes(userEmail);
        const update = alreadyLiked
          ? { $pull: { likes: userEmail } }
          : { $addToSet: { likes: userEmail } };

        const result = await articlesCollection.updateOne(
          { _id: new ObjectId(id) },
          update
        );

        // Send back a success response with updated like status (optional)
        res.send({ modifiedCount: result.modifiedCount, liked: !alreadyLiked });
      } catch (error) {
        res.status(500).send({ message: "Server error", error });
      }
    });

    // Add comment (strict validation)
    app.patch("/comments/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { comment } = req.body;

        // Validate comment structure
        if (
          !comment ||
          typeof comment !== "object" ||
          typeof comment.email !== "string" ||
          typeof comment.text !== "string" ||
          typeof comment.displayName !== "string" // 👈 এটাও validate করো
        ) {
          return res.status(400).send({ message: "Invalid comment format" });
        }

        const result = await articlesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { comments: comment } }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error", error });
      }
    });

    app.get("/myArticles", async (req, res) => {
      const email = req.query.email;

      const myTutorials = await articlesCollection
        .find({ authorEmail: email })
        .toArray();
      res.send(myTutorials);
    });

    // Create new post article
    app.post("/articles", verifyToken, async (req, res) => {
      const article = req.body;
      const result = await articlesCollection.insertOne(article);
      res.send(result);
    });

    // Delete an article by id
    app.delete("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await articlesCollection.deleteOne(query);
      res.send(result);
    });

    //update an article by id
    app.put("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedArticle = req.body;
      const options = { upsert: true };
      const updateDoc = {
        $set: updatedArticle,
      };
      const result = await articlesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // GET /articles with optional category & tag filters
    router.get("/articles", verifyToken, async (req, res) => {
      try {
        const { category, tag } = req.query;

        // Build filter object
        let filter = {};
        if (category) {
          filter.category = category;
        }
        if (tag) {
          filter.tags = tag; // assuming tags is an array field
        }

        const articles = await Article.find(filter).sort({ date: -1 });
        res.status(200).json(articles);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch articles" });
      }
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("EduHive API is running");
});

app.listen(port, () => {
  console.log(`EduHive API is running on port : ${port}`);
});
