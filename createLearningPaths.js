require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oclat4d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri);

async function createSampleLearningPaths() {
  try {
    await client.connect();
    const db = client.db("eduHive");
    const articlesCollection = db.collection("articles");
    const learningPathsCollection = db.collection("learningPaths");

    // Get some sample articles to create learning paths
    const articles = await articlesCollection.find({}).limit(10).toArray();
    
    if (articles.length === 0) {
      console.log("No articles found in database. Please add some articles first.");
      return;
    }

    // Create sample learning paths
    const learningPaths = [
      {
        title: "Beginner's Guide to Programming",
        description: "Start your programming journey with these foundational articles",
        category: "Tech",
        difficulty: "Beginner",
        estimatedHours: 10,
        articleSequence: articles.slice(0, 3).map(article => article._id.toString()),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: "Advanced Web Development",
        description: "Take your web development skills to the next level",
        category: "Tech",
        difficulty: "Advanced",
        estimatedHours: 15,
        articleSequence: articles.slice(3, 6).map(article => article._id.toString()),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: "Data Science Fundamentals",
        description: "Learn the basics of data science and analytics",
        category: "Tech",
        difficulty: "Intermediate",
        estimatedHours: 12,
        articleSequence: articles.slice(6, 9).map(article => article._id.toString()),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Insert learning paths into database
    const result = await learningPathsCollection.insertMany(learningPaths);
    console.log(`Inserted ${result.insertedCount} learning paths`);
    
    // Display the created learning paths
    const createdPaths = await learningPathsCollection.find({}).toArray();
    console.log("Created learning paths:");
    createdPaths.forEach(path => {
      console.log(`- ${path.title} (${path.difficulty})`);
    });
  } catch (error) {
    console.error("Error creating learning paths:", error);
  } finally {
    await client.close();
  }
}

createSampleLearningPaths().catch(console.error);