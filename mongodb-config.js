// mongodb-config.js
const mongoose = require('mongoose');

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kaviduinduwara:kavidu2008@cluster0.bqmspdf.mongodb.net/soloBot?retryWrites=true&w=majority&appName=Cluster0';
const MONGO_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  sessionId: { type: String },
  sessionData: { type: Object },
  settings: { type: Object, default: {} },
  isActive: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + MONGO_SESSION_TTL) }
});

// Index for better performance
sessionSchema.index({ number: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ lastActive: -1 });

const userSettingsSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  settings: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// MongoDB Models
const Session = mongoose.model('Session', sessionSchema);
const UserSettings = mongoose.model('UserSettings', userSettingsSchema);

// MongoDB Helper Functions
async function saveSessionToMongo(number, sessionData) {
  try {
    const session = await Session.findOneAndUpdate(
      { number: number },
      {
        $set: {
          sessionId: sessionData.sessionId,
          sessionData: sessionData.sessionData,
          settings: sessionData.settings || {},
          isActive: true,
          lastActive: new Date(),
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + MONGO_SESSION_TTL)
        }
      },
      { upsert: true, new: true }
    );
    
    console.log(`💾 Session saved to MongoDB for: ${number}`);
    return session;
  } catch (error) {
    console.error(`❌ Error saving session to MongoDB for ${number}:`, error);
    return null;
  }
}

async function loadSessionFromMongo(number) {
  try {
    const session = await Session.findOne({ number: number });
    if (session && session.sessionData) {
      console.log(`📂 Session loaded from MongoDB for: ${number}`);
      return {
        sessionId: session.sessionId,
        sessionData: session.sessionData,
        settings: session.settings || {}
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Error loading session from MongoDB for ${number}:`, error);
    return null;
  }
}

async function deleteSessionFromMongo(number) {
  try {
    await Session.deleteOne({ number: number });
    await UserSettings.deleteOne({ number: number });
    console.log(`🗑️ Session deleted from MongoDB for: ${number}`);
  } catch (error) {
    console.error(`❌ Error deleting session from MongoDB for ${number}:`, error);
  }
}

async function saveUserSettingsToMongo(number, settings) {
  try {
    await UserSettings.findOneAndUpdate(
      { number: number },
      {
        $set: {
          settings: settings,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );
    
    console.log(`⚙️ User settings saved to MongoDB for: ${number}`);
  } catch (error) {
    console.error(`❌ Error saving user settings to MongoDB for ${number}:`, error);
  }
}

async function loadUserSettingsFromMongo(number) {
  try {
    const settingsDoc = await UserSettings.findOne({ number: number });
    if (settingsDoc) {
      return settingsDoc.settings;
    }
    
    // Return default settings if none found
    return getDefaultSettings();
  } catch (error) {
    console.error(`❌ Error loading user settings from MongoDB for ${number}:`, error);
    return getDefaultSettings();
  }
}

function getDefaultSettings() {
  return {
    autoswview: true,
    autoswlike: true,
    autoread: true,
    online: true,
    worktype: 'public',
    welcomeMessage: "Welcome to SILA MD MINI Bot!",
    autoJoinGroup: true,
    autoFollowChannel: true
  };
}

async function getAllSessions() {
  try {
    const sessions = await Session.find({ isActive: true });
    return sessions.map(session => ({
      number: session.number,
      sessionId: session.sessionId,
      lastActive: session.lastActive
    }));
  } catch (error) {
    console.error('❌ Error getting all sessions from MongoDB:', error);
    return [];
  }
}

async function updateSessionActivity(number) {
  try {
    await Session.findOneAndUpdate(
      { number: number },
      {
        $set: {
          lastActive: new Date(),
          updatedAt: new Date()
        }
      }
    );
  } catch (error) {
    console.error(`❌ Error updating session activity for ${number}:`, error);
  }
}

module.exports = {
  mongoose,
  Session,
  UserSettings,
  saveSessionToMongo,
  loadSessionFromMongo,
  deleteSessionFromMongo,
  saveUserSettingsToMongo,
  loadUserSettingsFromMongo,
  getAllSessions,
  updateSessionActivity
};
