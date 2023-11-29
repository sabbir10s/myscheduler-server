const router = require("express").Router();
const { google } = require("googleapis");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.y46qz7a.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const GOOGLE_CLIENT_ID =
  "246190552758-iv4qnbua1chul41b87mfch0gsoeqe8bj.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  "https://myscheduler-893bf.web.app"
  // "http://localhost:3000"
);

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Access forbidden" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  await client.connect();
  const usersCollection = client.db("MyScheduler").collection("users");
  const bookingConfirmCollection = client
    .db("MyScheduler")
    .collection("bookingConfirm");

  router.get("/", async (req, res, next) => {
    res.send({ message: "Ok api is working 🚀" });
  });

  router.post("/create-tokens", async (req, res, next) => {
    try {
      const { code } = req.body;
      const { tokens } = await oauth2Client.getToken(code);
      res.send(tokens);
    } catch (error) {
      next(error);
    }
  });

  router.post("/create-event", async (req, res, next) => {
    try {
      const { bookingConfirm, hostEmail } = req.body;
      const filter = { email: hostEmail };
      const user = await usersCollection.findOne(filter);
      const { refreshToken } = user;
      const { summary, description, email, startTime, endTime } =
        bookingConfirm;
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const calendar = google.calendar("v3");
      const response = await calendar.events.insert({
        auth: oauth2Client,
        calendarId: "primary",
        conferenceDataVersion: 1,
        sendNotifications: true,
        requestBody: {
          summary: summary,
          description: description,
          colorId: "7",
          start: {
            dateTime: startTime,
          },
          end: {
            dateTime: endTime,
          },
          attendees: [{ email: email }],
          conferenceData: {
            createRequest: {
              requestId: "sample123",
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        },
      });
      res.send(response);
    } catch (error) {
      next(error);
    }
  });

  // store confirm event in database
  router.post("/createConfirmEvent", async (req, res, next) => {
    try {
      const {
        eventName,
        hostEmail,
        inviteeName,
        inviteeEmail,
        inviteeMessage,
        date,
        eventStartTime,
        eventEndTime,
        eventLocation,
      } = req.body;
      const addDoc = {
        eventName: eventName,
        hostEmail: hostEmail,
        inviteeName: inviteeName,
        inviteeEmail: inviteeEmail,
        inviteeMessage: inviteeMessage,
        date: date,
        eventStartTime: eventStartTime,
        eventEndTime: eventEndTime,
        eventLocation: eventLocation,
      };
      const result = await bookingConfirmCollection.insertOne(addDoc);
      res.send(result);
    } catch (error) {
      next(error);
    }
  });

  // get a user booked events
  router.get("/bookedEvents/:email", verifyJWT, async (req, res) => {
    const email = req.params.email;
    const filter = { hostEmail: email };
    const result = await bookingConfirmCollection.find(filter).toArray();
    res.send(result);
  });
  // delete single booked events
  router.delete("/bookedEventDelete/:id", verifyJWT, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: ObjectId(id) };
    const result = await bookingConfirmCollection.deleteOne(filter);
    res.send(result);
  });
  // get all booked events
  router.get("/allBookedEvents", async (req, res) => {
    const result = await (await bookingConfirmCollection.find({}).toArray()).reverse();
    res.send(result);
  });
}
run().catch(console.dir);

module.exports = router;
